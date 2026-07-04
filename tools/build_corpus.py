#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_corpus.py — 从 chinese-poetry 开源库拉取原文，转简体、生成拼音，
产出本项目 schema 的 data/corpus.js（window.POEMS_IMPORTED）。

只处理【原文】层（公有领域）。译文/注释/赏析/英译/主题/地点 由后续
enrich_glm.py 用 GLM 生成。用法：
    ../.venv/bin/python build_corpus.py
"""
import json, os, sys, urllib.request, urllib.parse, hashlib, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CACHE = os.path.join(HERE, ".cache")
os.makedirs(CACHE, exist_ok=True)

from pypinyin import lazy_pinyin, Style
import opencc
T2S = opencc.OpenCC("t2s")

RAW = "https://raw.githubusercontent.com/chinese-poetry/chinese-poetry/master"

# 每个来源：路径(相对 RAW，未编码) / 朝代 / 排序 / 代表年份 / 体裁模板 / 大类 /
#           内容字段 / 是否繁体 / 取用上限
SOURCES = [
    {"path": "诗经/shijing.json",       "dynasty": "先秦", "order": 1, "year": -700, "genre": "诗", "form": "诗经", "key": "content",    "trad": False, "limit": None},
    {"path": "楚辞/chuci.json",         "dynasty": "先秦", "order": 1, "year": -300, "genre": "诗", "form": "楚辞", "key": "content",    "trad": False, "limit": None},
    {"path": "全唐诗/poet.tang.1000.json", "dynasty": "唐",  "order": 6, "year": 750,  "genre": "诗", "form": "",     "key": "paragraphs", "trad": True,  "limit": 800},
    {"path": "宋词/ci.song.0.json",      "dynasty": "宋",  "order": 8, "year": 1100, "genre": "词", "form": "词",   "key": "paragraphs", "trad": False, "limit": 500},
    {"path": "元曲/yuanqu.json",         "dynasty": "元",  "order": 9, "year": 1300, "genre": "曲", "form": "曲",   "key": "paragraphs", "trad": False, "limit": 200},
    {"path": "纳兰性德/纳兰性德诗集.json", "dynasty": "清",  "order": 11,"year": 1680, "genre": "词", "form": "",     "key": "para",       "trad": False, "limit": None},
    # 文言文经典（散文/语录）——按"段/章"拆分，每段一条
    {"path": "论语/lunyu.json",          "dynasty": "先秦", "order": 1, "year": -500, "genre": "文", "form": "论语", "unit": "para", "author": "孔子及弟子", "trad": False, "limit": None},
    {"path": "四书五经/daxue.json",       "dynasty": "先秦", "order": 1, "year": -430, "genre": "文", "form": "大学", "unit": "para", "author": "曾子（传）", "trad": True,  "limit": None},
    {"path": "四书五经/zhongyong.json",   "dynasty": "先秦", "order": 1, "year": -430, "genre": "文", "form": "中庸", "unit": "para", "author": "子思（传）", "trad": True,  "limit": None},
    {"path": "四书五经/mengzi.json",      "dynasty": "先秦", "order": 1, "year": -300, "genre": "文", "form": "孟子", "unit": "para", "author": "孟子", "trad": True,  "limit": 300},
]

MAX_CHARS = 360        # 诗词曲：只收较短篇目，控制卡片观感与后续生成成本
MAX_CHARS_PROSE = 600  # 文言文散文/语录：放宽上限
MIN_CHARS = 8

def fetch(path):
    fname = os.path.join(CACHE, hashlib.md5(path.encode()).hexdigest() + ".json")
    if os.path.exists(fname):
        return json.load(open(fname, encoding="utf-8"))
    url = RAW + "/" + urllib.parse.quote(path)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    print("  下载", path)
    data = urllib.request.urlopen(req, timeout=60).read().decode("utf-8")
    json.load  # noop
    obj = json.loads(data)
    json.dump(obj, open(fname, "w", encoding="utf-8"), ensure_ascii=False)
    return obj

def get_lines(rec, key):
    # 兼容不同字段名
    for k in (key, "paragraphs", "content", "para"):
        v = rec.get(k)
        if v:
            return v if isinstance(v, list) else [v]
    return []

def expand(src, recs):
    """把一个来源展开为若干"条目" {title, author, lines}（未做繁简转换）。"""
    if src.get("unit") == "para":
        # 文言文散文/语录：每一段/章为一条
        if isinstance(recs, dict):
            recs = [recs]
        author = src.get("author", "佚名")
        for rec in recs:
            chapter = (rec.get("chapter") or "").strip()
            for i, para in enumerate(rec.get("paragraphs", []), 1):
                if not para or not para.strip():
                    continue
                head = src["form"] + ("·" + chapter if chapter else "")
                yield {"title": head + " 其" + str(i), "author": author, "lines": [para]}
    else:
        for rec in recs:
            yield {
                "title": (rec.get("title") or rec.get("rhythmic") or "").strip(),
                "author": (rec.get("author") or "佚名").strip(),
                "lines": get_lines(rec, src["key"]),
            }

def pinyin_line(line):
    toks = lazy_pinyin(line, style=Style.TONE, errors=lambda x: list(x))
    return " ".join(t for t in toks if t.strip())

def slugify(dynasty, idx):
    return "imp-%s-%d" % (hashlib.md5(dynasty.encode()).hexdigest()[:4], idx)

def main():
    out = []
    seen = set()
    gid = 0
    for src in SOURCES:
        print("处理", src["path"])
        try:
            recs = fetch(src["path"])
        except Exception as e:
            print("  跳过（下载失败）:", e); continue
        cnt = 0
        is_prose = src.get("unit") == "para"
        cap = MAX_CHARS_PROSE if is_prose else MAX_CHARS
        for entry in expand(src, recs):
            if src["limit"] and cnt >= src["limit"]:
                break
            lines = entry["lines"]
            title = entry["title"]; author = entry["author"]
            if src["trad"]:
                lines = [T2S.convert(x) for x in lines]
                title = T2S.convert(title); author = T2S.convert(author)
            text = "\n".join(x.strip() for x in lines if x and x.strip())
            if not text or not title:
                continue
            n = len(re.sub(r"\s", "", text))
            if n < MIN_CHARS or n > cap:
                continue
            dedup = author + "|" + title + "|" + text[:20]
            if dedup in seen:
                continue
            seen.add(dedup)
            pinyin = "\n".join(pinyin_line(x) for x in text.split("\n"))
            # 词牌/曲牌：宋词元曲的 title 常即词牌名
            form = src["form"]
            if src["genre"] in ("词", "曲") and title:
                form = ("词·" if src["genre"] == "词" else "曲·") + title.split("·")[0].split("・")[0]
            out.append({
                "id": slugify(src["dynasty"], gid),
                "title": title,
                "author": author,
                "dynasty": src["dynasty"],
                "dynastyOrder": src["order"],
                "year": src["year"],
                "yearLabel": src["dynasty"] + "（约）",
                "form": form,
                "genre": src["genre"],
                "themes": [],
                "place": None,
                "text": text,
                "pinyin": pinyin,
                "translation": "",
                "notes": [],
                "appreciation": "",
                "english": "",
                "source": "chinese-poetry",
                "enriched": False,
            })
            gid += 1; cnt += 1
        print("  收录", cnt)

    # 写 JSON（供 enrich 脚本读写）与 JS（供网页加载）
    json.dump(out, open(os.path.join(ROOT, "data", "corpus.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    with open(os.path.join(ROOT, "data", "corpus.js"), "w", encoding="utf-8") as f:
        f.write("/* 自动生成 — 由 tools/build_corpus.py 从 chinese-poetry 导入。原文为公有领域。\n")
        f.write("   译文/注释/赏析/英译/主题/地点 待 tools/enrich_glm.py 用 GLM 生成。 */\n")
        f.write("window.POEMS_IMPORTED = ")
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write(";\n")
    print("\n共导出 %d 篇 →" % len(out), "data/corpus.json, data/corpus.js")
    by = {}
    for p in out:
        by[p["dynasty"]] = by.get(p["dynasty"], 0) + 1
    print("朝代分布:", "  ".join("%s %d" % (k, v) for k, v in sorted(by.items(), key=lambda kv: -kv[1])))

if __name__ == "__main__":
    main()
