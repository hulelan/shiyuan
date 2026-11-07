#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""One table for the explore page: every poem, one row, 60 bytes.

    python3 tools/build_explore.py            # after build_site_data.py

Writes data/site/explore.json:

    dyn     [{o, k, slug, span, c}]            from the manifest, in order
    places  [{n, m, lat, lng}]                 distinct places
    poems   [[id, title, author, dynOrder, form, year|null, firstLine, placeIdx|-1]]

The page filters this in memory: a dynasty span dragged on the timeline, a
form, a poet, a place, with-painting. Four thousand rows is small enough to
hold and far faster than paging index shards for every change of filter.
"""
import glob, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SITE = os.path.join(ROOT, "data", "site")

M = json.load(open(os.path.join(SITE, "manifest.json"), encoding="utf-8"))
dyn = [{"o": d["o"], "k": d["k"], "slug": d["slug"], "span": d["span"], "c": d["count"]}
       for d in sorted(M["dynasties"], key=lambda d: d["o"])]

places, pidx, by_poem = [], {}, {}
for p in json.load(open(os.path.join(SITE, "agg", "places.json"), encoding="utf-8")):
    key = (p["n"], p["m"], p["lat"], p["lng"])
    if key not in pidx:
        pidx[key] = len(places)
        places.append({"n": p["n"], "m": p["m"], "lat": p["lat"], "lng": p["lng"]})
    by_poem[p["id"]] = pidx[key]

poems = []
for f in sorted(glob.glob(os.path.join(SITE, "index", "*.json"))):
    for r in json.load(open(f, encoding="utf-8")):
        poems.append([r["id"], r["t"], r["a"], r["d"], r.get("f") or "",
                      r.get("y") if isinstance(r.get("y"), int) else None,
                      (r.get("x") or "")[:12], by_poem.get(r["id"], -1)])
poems.sort(key=lambda r: (r[3], r[5] if r[5] is not None else 10**6, r[1]))

out = {"dyn": dyn, "places": places, "poems": poems}
path = os.path.join(SITE, "explore.json")
json.dump(out, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("explore.json: %d poems, %d places, %d KB" % (len(poems), len(places), os.path.getsize(path) // 1024))
