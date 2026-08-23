#!/usr/bin/env python3
"""只重算 agg/timeline.json。

整份 build_site_data 会把 site/ 清空重来 —— 为了时间轴一处改动，不值得。
逻辑与 build_site_data 里的那一段保持一致：断代年份优先，其次按作者估算，
朝代占位年份不进直方图。改了那边，记得也改这边。"""
import json, os, sys
from collections import Counter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import corpus_lib as CL

SITE = os.path.join(CL.DATA, "site")

def jsonl(p):
    with open(p, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)

AY = {}
tab = json.load(open(os.path.join(CL.DATA, "curated", "author_years.json"), encoding="utf-8"))
for dyn, t in tab.items():
    if dyn.startswith("_"):
        continue
    for name, (b, d) in t.items():
        AY[(dyn, name)] = max(b + 15, min(b + 35, d))

enr = {}
for fn in os.listdir(os.path.join(CL.DATA, "enrich")):
    for r in jsonl(os.path.join(CL.DATA, "enrich", fn)):
        enr[r["id"]] = r

by_dyn = {}
for fn in os.listdir(os.path.join(CL.DATA, "source")):
    for s in jsonl(os.path.join(CL.DATA, "source", fn)):
        e = enr.get(s["id"], {})
        real = isinstance(e.get("year"), int)
        year = e["year"] if real else (int(s["year"]) if str(s.get("year", "")).lstrip("-").isdigit() else None)
        basis = "poem" if real else "dynasty"
        if not real:
            ay = AY.get((s.get("dynasty"), s.get("author")))
            if ay:
                year, basis = ay, "author"
        by_dyn.setdefault(s["dynasty"], []).append({"year": year, "basis": basis})

bands = []
for key, order, slug, span in CL.DYNASTIES:
    rs = by_dyn.get(key) or []
    if not rs:
        continue
    real = sum(1 for r in rs if r["basis"] == "poem")
    by_author = sum(1 for r in rs if r["basis"] == "author")
    hist = Counter()
    for r in rs:
        if r["year"] is not None and r["basis"] in ("poem", "author"):
            hist[int(r["year"] // 10 * 10)] += 1
    confident = real >= max(20, len(rs) * 0.5)
    placed = real + by_author
    bands.append({"k": key, "o": order, "slug": slug, "span": span,
                  "c": len(rs), "real": real, "byAuthor": by_author,
                  "confident": confident,
                  "byAuthorOnly": (not confident) and placed >= max(20, len(rs) * 0.5),
                  "hist": sorted([{"d": d, "n": n} for d, n in hist.items()], key=lambda x: x["d"])})

out = os.path.join(SITE, "agg", "timeline.json")
json.dump(bands, open(out, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
for b in bands:
    print(f"{b['k']:<5} {b['c']:>5} 篇 · 断代 {b['real']:>4} · 按作者 {b['byAuthor']:>4} · "
          f"{'直方图' if b['confident'] or b['byAuthorOnly'] else '平的'}"
          f"{'（按作者）' if b['byAuthorOnly'] else ''} · {len(b['hist'])} 档")
