#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
backfill_years.py — 从既有的 yearLabel 里解析出数字年份，写进编辑层的 year 字段。

背景：导入时只能按朝代给一个占位年份（全唐诗一律 750），时间轴因此是几根直柱。
早先那轮 glm-5.2 其实已经给出了相当具体的 yearLabel（"中唐 约780年"、
"战国 约前320年"），只是当时的代码没把它转成数字。这里把这笔已经付过钱的
信息捞回来，不必重跑模型。

只写 data/enrich/*.jsonl 的 year 字段，其余一律不动。

    python3 tools/backfill_years.py           # 试运行
    python3 tools/backfill_years.py --write
"""

import os
import re
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import corpus_lib as CL

# 区间："前1046-前600年"、"780至800年" —— 必须先于单点匹配，否则只会命中后半截
RANGE = re.compile(r"(前)?\s*(\d{3,4})\s*[-–—~～至到]\s*(前)?\s*(\d{3,4})\s*年")
# 单点："约前320年" "公元前1046年" "约 800 年"
# 限定 3–4 位：避免把"其4""天宝三年"之类的碎数字当成年份
YEAR = re.compile(r"(公元)?\s*(前)?\s*(\d{3,4})\s*年")
# "公元前5世纪" "8世纪"
CENTURY = re.compile(r"(公元)?\s*(前)?\s*(\d{1,2})\s*世纪")

# 各朝代的大致存续区间，用来验算解析结果。
# 模型常把"战国 约320年"里的"前"字漏掉 —— 单看标签无从判断，
# 但对上朝代就一眼可知：先秦不可能有公元 320 年。
SPAN = {
    "先秦": (-2000, -221), "汉": (-202, 220), "魏晋": (220, 420),
    "南北朝": (420, 589), "隋": (581, 618), "唐": (618, 907),
    "五代": (907, 960), "宋": (960, 1279), "元": (1271, 1368),
    "明": (1368, 1644), "清": (1644, 1912),
}
SLACK = 80          # 诗人常跨代，边界放宽一些


def parse_year(label):
    """把一条 yearLabel 解析成公元年份；解析不出返回 None。区间取中值。"""
    if not label:
        return None

    m = RANGE.search(label)
    if m:
        a = -int(m.group(2)) if m.group(1) else int(m.group(2))
        # "前1046-前600年"：后一个数沿用前一个的纪元
        b = -int(m.group(4)) if (m.group(3) or m.group(1)) else int(m.group(4))
        return int(round((a + b) / 2))

    years = []
    for m in YEAR.finditer(label):
        years.append(-int(m.group(3)) if m.group(2) else int(m.group(3)))
    if years:
        return int(round(sum(years) / len(years)))

    m = CENTURY.search(label)
    if m:
        c = int(m.group(3))
        # 前 5 世纪 = 前 500–前 401，取中值
        return -(c * 100 - 50) if m.group(2) else c * 100 - 50
    return None


def reconcile(year, dynasty):
    """
    用朝代区间验算。返回 (年份, 情况)：
      ok      落在区间内，直接采信
      flipped 反号之后才落进区间 —— 标签漏了"前"字，补回来
      reject  两种符号都对不上，宁可不要，留朝代占位值
    """
    if year is None:
        return None, "none"
    lo, hi = SPAN.get(dynasty, (-3000, 2100))
    if lo - SLACK <= year <= hi + SLACK:
        return year, "ok"
    if lo - SLACK <= -year <= hi + SLACK:
        return -year, "flipped"
    return None, "reject"


def main():
    write = "--write" in sys.argv
    src = CL.load_source()
    enr = CL.load_enrich()

    stats = Counter()
    unparsed = Counter()
    rejected = []
    flipped = []
    dirty = set()
    for pid, s in src.items():
        e = enr.get(pid)
        if e is None:
            continue
        if isinstance(e.get("year"), int):
            stats["already"] += 1
            continue
        label = e.get("yearLabel") or s.get("yearLabel") or ""
        y, how = reconcile(parse_year(label), s["dynasty"])
        stats[how] += 1
        if how == "none":
            unparsed[label.strip()[:20]] += 1
            continue
        if how == "reject":
            rejected.append((label, s["dynasty"], s["title"]))
            continue
        if how == "flipped":
            flipped.append((label, s["dynasty"], y, s["title"]))
        e["year"] = y
        dirty.add(CL.SLUG.get(s["dynasty"]))

    print("原文 %d 篇" % len(src))
    print("  已有数字年份           %d" % stats["already"])
    print("  标签解析且对上朝代     %d" % stats["ok"])
    print("  标签漏了「前」，已补回 %d" % stats["flipped"])
    print("  与朝代对不上、已弃用   %d" % stats["reject"])
    print("  标签无年份可解析       %d" % stats["none"])

    if flipped:
        print("\n补回「前」字的例子（模型漏写纪元，靠朝代区间断出来的）：")
        for lab, dyn, y, t in flipped[:5]:
            print("   %-22s %-4s -> %6d   《%s》" % (lab[:22], dyn, y, t[:14]))
    if rejected:
        print("\n弃用的例子（两种符号都对不上朝代）：")
        for lab, dyn, t in rejected[:5]:
            print("   %-22s %-4s   《%s》" % (lab[:22], dyn, t[:14]))

    print("\n解析不出的标签，最常见的几种：")
    for lab, n in unparsed.most_common(6):
        print("   %5d  %s" % (n, lab or "（空）"))

    # 抽查，确认符号与量级没搞反
    print("\n抽查：")
    shown = 0
    for pid, s in src.items():
        e = enr.get(pid) or {}
        if not isinstance(e.get("year"), int) or shown >= 6:
            continue
        lab = e.get("yearLabel") or s.get("yearLabel") or ""
        if lab:
            print("   %-30s %-4s -> %6d   《%s》" % (lab[:30], s["dynasty"], e["year"], s["title"][:12]))
            shown += 1

    if not write:
        print("\n（试运行。加 --write 才会落盘。）")
        return

    for slug in sorted(dirty):
        rows = [enr[i] for i in enr if CL.SLUG.get(src[i]["dynasty"]) == slug]
        rows.sort(key=lambda r: r["id"])
        clean = [{k: r[k] for k in CL.ENRICH_FIELDS if k in r} for r in rows]
        CL.write_jsonl(os.path.join(CL.ENRICH_DIR, slug + ".jsonl"), clean)
    print("\n已写回 %d 个分片：%s" % (len(dirty), " ".join(sorted(dirty))))


if __name__ == "__main__":
    main()
