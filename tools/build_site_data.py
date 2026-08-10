#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_site_data.py — 把两层语料编译成网页按需抓取的静态文件。

    读  data/source/*.jsonl + data/enrich/*.jsonl
    写  data/site/**            （整个目录都是产物，可随时删掉重建）

要点：所有需要"扫全库"的统计 —— 主题计数、体裁谱系、作者存篇、字频 ——
一律在这里算完。网页端不再持有全量数据，也就不再有 O(全库) 的循环。

    ../.venv/bin/python tools/build_site_data.py

产物结构：
    manifest.json                 朝代表、总数、分片清单、build 指纹
    curated.json                  精编篇目全文（首页只读这一个文件）
    index/<朝代>-<n>.json         卡片索引，每片 INDEX_SHARD 条
    body/<朝代>-<n>.json          全文记录，每片 BODY_CHUNK 条
    agg/authors.json              作者名录
    agg/author/<桶>.json          某作者的全部作品（卡片）
    agg/themes.json  forms.json   主题 / 体裁计数
    agg/theme/<键>-<n>.json       某主题的作品（卡片）
    agg/form/<键>-<n>.json        某体裁的作品（卡片）
    agg/places.json               有坐标的作品
    agg/timeline.json             朝代带 + 年代直方图
    search/<桶>.json              标题·作者的二元组倒排（只索引标题与作者）
    chars/summary.json            字云用的高频字
    chars/<桶>.json               字 → 例句（有截断，见 CHAR_MAX_HITS）

卡片记录的字段名刻意压到最短 —— 50k 规模下光键名就是几 MB：
    id 编号 / t 标题 / a 作者 / d 朝代序 / y 年 / f 体裁 / g 大类
    th 主题 / x 首句 / b 全文分片号 / ap 有赏析
"""

import hashlib
import json
import os
import re
import shutil
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import corpus_lib as CL

SITE = os.path.join(CL.DATA, "site")

INDEX_SHARD = 2000      # 每个索引分片的卡片数
BODY_CHUNK = 200        # 每个全文分片的记录数
AGG_SHARD = 2000        # 主题/体裁/作者聚合分片
TAIL_MIN = 30           # 少于这么多篇的主题不单独成片，一起塞进 _tail.json
                        # （模型给的主题词没有受控词表，长尾极长：2966 篇就有 960 个主题，
                        #   其中 748 个不足 5 篇。不合并的话产物会是几千个碎文件。）
AUTHOR_BUCKETS = 64
SEARCH_BUCKETS = 64
CHAR_BUCKETS = 64
CHAR_TOP = 1500         # 只为最常见的这些字建索引
CHAR_MAX_HITS = 300     # 每字最多留多少例句（跨朝代抽样，非取前 N）
CLOUD_TOP = 300         # 字云展示的字数

HAN = re.compile(r"[一-鿿]")


def w(path, obj):
    full = os.path.join(SITE, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    return os.path.getsize(full)


def bucket(s, n):
    """
    FNV-1a（32 位），逐 UTF-16 码元 —— 刻意选它，是为了浏览器端能用四行
    JS 算出同一个桶号（见 js/store.js 的 bucket），不必为了 md5 引一个库。
    按 utf-16-le 取码元，与 JS 的 charCodeAt 完全对齐。
    """
    h = 2166136261
    b = s.encode("utf-16-le")
    for i in range(0, len(b), 2):
        h ^= b[i] | (b[i + 1] << 8)
        h = (h * 16777619) & 0xFFFFFFFF
    return h % n


def first_line(text):
    return (text or "").split("\n")[0]


def classify_label(rec):
    """体裁标签 —— 与 js/forms.js 的 classifyForm 保持同一套规则。"""
    g = rec.get("genre")
    if g == "词": return ("词", "词", "词")
    if g == "曲": return ("曲", "曲", "曲")
    if g == "文": return ("文", "散文·语录", "文")
    if g == "赋": return ("赋", "赋", "赋")
    f = rec.get("form") or ""
    if "诗经" in f: return ("四言·诗经", "诗经", "诗经")
    if "楚辞" in f or "骚" in f: return ("骚体·楚辞", "楚辞", "楚辞")
    clauses = [len(HAN.findall(c)) for c in re.split(r"[，。！？、；：\n]", rec.get("text", ""))]
    clauses = [c for c in clauses if c > 0]
    n = len(clauses)
    L = clauses[0] if clauses else 0
    uniform = all(c == L for c in clauses)
    if uniform and L == 5 and n == 4: return ("近体诗", "五言绝句", "五绝")
    if uniform and L == 7 and n == 4: return ("近体诗", "七言绝句", "七绝")
    if uniform and L == 5 and n == 8: return ("近体诗", "五言律诗", "五律")
    if uniform and L == 7 and n == 8: return ("近体诗", "七言律诗", "七律")
    if uniform and L == 5 and n > 8:  return ("古体诗", "五言古诗", "五古")
    if uniform and L == 7 and n > 8:  return ("古体诗", "七言古诗", "七古")
    if uniform and L == 4:            return ("古体诗", "四言", "四言")
    if uniform and L == 5:            return ("古体诗", "五言古诗", "五古")
    if uniform and L == 7:            return ("古体诗", "七言古诗", "七古")
    return ("古体诗", "杂言 / 乐府", "古体")


def main():
    src = CL.load_source()
    enr = CL.load_enrich()
    if not src:
        sys.exit("原文层为空。先跑 tools/migrate_corpus.py --write。")
    print("读入 原文 %d 篇 / 编辑 %d 篇" % (len(src), len(enr)))

    if os.path.isdir(SITE):
        shutil.rmtree(SITE)      # 产物目录整体重建，避免残留上一次的分片

    # ---- 合成完整记录，顺带算好体裁与生效年份 ----
    full = {}
    for pid, s in src.items():
        e = enr.get(pid, {})
        group, sub, label = classify_label(s)
        # 生效年份：模型推断优先于导入时按朝代给的占位值
        year = e.get("year") if isinstance(e.get("year"), int) else s.get("year")
        estimated = not isinstance(e.get("year"), int)
        rec = dict(s)
        rec.update({k: v for k, v in e.items() if k not in ("id", "year", "yearLabel")})
        rec["year"] = year
        rec["yearLabel"] = e.get("yearLabel") or s.get("yearLabel") or ""
        rec["formGroup"], rec["formSub"], rec["formLabel"] = group, sub, label
        rec["yearEstimated"] = estimated
        full[pid] = rec

    order_of = {k: o for k, o, _, _ in CL.DYNASTIES}
    by_dyn = defaultdict(list)
    for r in full.values():
        by_dyn[r["dynasty"]].append(r)
    for rs in by_dyn.values():
        rs.sort(key=lambda r: (r.get("year") or 0, r["title"], r["id"]))

    # ---- 全文分片；同时记下每条记录落在哪一片 ----
    body_of = {}
    nbody = 0
    for dyn, rs in by_dyn.items():
        slug = CL.SLUG[dyn]
        for i in range(0, len(rs), BODY_CHUNK):
            chunk = rs[i:i + BODY_CHUNK]
            k = i // BODY_CHUNK
            for r in chunk:
                body_of[r["id"]] = k
            w("body/%s-%03d.json" % (slug, k), {r["id"]: r for r in chunk})
            nbody += 1

    def card(r):
        c = {"id": r["id"], "t": r["title"], "a": r["author"],
             "d": order_of.get(r["dynasty"], 99), "f": r["formLabel"],
             "g": r.get("genre") or "", "x": first_line(r.get("text")),
             "b": body_of[r["id"]]}
        if r.get("year") is not None:
            c["y"] = r["year"]
        if r.get("themes"):
            c["th"] = r["themes"]
        if r.get("appreciation"):
            c["ap"] = 1
        return c

    cards = {pid: card(r) for pid, r in full.items()}

    # ---- 索引分片（按朝代） ----
    index_shards = {}
    for dyn, rs in by_dyn.items():
        slug = CL.SLUG[dyn]
        shards = []
        for i in range(0, len(rs), INDEX_SHARD):
            k = i // INDEX_SHARD
            w("index/%s-%03d.json" % (slug, k), [cards[r["id"]] for r in rs[i:i + INDEX_SHARD]])
            shards.append(k)
        index_shards[slug] = {"shards": len(shards), "count": len(rs),
                              "bodies": (len(rs) + BODY_CHUNK - 1) // BODY_CHUNK}

    # ---- 精编：首页唯一要读的文件 ----
    curated = [full[p] for p in full if full[p].get("curated")]
    curated.sort(key=lambda r: (order_of.get(r["dynasty"], 99), r.get("year") or 0))
    w("curated.json", curated)

    def shard_cards(prefix, key, ids):
        """把一组作品按 AGG_SHARD 切片写出，返回片数。"""
        ids = sorted(ids, key=lambda i: (cards[i]["d"], cards[i].get("y") or 0, cards[i]["t"]))
        for i in range(0, len(ids), AGG_SHARD):
            w("%s/%s-%03d.json" % (prefix, key, i // AGG_SHARD), [cards[x] for x in ids[i:i + AGG_SHARD]])
        return max(1, (len(ids) + AGG_SHARD - 1) // AGG_SHARD)

    # ---- 作者 ----
    au = defaultdict(list)
    for pid, r in full.items():
        if r["author"] and r["author"] != "佚名":
            au[r["author"]].append(pid)
    authors = []
    for name, ids in au.items():
        earliest = min(order_of.get(full[i]["dynasty"], 99) for i in ids)
        dyn = next(full[i]["dynasty"] for i in ids
                   if order_of.get(full[i]["dynasty"], 99) == earliest)
        authors.append({"n": name, "c": len(ids), "d": earliest,
                        "dy": dyn, "k": bucket(name, AUTHOR_BUCKETS)})
    authors.sort(key=lambda a: (-a["c"], a["d"], a["n"]))
    w("agg/authors.json", authors)
    ab = defaultdict(dict)
    for name, ids in au.items():
        ab[bucket(name, AUTHOR_BUCKETS)][name] = [cards[i] for i in sorted(
            ids, key=lambda i: (cards[i]["d"], cards[i].get("y") or 0, cards[i]["t"]))]
    for k, payload in ab.items():
        w("agg/author/%02d.json" % k, payload)

    # ---- 主题 / 体裁 ----
    th = defaultdict(list)
    for pid, r in full.items():
        for t in (r.get("themes") or []):
            th[t].append(pid)
    theme_meta, tail = [], {}
    for i, (name, ids) in enumerate(sorted(th.items(), key=lambda kv: -len(kv[1]))):
        key = "t%03d" % i
        if len(ids) >= TAIL_MIN:
            theme_meta.append({"n": name, "c": len(ids), "k": key,
                               "s": shard_cards("agg/theme", key, ids)})
        else:
            tail[key] = [cards[x] for x in sorted(
                ids, key=lambda x: (cards[x]["d"], cards[x].get("y") or 0))]
            theme_meta.append({"n": name, "c": len(ids), "k": key, "tail": 1})
    w("agg/theme/_tail.json", tail)
    w("agg/themes.json", theme_meta)

    fm = defaultdict(list)
    for pid, r in full.items():
        fm[(r["formGroup"], r["formSub"])].append(pid)
    form_meta = []
    for i, ((grp, sub), ids) in enumerate(sorted(fm.items(), key=lambda kv: -len(kv[1]))):
        form_meta.append({"g": grp, "n": sub, "c": len(ids), "k": "f%03d" % i,
                          "s": shard_cards("agg/form", "f%03d" % i, ids)})
    w("agg/forms.json", form_meta)

    # ---- 地图 ----
    places = [{"id": r["id"], "t": r["title"], "a": r["author"],
               "n": r["place"]["name"], "m": r["place"].get("modern", ""),
               "lat": r["place"]["lat"], "lng": r["place"]["lng"], "b": body_of[r["id"]]}
              for r in full.values()
              if isinstance(r.get("place"), dict)
              and isinstance(r["place"].get("lat"), (int, float))]
    w("agg/places.json", places)

    # ---- 时间轴：朝代带 + 年代直方图 ----
    # 导入时全朝代共用一个占位年份，真断代要等 enrich 补 year。
    # confident 标出这一带的年份有多少是真推断出来的，前端据此决定要不要画直方图。
    bands = []
    for key, order, slug, span in CL.DYNASTIES:
        rs = by_dyn.get(key) or []
        if not rs:
            continue
        real = sum(1 for r in rs if not r["yearEstimated"])
        hist = Counter()
        for r in rs:
            if r.get("year") is not None:
                hist[int(r["year"] // 10 * 10)] += 1
        bands.append({"k": key, "o": order, "slug": slug, "span": span,
                      "c": len(rs), "real": real,
                      "confident": real >= max(20, len(rs) * 0.5),
                      "hist": sorted([{"d": d, "n": n} for d, n in hist.items()],
                                     key=lambda x: x["d"])})
    w("agg/timeline.json", bands)

    # ---- 搜索：标题 + 作者的二元组倒排 ----
    # 只索引标题与作者（正文不入索引），检索靠前端交二元组的候选集。
    inv = defaultdict(set)
    for pid, r in full.items():
        for field in (r["title"], r["author"]):
            s2 = HAN.findall(field or "")
            if len(s2) == 1:
                inv[s2[0]].add(pid)
            for i in range(len(s2) - 1):
                inv[s2[i] + s2[i + 1]].add(pid)
    sb = defaultdict(dict)
    for gram, ids in inv.items():
        sb[bucket(gram, SEARCH_BUCKETS)][gram] = sorted(ids)
    for k, payload in sb.items():
        w("search/%02d.json" % k, payload)

    # ---- 字词索引 ----
    hits = defaultdict(lambda: defaultdict(list))   # 字 -> 朝代序 -> [(id, 例句)]
    freq = Counter()
    for pid, r in full.items():
        lines = (r.get("text") or "").split("\n")
        seen = set()
        for ln in lines:
            for ch in ln:
                if not HAN.match(ch):
                    continue
                freq[ch] += 1
                if ch in seen:
                    continue
                seen.add(ch)
                hits[ch][cards[pid]["d"]].append((pid, ln))
    top = [c for c, _ in freq.most_common(CHAR_TOP)]
    cb = defaultdict(dict)
    truncated = 0
    for ch in top:
        buckets_by_dyn = hits[ch]
        total = sum(len(v) for v in buckets_by_dyn.values())
        # 跨朝代轮转取样：宁可让"月"横跨千年，也不要只给最早的 300 首
        picked, keys, i = [], sorted(buckets_by_dyn), 0
        while len(picked) < CHAR_MAX_HITS and any(buckets_by_dyn[k] for k in keys):
            k = keys[i % len(keys)]
            if buckets_by_dyn[k]:
                picked.append(buckets_by_dyn[k].pop(0))
            i += 1
        if total > len(picked):
            truncated += 1
        cb[bucket(ch, CHAR_BUCKETS)][ch] = {
            "n": total, "shown": len(picked),
            "h": [{"id": p, "l": ln, "t": cards[p]["t"], "a": cards[p]["a"],
                   "d": cards[p]["d"], "b": cards[p]["b"]} for p, ln in picked]}
    for k, payload in cb.items():
        w("chars/%02d.json" % k, payload)
    cloud = [{"c": c, "n": sum(len(v) for v in hits[c].values())}
             for c in [x for x, _ in freq.most_common(CLOUD_TOP)]]
    w("chars/summary.json", {"cloud": cloud, "indexed": len(top),
                             "distinct": len(freq), "maxHits": CHAR_MAX_HITS})

    # ---- manifest ----
    fp = hashlib.md5(json.dumps(
        {p: (full[p]["text"], full[p].get("translation", "")) for p in sorted(full)},
        ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:10]
    manifest = {
        "build": fp,
        "total": len(full),
        "curated": len(curated),
        "dynasties": [{"k": k, "o": o, "slug": s, "span": sp,
                       **index_shards.get(s, {"shards": 0, "count": 0, "bodies": 0})}
                      for k, o, s, sp in CL.DYNASTIES if s in index_shards],
        "indexShard": INDEX_SHARD, "bodyChunk": BODY_CHUNK, "aggShard": AGG_SHARD,
        "authorBuckets": AUTHOR_BUCKETS, "searchBuckets": SEARCH_BUCKETS,
        "charBuckets": CHAR_BUCKETS,
        "authors": len(authors), "themes": len(theme_meta), "forms": len(form_meta),
        "places": len(places),
        "charsIndexed": len(top), "charsDistinct": len(freq),
        "charMaxHits": CHAR_MAX_HITS, "charsTruncated": truncated,
        "searchScope": "title+author",
    }
    w("manifest.json", manifest)

    # ---- 报告 ----
    def dirsize(d):
        tot = 0
        for root, _, files in os.walk(os.path.join(SITE, d)):
            for f in files:
                tot += os.path.getsize(os.path.join(root, f))
        return tot
    n_files = sum(len(fs) for _, _, fs in os.walk(SITE))
    total = dirsize("")
    print("\n产物 %d 个文件，合计 %.1f MB  (build %s)" % (n_files, total / 1e6, fp))
    for d in ["index", "body", "agg", "search", "chars"]:
        print("   %-8s %7.2f MB" % (d, dirsize(d) / 1e6))
    print("   %-8s %7.2f MB" % ("curated", os.path.getsize(os.path.join(SITE, "curated.json")) / 1e6))
    print("\n字词索引：%d 个不同字，建索引 %d 个，其中 %d 个因超过 %d 例被截断" % (
        manifest["charsDistinct"], manifest["charsIndexed"], truncated, CHAR_MAX_HITS))
    conf = [b["k"] for b in bands if b["confident"]]
    print("时间轴：%d 个朝代带，其中年份可信的 %d 个 %s" % (
        len(bands), len(conf), conf or "—（年份尚是导入占位值，待 enrich 补断代）"))
    # 折算到 50k：字词索引有硬上限（CHAR_TOP × CHAR_MAX_HITS），不随篇数线性增长，
    # 其余部分才按篇数放大。直接整体线性外推会严重高估。
    chars_now = dirsize("chars")
    chars_cap = CHAR_TOP * CHAR_MAX_HITS * 110 / 1e6      # 每条例句约 110 字节
    scale = 50000.0 / len(full)
    proj = (total - chars_now) / 1e6 * scale + min(chars_cap, chars_now / 1e6 * scale)
    print("\n按 %d 篇折算到 50k：约 %.0f MB（字词索引封顶 %.0f MB，不随篇数增长）"
          % (len(full), proj, chars_cap))


if __name__ == "__main__":
    main()
