#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
import_guwen.py — 从《古文观止》补文言散文与赋。

    ./.venv/bin/python tools/import_guwen.py --list          # 看这部书里有什么
    ./.venv/bin/python tools/import_guwen.py 前赤壁赋 後赤壁賦   # 试运行
    ./.venv/bin/python tools/import_guwen.py 前赤壁赋 --write

为什么要单开一个脚本：三部诗词总集（全唐诗 / 全宋诗 / 宋词）里没有文和赋。
《前赤壁赋》《岳阳楼记》《醉翁亭记》《陋室铭》一直缺席，就是因为这个 ——
不是漏导，是那三部书里压根没有。上游把它放在 蒙学/guwenguanzhi.json：
清人吴楚材、吴调侯选定的 222 篇，从东周到明代，公有领域。

题名可以给简体也可以给繁体，脚本两边都试；给一部分也认（"赤壁"能同时对上前后两篇）。
"""

import argparse
import json
import os
import re
import sys
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import corpus_lib as CL
import relevance_lib as R

from pypinyin import lazy_pinyin, Style
import opencc

T2S = opencc.OpenCC("t2s")
S2T = opencc.OpenCC("s2t")
RAW = "https://raw.githubusercontent.com/chinese-poetry/chinese-poetry/master/"
SRC = "蒙学/guwenguanzhi.json"
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".cache", "guwen.json")

MAX_CHARS = 2500        # 与 build_corpus.py 的 MAX_CHARS_PROSE 一致
MIN_CHARS = 8

# 「宋代：蘇軾 」这种写法里，朝代用的是"某代"，要落到本库的朝代名上
DYN_MAP = {
    "先秦": "先秦", "秦": "先秦", "两汉": "汉", "兩漢": "汉", "汉代": "汉", "漢代": "汉",
    "魏晋": "魏晋", "魏晉": "魏晋", "南北朝": "南北朝", "隋代": "隋",
    "唐代": "唐", "五代": "五代", "宋代": "宋", "元代": "元", "明代": "明", "清代": "清",
}
# 题名里带"赋"的算赋，其余算文。赋与文都是散体，站上一样按整段排。
FU = re.compile(r"賦$|赋$")

# 上游把校记直接夹在正文里：《前赤壁赋》末尾就有 (冯通：凭)、(共适一作：共食)。
# 222 篇里 18 篇有，共 27 处。这些是校勘意见，不是文章本身，
# 留在正文里等于让苏轼在文末交代了一句异文。剥掉，但要打印出来 ——
# 静悄悄扔掉别人的校记不合适，何况它本身是有用的。
GLOSS = re.compile(r"[（(]\s*[^（()）]{0,40}?(?:一作|一本|或作|通)\s*[：:]?\s*[^（()）]{0,40}?[)）}]|"
                   r"[（(]\s*选自《[^》]+》\s*[)）]")


def fetch():
    if os.path.exists(CACHE):
        with open(CACHE, encoding="utf-8") as f:
            return json.load(f)
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    req = urllib.request.Request(RAW + urllib.parse.quote(SRC),
                                 headers={"User-Agent": "Mozilla/5.0"})
    obj = json.loads(urllib.request.urlopen(req, timeout=180).read().decode("utf-8"))
    with open(CACHE, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False)
    return obj


def flatten(book):
    """把十二卷摊平成一条条文章。"""
    out = []
    for vol in book.get("content", []):
        vt = vol.get("title") or ""
        for a in vol.get("content", []):
            title = (a.get("chapter") or "").strip()
            raw_au = (a.get("author") or "").strip()
            # 段内的空白要清掉：上游有些段落中间夹着空格
            # （《后赤壁赋》第一段就有八处），照收会在正文里留下莫名的缝。
            # 段内的空白要清掉：上游有些段落中间夹着空格
            # （《后赤壁赋》第一段就有八处），照收会在正文里留下莫名的缝。
            paras, gloss = [], []
            for x in (a.get("paragraphs") or []):
                x = re.sub(r"[\s\u3000]+", "", x)
                for g in GLOSS.findall(x):
                    gloss.append(g)
                x = GLOSS.sub("", x).strip()
                if x:
                    paras.append(x)
            if not title or not paras:
                continue
            dyn, au = "", raw_au
            if "：" in raw_au:
                d, au = raw_au.split("：", 1)
                dyn = DYN_MAP.get(T2S.convert(d.strip()), "")
            out.append({"vol": vt, "title": title, "author": au.strip(),
                        "dynasty": dyn, "paras": paras, "gloss": gloss,
                        "source": (a.get("source") or "").strip()})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("titles", nargs="*", help="要收的题名（简繁皆可，可给一部分）")
    ap.add_argument("--list", action="store_true", help="列出这部书的全部篇目后退出")
    ap.add_argument("--write", action="store_true", help="真正落盘")
    args = ap.parse_args()

    arts = flatten(fetch())
    print("《古文观止》共 %d 篇" % len(arts))

    if args.list:
        for a in arts:
            n = len(re.sub(r"\s", "", "".join(a["paras"])))
            print("  %-16s %-24s %-6s %-8s %5d字"
                  % (a["vol"], T2S.convert(a["title"]),
                     a["dynasty"], T2S.convert(a["author"]), n))
        return
    if not args.titles:
        sys.exit("要收哪几篇？给题名，或用 --list 先看看有什么。")

    # 简繁两边都试 —— 用户多半给简体，而这部书是繁体的
    keys = []
    for t in args.titles:
        keys += [t, T2S.convert(t), S2T.convert(t)]
    keys = list(dict.fromkeys(keys))

    picked, seen = [], set()
    for a in arts:
        t_trad, t_simp = a["title"], T2S.convert(a["title"])
        if not any(k in t_trad or k in t_simp for k in keys):
            continue
        if t_simp in seen:
            continue
        seen.add(t_simp)
        picked.append(a)

    if not picked:
        sys.exit("对不上：" + "、".join(args.titles))

    src = CL.load_source()
    have_ids = set(src)
    bykey = {}
    for r in src.values():
        bykey.setdefault(re.sub(r"\s", "", r["text"])[:2], []).append(r["text"])

    recs, skipped, gloss_of = [], [], {}
    for a in picked:
        title = T2S.convert(a["title"])
        author = T2S.convert(a["author"]) or "佚名"
        dyn = a["dynasty"] or "宋"
        text = "\n".join(T2S.convert(x) for x in a["paras"])
        n = len(re.sub(r"\s", "", text))
        if n < MIN_CHARS or n > MAX_CHARS:
            skipped.append((title, "%d 字，超出 %d 的上限" % (n, MAX_CHARS)))
            continue
        pid = CL.stable_id(author, title, text)
        if pid in have_ids:
            skipped.append((title, "站上已有（id 相同）"))
            continue
        head = re.sub(r"\s", "", text)[:2]
        dup = next((t for t in bykey.get(head, ()) if R.overlap(text, t) >= 0.82), None)
        if dup:
            skipped.append((title, "站上已有（字面重合）"))
            continue

        genre = "赋" if FU.search(a["title"]) else "文"
        recs.append({
            "id": pid, "title": title, "author": author,
            "dynasty": dyn, "dynastyOrder": CL.ORDER[dyn],
            "year": None, "yearLabel": "",
            "form": genre, "genre": genre, "text": text,
            "pinyin": "\n".join(
                " ".join(t for t in lazy_pinyin(line, style=Style.TONE,
                                                errors=lambda x: list(x)) if t.strip())
                for line in text.split("\n")),
            "source": "chinese-poetry · 古文观止", "curated": False,
        })
        gloss_of[pid] = a.get("gloss") or []
        have_ids.add(pid)
        bykey.setdefault(head, []).append(text)

    for t, why in skipped:
        print("  跳过《%s》：%s" % (t, why))
    if not recs:
        print("\n没有可新增的。")
        return

    print("\n拟收 %d 篇：" % len(recs))
    for r in recs:
        n = len(re.sub(r"\s", "", r["text"]))
        print("  %s《%s》%s  %s  %d字  %d段"
              % (r["dynasty"], r["title"], r["author"], r["genre"], n,
                 len(r["text"].split("\n"))))
        print("     " + r["text"][:46].replace("\n", " / ") + "…")
        g = gloss_of.get(r["id"]) or []
        if g:
            print("     （剥掉上游夹在正文里的校记 %d 处：%s）"
                  % (len(g), "　".join(T2S.convert(x) for x in g)))

    if not args.write:
        print("\n（试运行。加 --write 才会落盘。）")
        return

    merged = list(src.values()) + recs
    CL.save_layer(CL.SOURCE_DIR, merged, CL.SOURCE_FIELDS)
    enr = CL.load_enrich()
    for r in recs:
        enr.setdefault(r["id"], {"id": r["id"]})
    dyn_of = {x["id"]: x["dynasty"] for x in merged}
    for pid, e in enr.items():
        if pid in dyn_of:
            e["_slug"] = CL.SLUG[dyn_of[pid]]
    CL.save_layer(CL.ENRICH_DIR, [e for p, e in enr.items() if p in dyn_of],
                  CL.ENRICH_FIELDS)
    print("\n已写入。原文层 %d 篇（新增 %d）。" % (len(merged), len(recs)))
    print("接着跑：build_site_data.py → embed_corpus.py → build_relevance.py")


if __name__ == "__main__":
    main()
