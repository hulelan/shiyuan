#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
import_canon.py — 按 data/curated/canon_poets.json 补齐正典。

    ./.venv/bin/python tools/import_canon.py --fetch      # 只下载上游（约 180 MB，有缓存）
    ./.venv/bin/python tools/import_canon.py              # 试运行，看会导入什么
    ./.venv/bin/python tools/import_canon.py --write      # 落盘

要解决的事：站上没有《长恨歌》《琵琶行》《念奴娇·赤壁怀古》，苏轼只有一篇。
当初导入取的是上游文件开头的若干条，取到哪儿算哪儿，于是唐诗那两千篇里
三分之二是宫廷祭祀乐章。这个脚本按人挑、按热度挑，把该有的补上。

只写原文层，绝不碰 data/enrich/ —— 新篇目在编辑层只留一条空记录。

--------------------------------------------------------------------
挑哪几首：靠选本，不靠搜索热度
--------------------------------------------------------------------
上游确实自带热度榜（rank/，与诗文按下标一一对应，四部各抽一份全量核对过，
1000/1000 对齐）。**但它不能用来挑正典。**

那五个数字是拿"作者 + 标题"去搜索引擎问来的命中数，量的是
**标题这个字符串在网上有多常见**，不是这首诗有多有名。于是白居易名下
排在最前的是《不出》《老去》《人定》《禁中》《城上》这些两三字的题 ——
因为那都是常用词，随便一搜几百万条。而《长恨歌》排到第 1175 位（共 2983 首）。
换成取最好名次、中位名次、限定题目字数，都救不回来：
限定题目至少四字，头一个被排除的就是《长恨歌》和《琵琶引》本身。

所以改用选本：

    全唐诗/唐诗三百首.json    366 首
    宋词/宋词三百首.json      280 首

这是几百年公认的选目，《长恨歌》《琵琶引》《念奴娇》《声声慢》都在里面。
选本之外仍要补的，列在 data/curated/canon_must.json —— 那是人定的名单，
挑正典这件事没有捷径。宋诗尤其需要：上游没有对应的选本。

canon_poets.json 里的 cap（李白 90、杜甫 90…）现在是**上限**而非目标：
选本加名单给到多少就是多少，不再拿热度榜去凑数 ——
凑进来的是《不出》《老去》，不如不凑。

--------------------------------------------------------------------
两道去重
--------------------------------------------------------------------
只按 stable_id（作者|标题|去空白原文）去重是不够的，那只认一字不差。
上游同一首诗常有两条：《杂曲歌辞 蜀道难》与《蜀道难》。
所以第二道用 relevance_lib.overlap() 看二元组覆盖率，
新旧之间、以及本批内部，都要过这道闸。
"""

import argparse
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import corpus_lib as CL
import relevance_lib as R

from pypinyin import lazy_pinyin, Style
import opencc

T2S = opencc.OpenCC("t2s")
RAW = "https://raw.githubusercontent.com/chinese-poetry/chinese-poetry/master/"
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".cache", "canon")

# 上游三部。step/count 是文件编号的步长与个数（poet.tang.0.json … 57000）
COLLECTIONS = {
    "唐诗": {"coll": "唐诗", "poems": "全唐诗/poet.tang.%d.json",
             "n": 58, "trad": True, "genre": "诗", "dynasty": "唐", "titlekey": "title"},
    "宋诗": {"coll": "宋诗", "poems": "全唐诗/poet.song.%d.json",
             "n": 255, "trad": True, "genre": "诗", "dynasty": "宋", "titlekey": "title"},
    "宋词": {"coll": "宋词", "poems": "宋词/ci.song.%d.json",
             "n": 22, "trad": False, "genre": "词", "dynasty": "宋", "titlekey": "rhythmic"},
}
# 选本。这是挑篇目的主力，全集只用来按名单捞人。
ANTHOLOGIES = [
    {"path": "全唐诗/唐诗三百首.json", "coll": "唐诗", "trad": True,
     "genre": "诗", "dynasty": "唐", "titlekey": "title", "name": "唐诗三百首"},
    {"path": "宋词/宋词三百首.json", "coll": "宋词", "trad": False,
     "genre": "词", "dynasty": "宋", "titlekey": "rhythmic", "name": "宋词三百首"},
    # 李煜不在《全唐诗》里 —— 他是南唐后主，上游单独放在 五代诗词/nantang/。
    # 四十一首是他传世词的大半，整本收。只取正文，随文的注释不要：
    # 本层只放公有领域原文，注释归编辑层，由 enrich 生成。
    {"path": "五代诗词/nantang/poetrys.json", "coll": "南唐", "trad": False,
     "genre": "词", "dynasty": "五代", "titlekey": "rhythmic", "name": "南唐二主词"},
]

# 篇幅上限放宽到 1500 字。原先是 360 —— 《长恨歌》(840)、《琵琶行》(616)、
# 《茅屋为秋风所破歌》缺席就是因为这一条，不是因为没导。
# 1500 收得下唐人歌行的绝大多数；《离骚》约 2400 字仍在外，那是另一种东西，
# 真要收得单独处理版式。
MAX_CHARS = 1500
MIN_CHARS = 8

# 归属与上游文件不一致的几位。李煜在《全唐诗》里，但他是南唐后主。
DYNASTY_FIX = {"李煜": ("五代", 7), "韦庄": ("唐", 6), "李清照": ("宋", 8),
               "文天祥": ("宋", 8), "寒山": ("唐", 6)}

PLACEHOLDER = re.compile(r"[□■]")


def fetch(path):
    os.makedirs(CACHE, exist_ok=True)
    fn = os.path.join(CACHE, path.replace("/", "_"))
    if os.path.exists(fn):
        with open(fn, encoding="utf-8") as f:
            return json.load(f)
    url = RAW + urllib.parse.quote(path)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    data = urllib.request.urlopen(req, timeout=180).read().decode("utf-8")
    obj = json.loads(data)
    with open(fn, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False)
    return obj


def files_of(spec):
    """上游文件按 1000 编号：poet.tang.0.json、poet.tang.1000.json…"""
    return [spec["poems"] % (i * 1000) for i in range(spec["n"])]


def ci_title(tune, first_line):
    """
    词题用「词牌·首句」。上游只给词牌，于是库里现有 28 首都叫《木兰花・玉楼春》，
    列表上根本分不开哪首是哪首。首句是辨认一首词最通行的办法。
    """
    head = PLACEHOLDER.sub("", first_line or "").strip()
    head = re.split(r"[，。！？；、]", head)[0][:9]
    return tune + ("·" + head if head else "")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fetch", action="store_true", help="只下载上游文件后退出")
    ap.add_argument("--write", action="store_true", help="真正落盘")
    ap.add_argument("--only", help="只处理某一部：唐诗 / 宋诗 / 宋词")
    args = ap.parse_args()

    plan = json.load(open(os.path.join(CL.DATA, "curated", "canon_poets.json"),
                          encoding="utf-8"))
    wanted = {k: v for k, v in plan.items() if not k.startswith("_")}
    if args.only:
        wanted = {args.only: wanted[args.only]}

    # ---- 下载。缓存齐了就是空转，所以不做成单独的步骤 ----
    need = [a["path"] for a in ANTHOLOGIES
            if not args.only or a["coll"] == args.only]
    for coll in wanted:
        spec = COLLECTIONS[coll]
        need += files_of(spec)
    for coll in [None]:
        todo = [p for p in need
                if not os.path.exists(os.path.join(CACHE, p.replace("/", "_")))]
        if todo:
            print("下载 %d 个文件…" % len(todo))
            for i, p in enumerate(todo, 1):
                fetch(p)
                if i % 40 == 0 or i == len(todo):
                    print("  %d/%d" % (i, len(todo)))
        else:
            print("上游文件：缓存已齐")
    if args.fetch:
        return

    src = CL.load_source()
    on_site = defaultdict(int)
    for r in src.values():
        on_site[r["author"]] += 1
    print("\n本站现有 %d 篇" % len(src))

    picks = []

    def make(rec, spec, why, anth=""):
        """把一条上游记录整成候选。滤掉太长太短、以及词牌被截断的。"""
        au = (rec.get("author") or "").strip()
        rt = (rec.get(spec["titlekey"]) or "").strip()
        lines = rec.get("paragraphs") or []
        if spec["trad"]:
            au, rt = T2S.convert(au), T2S.convert(rt)
            lines = [T2S.convert(x) for x in lines]
        lines = [PLACEHOLDER.sub("", x).strip() for x in lines]
        lines = [x for x in lines if x]
        if not au or not rt or not lines:
            return None
        if spec["genre"] == "词" and len(rt) < 2:
            return None          # 上游把牌名截断了（《大酺》成《大》）
        text = "\n".join(lines)
        n = len(re.sub(r"\s", "", text))
        if n < MIN_CHARS or n > MAX_CHARS:
            return None
        title = ci_title(rt, lines[0]) if spec["genre"] == "词" else rt
        return {"title": title, "raw_title": rt, "author": au, "text": text,
                "coll": spec["coll"], "genre": spec["genre"],
                "dynasty": spec["dynasty"], "why": why, "anth": anth}

    # ---- 一、选本：整本收 ----
    # 这几百首是几百年的公认选目，不按作者名单筛 ——
    # 选本里有而 canon_poets.json 里没有的作者，本来就该进来。
    for a in ANTHOLOGIES:
        try:
            recs = fetch(a["path"])
        except Exception as e:
            print("选本 %s 取不到：%s" % (a["name"], e))
            continue
        got = 0
        for rec in recs:
            c = make(rec, a, "选本", a["name"])
            if c:
                picks.append(c)
                got += 1
        print("选本 %s：%d / %d 首" % (a["name"], got, len(recs)))

    # ---- 二、名单：去全集里捞 ----
    must = json.load(open(os.path.join(CL.DATA, "curated", "canon_must.json"),
                          encoding="utf-8"))
    want = defaultdict(list)          # coll -> [(作者, 题名片段)]
    for coll, poets in must.items():
        if coll.startswith("_"):
            continue
        if args.only and coll != args.only:
            continue
        for au, titles in poets.items():
            for t in titles:
                # 一条可以写成 "题名"，也可以写成 ["题名", "首句片段"]。
                # 后者是必需的：陆游名下有八首都叫《示儿》，
                # 光凭题名取到的是《示儿子》，不是"死去元知万事空"那一首。
                if isinstance(t, list):
                    want[coll].append((au, t[0], t[1]))
                else:
                    want[coll].append((au, t, ""))
    if want:
        print("\n名单：%d 条，去全集里捞…" % sum(len(v) for v in want.values()))
    # 名单里有一批本来就在选本内（《送元二使安西》《清明》都在唐诗三百首）。
    # 先把这些划掉，免得最后报一串其实已经收了的"没捞到"。
    found = set()
    for c in picks:
        for coll, pairs in want.items():
            for a2, frag, line in pairs:
                if c["author"] == a2 and frag in c["title"] \
                        and (not line or line in c["text"]):
                    found.add((a2, frag, line))
    if found:
        print("  其中 %d 条选本里已有" % len(found))
    for coll, pairs in want.items():
        spec = COLLECTIONS[coll]
        names = {a for a, _, _ in pairs}
        pf = files_of(spec)
        for k, pfile in enumerate(pf):
            try:
                P = fetch(pfile)
            except Exception:
                continue
            for rec in P:
                au = (rec.get("author") or "").strip()
                if spec["trad"]:
                    au = T2S.convert(au)
                if au not in names:
                    continue
                rt = (rec.get(spec["titlekey"]) or "").strip()
                if spec["trad"]:
                    rt = T2S.convert(rt)
                for a2, frag, line in pairs:
                    if a2 != au or frag not in rt or (a2, frag, line) in found:
                        continue
                    c = make(rec, spec, "名单")
                    if not c:
                        continue
                    # 指定了首句就必须对上；八首《示儿》只有一首是要的那首
                    if line and line not in c["text"]:
                        continue
                    picks.append(c)
                    found.add((a2, frag, line))
                    break
            if (k + 1) % 80 == 0:
                print("  %s %d/%d" % (coll, k + 1, len(pf)))
    missing = [(a, t, l) for pairs in want.values() for a, t, l in pairs
               if (a, t, l) not in found]
    print("名单捞到 %d 条" % len(found))
    if missing:
        print("  没捞到的 %d 条（上游可能不收、或题名不同）：" % len(missing))
        for a, t, l in missing[:14]:
            print("     %s《%s》%s" % (a, t, ("  首句「%s」" % l) if l else ""))

    print("\n拟取合计 %d 篇" % len(picks))

    # ---- 两道去重：对已有语料，以及本批内部 ----
    have_ids = set(src)
    have_texts = [(r["id"], r["text"]) for r in src.values()]
    # 按首二字分桶，避免每条都跟四千条比一遍
    bykey = defaultdict(list)
    for pid, t in have_texts:
        bykey[re.sub(r"\s", "", t)[:2]].append((pid, t))

    fresh, dropped = [], defaultdict(int)
    batch = []
    for c in picks:
        pid = CL.stable_id(c["author"], c["title"], c["text"])
        if pid in have_ids:
            dropped["站上已有（id 相同）"] += 1
            continue
        head = re.sub(r"\s", "", c["text"])[:2]
        dup = False
        for _, t in bykey.get(head, ()):
            if R.overlap(c["text"], t) >= 0.82:
                dropped["站上已有（字面重合）"] += 1
                dup = True
                break
        if dup:
            continue
        for b in batch:
            if b[0][:2] == head and R.overlap(c["text"], b[1]) >= 0.82:
                dropped["本批内部重复"] += 1
                dup = True
                break
        if dup:
            continue
        batch.append((head, c["text"]))
        c["id"] = pid
        have_ids.add(pid)
        fresh.append(c)

    for k, v in dropped.items():
        print("  去重扣掉 %s：%d" % (k, v))
    print("实际新增 %d 篇" % len(fresh))

    if not fresh:
        print("\n没有可新增的。")
        return

    # ---- 成记录 ----
    def pinyin_of(text):
        out = []
        for line in text.split("\n"):
            toks = lazy_pinyin(line, style=Style.TONE, errors=lambda x: list(x))
            out.append(" ".join(t for t in toks if t.strip()))
        return "\n".join(out)

    recs = []
    for c in fresh:
        dyn, order = DYNASTY_FIX.get(c["author"], (c["dynasty"], None))
        if order is None:
            order = CL.ORDER[dyn]
        form = ""
        if c["genre"] == "词":
            form = "词·" + R.SEP.sub("·", c["raw_title"]).split("·")[0]
        recs.append({
            "id": c["id"], "title": c["title"], "author": c["author"],
            "dynasty": dyn, "dynastyOrder": order,
            "year": None, "yearLabel": "", "form": form, "genre": c["genre"],
            "text": c["text"], "pinyin": pinyin_of(c["text"]),
            "source": "chinese-poetry", "curated": False,
        })

    longest = sorted(recs, key=lambda r: -len(re.sub(r"\s", "", r["text"])))[:8]
    print("\n新增里最长的几篇：")
    for r in longest:
        print("   %4d 字  %s《%s》%s"
              % (len(re.sub(r"\s", "", r["text"])), r["dynasty"], r["title"], r["author"]))

    famous = ["长恨歌", "琵琶行", "念奴娇", "声声慢", "茅屋为秋风", "岳阳楼",
              "醉翁亭", "赤壁", "水调歌头", "永遇乐", "满江红", "游山西村"]
    hit = [r for r in recs if any(f in r["title"] for f in famous)]
    if hit:
        print("\n名篇进来了：")
        for r in hit[:14]:
            print("   %s《%s》%s" % (r["dynasty"], r["title"], r["author"]))

    if not args.write:
        print("\n（试运行。加 --write 才会落盘。）")
        return

    merged = list(src.values()) + recs
    ns = CL.save_layer(CL.SOURCE_DIR, merged, CL.SOURCE_FIELDS)
    enr = CL.load_enrich()
    for r in recs:
        enr.setdefault(r["id"], {"id": r["id"]})["_slug"] = CL.SLUG[r["dynasty"]]
    for pid, e in enr.items():
        if pid in {x["id"] for x in merged}:
            e.setdefault("_slug", CL.SLUG[
                next(x["dynasty"] for x in merged if x["id"] == pid)])
    print("\n原文层写入：", ns)
    print("总计 %d 篇（原 %d，新增 %d）" % (len(merged), len(src), len(recs)))
    print("\n接着跑：")
    print("  ./.venv/bin/python tools/build_site_data.py")
    print("  ./.venv-ml/bin/python tools/embed_corpus.py")
    print("  ./.venv/bin/python tools/build_relevance.py")
    print("  ./.venv/bin/python tools/enrich_glm.py --dry-run   # 看新篇目的译注开销")


if __name__ == "__main__":
    main()
