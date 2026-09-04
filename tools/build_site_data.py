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
    agg/theme/_tail-<桶>.json     长尾主题合集（按桶分片，见 TAIL_BUCKETS）
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
TAIL_MIN = 30           # 少于这么多篇的主题不单独成片，一起塞进长尾桶
                        # （模型给的主题词没有受控词表，长尾极长：2966 篇就有 960 个主题，
                        #   其中 748 个不足 5 篇。不合并的话产物会是几千个碎文件。）
TAIL_BUCKETS = 16       # 长尾主题按桶分片：挑任何一个长尾主题只下载它所在的那一桶，
                        # 而不是把整份 _tail.json（几百 KB）一次拉下来
AUTHOR_BUCKETS = 64
SEARCH_BUCKETS = 64
CHAR_BUCKETS = 64
LOOKUP_BUCKETS = 64     # id → (朝代序, 全文分片) —— 深链 #/poem/<id> 靠它定位
SINGLE_CAP = 800        # 单字倒排最多留多少条（尚无相关性排序，先截断）
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
    """体裁标签。原先网页端也有一份同样的规则（js/forms.js），
    现已统一到构建期：卡片里直接带 f 字段，前端不再分类。"""
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

    # 产物目录整体重建，避免残留上一次的分片。
    # near/ 与 bm25/ 例外 —— 那两份是 tools/build_relevance.py 的产物，
    # 一起删掉就等于每次重建语料都要连着重跑一次嵌入（六分多钟）。
    # 留着，并在 manifest 里标 stale，让人自己决定什么时候重算。
    KEEP = {"near", "bm25"}
    prev_manifest = {}
    if os.path.isdir(SITE):
        mp = os.path.join(SITE, "manifest.json")
        if os.path.exists(mp):
            prev_manifest = json.load(open(mp, encoding="utf-8"))
        for name in os.listdir(SITE):
            if name in KEEP:
                continue
            path = os.path.join(SITE, name)
            shutil.rmtree(path) if os.path.isdir(path) else os.remove(path)

    # ---- 按作者估年：给尚未逐篇断代的篇目一个说得过去的位置 ----
    # 唐有 2142 篇，模型只断出 533 篇，其余全挂在朝代的占位年份上，时间轴
    # 因此只能画成一条平的。作者的生卒是查得到的常识，不必再跑一遍模型：
    # 取生年 + 35，即大致的创作壮年。这仍是估计 —— 画的是诗人活在什么时候，
    # 不是这首诗写于哪一年 —— 所以 yearEstimated 照旧为真，地图的时间滑块
    # 一如既往不收，只有时间轴愿意用它。
    AY = {}
    ayp = os.path.join(CL.DATA, "curated", "author_years.json")
    if os.path.exists(ayp):
        for dyn, tab in json.load(open(ayp, encoding="utf-8")).items():
            if dyn.startswith("_"):
                continue
            for name, (b, d) in tab.items():
                AY[(dyn, name)] = max(b + 15, min(b + 35, d))

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
        rec["yearBasis"] = "poem" if not estimated else "dynasty"
        if estimated:
            ay = AY.get((s.get("dynasty"), s.get("author")))
            if ay:
                rec["year"] = ay
                rec["yearBasis"] = "author"
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
    theme_meta, tail = [], defaultdict(dict)
    for i, (name, ids) in enumerate(sorted(th.items(), key=lambda kv: -len(kv[1]))):
        key = "t%03d" % i
        if len(ids) >= TAIL_MIN:
            theme_meta.append({"n": name, "c": len(ids), "k": key,
                               "s": shard_cards("agg/theme", key, ids)})
        else:
            # 长尾按桶分片（桶号与 js/store.js 的 bucket() 对齐）：
            # 前端挑任何一个长尾主题，只抓它所在的那一桶。
            tail[bucket(key, TAIL_BUCKETS)][key] = [cards[x] for x in sorted(
                ids, key=lambda x: (cards[x]["d"], cards[x].get("y") or 0))]
            theme_meta.append({"n": name, "c": len(ids), "k": key, "tail": 1})
    for k, payload in tail.items():
        w("agg/theme/_tail-%02d.json" % k, payload)
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
    # y/e 是给地图上那条时间滑块用的：y 是年份，e=1 表示这个年份只是按朝代
    # 摊出来的占位值。占位的不参与按年筛选 —— 否则一整个朝代会齐刷刷堆在同一档，
    # 看着像那年突然人人写诗。
    places = [{"id": r["id"], "t": r["title"], "a": r["author"],
               "n": r["place"]["name"], "m": r["place"].get("modern", ""),
               "lat": r["place"]["lat"], "lng": r["place"]["lng"], "b": body_of[r["id"]],
               "d": r["dynastyOrder"],
               "y": (int(r["year"]) if isinstance(r.get("year"), (int, float)) else None),
               "e": 1 if r.get("yearEstimated") else 0}
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
        by_author = sum(1 for r in rs if r.get("yearBasis") == "author")
        # 直方图只收站得住的年份：逐篇断出来的，或按作者估出来的。
        # 朝代占位年份一概不进 —— 否则整个朝代会堆在同一格。
        hist = Counter()
        for r in rs:
            if r.get("year") is not None and r.get("yearBasis") in ("poem", "author"):
                hist[int(r["year"] // 10 * 10)] += 1
        confident = real >= max(20, len(rs) * 0.5)
        placed = real + by_author
        bands.append({"k": key, "o": order, "slug": slug, "span": span,
                      "c": len(rs), "real": real, "byAuthor": by_author,
                      "confident": confident,
                      # 画得出图，但底子是作者生卒而非逐篇断代
                      "byAuthorOnly": (not confident) and placed >= max(20, len(rs) * 0.5),
                      "hist": sorted([{"d": d, "n": n} for d, n in hist.items()],
                                     key=lambda x: x["d"])})
    w("agg/timeline.json", bands)

    # ---- 搜索：标题 + 作者的二元组倒排 ----
    # 只索引标题与作者（正文不入索引），检索靠前端交二元组的候选集。
    inv = defaultdict(set)
    single = defaultdict(set)
    for pid, r in full.items():
        for field in (r["title"], r["author"]):
            s2 = HAN.findall(field or "")
            # 单字也要入索引，否则搜"月"找不到《月夜》—— 只有标题恰好是一个字时才命中
            # sorted 不是讲究：set 的遍历顺序随 PYTHONHASHSEED 变，
            # 会一路影响到 inv 的键序、进而影响分片里卡片表的下标。
            # 结果就是同样的语料重跑一次，十来个 search 分片"变了"却一个字没改。
            for ch in sorted(set(s2)):
                single[ch].add(pid)
            for i in range(len(s2) - 1):
                inv[s2[i] + s2[i + 1]].add(pid)
    # 单字命中面太宽（"之""不"这类），先截断；等做了相关性排序再放开
    for ch in sorted(single):
        inv[ch] |= set(sorted(single[ch])[:SINGLE_CAP])
    # 每个桶自带一张卡片小表，倒排表只存表内下标。
    # 这样一次检索 = 取一两个桶文件，不必再回头去抓 index/ 或 body/ 拼卡片。
    sb = defaultdict(lambda: {"c": [], "g": {}, "_at": {}})
    for gram in sorted(inv):
        ids = inv[gram]
        B = sb[bucket(gram, SEARCH_BUCKETS)]
        refs = []
        for pid in sorted(ids):
            if pid not in B["_at"]:
                c = cards[pid]
                B["_at"][pid] = len(B["c"])
                B["c"].append([pid, c["t"], c["a"], c["d"], c["b"]])
            refs.append(B["_at"][pid])
        B["g"][gram] = refs
    for k, B in sb.items():
        w("search/%02d.json" % k, {"c": B["c"], "g": B["g"]})

    # ---- id → (朝代序, 全文分片)，供 #/poem/<id> 直接定位 ----
    lk = defaultdict(dict)
    for pid, c in cards.items():
        lk[bucket(pid, LOOKUP_BUCKETS)][pid] = [c["d"], c["b"]]
    for k, payload in lk.items():
        w("lookup/%02d.json" % k, payload)

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
        # 跨朝代轮转取样：宁可让"月"横跨千年，也不要只给最早的 300 首。
        # 用每朝代的游标代替 pop(0)——pop(0) 每取一条都要把整表前移，是 O(n²)。
        picked, keys, i, n = [], sorted(buckets_by_dyn), 0, len(buckets_by_dyn)
        ptr = {k: 0 for k in keys}
        while len(picked) < CHAR_MAX_HITS:
            found = False
            for _ in range(n):
                k = keys[i % n]
                i += 1
                if ptr[k] < len(buckets_by_dyn[k]):
                    picked.append(buckets_by_dyn[k][ptr[k]])
                    ptr[k] += 1
                    found = True
                    break
            if not found:
                break
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
    # 指纹：逐条喂进 md5，避免为整个语料拼一张大 JSON 再哈希。
    # 字节流必须与老写法 json.dumps({p: (text, trans)…}, sort_keys=True) 完全一致，
    # 否则语料没动也会换一个 build 号，把 build_relevance 的产物误标成 stale。
    h = hashlib.md5()
    first = True
    for p in sorted(full):
        h.update(b"{" if first else b", ")
        first = False
        h.update(json.dumps(p, ensure_ascii=False).encode("utf-8"))
        h.update(b": [")
        h.update(json.dumps(full[p]["text"], ensure_ascii=False).encode("utf-8"))
        h.update(b", ")
        h.update(json.dumps(full[p].get("translation", ""), ensure_ascii=False).encode("utf-8"))
        h.update(b"]")
    h.update(b"}")
    fp = h.hexdigest()[:10]
    # 各编辑层的覆盖率 —— admin.html 靠这个判断哪一层还欠账，
    # 不必再为了几个计数把整个语料塞进浏览器。
    def has(f):
        return sum(1 for r in full.values() if r.get(f))
    coverage = {
        "译文": has("translation"), "注释": has("notes"), "赏析": has("appreciation"),
        "英译": has("english"), "拼音": has("pinyin"), "主题": has("themes"),
        "地点坐标": len(places),
        "断代年份": sum(1 for r in full.values() if not r["yearEstimated"]),
    }
    models = Counter(r.get("enrichedBy") for r in full.values() if r.get("enrichedBy"))

    manifest = {
        "build": fp,
        "total": len(full),
        "curated": len(curated),
        "coverage": coverage,
        "models": [{"n": k, "c": v} for k, v in models.most_common()],
        "anon": sum(1 for r in full.values() if r["author"] == "佚名"),
        "dynasties": [{"k": k, "o": o, "slug": s, "span": sp,
                       **index_shards.get(s, {"shards": 0, "count": 0, "bodies": 0})}
                      for k, o, s, sp in CL.DYNASTIES if s in index_shards],
        "indexShard": INDEX_SHARD, "bodyChunk": BODY_CHUNK, "aggShard": AGG_SHARD,
        "authorBuckets": AUTHOR_BUCKETS, "searchBuckets": SEARCH_BUCKETS,
        "charBuckets": CHAR_BUCKETS, "lookupBuckets": LOOKUP_BUCKETS,
        "tailBuckets": TAIL_BUCKETS,
        "authors": len(authors), "themes": len(theme_meta), "forms": len(form_meta),
        "places": len(places),
        "charsIndexed": len(top), "charsDistinct": len(freq),
        "charMaxHits": CHAR_MAX_HITS, "charsTruncated": truncated,
        "searchScope": "title+author",
    }

    # 相近篇目与 BM25 那几项是 build_relevance.py 写的，不归本脚本管，
    # 但 manifest 是整份重写的 —— 不接过来的话，跑完这个脚本相似度就"消失"了：
    # 页面不报错，只是那一块静悄悄不见，这种问题最难查。
    OWNED = ["nearBuckets", "bm25Buckets", "nearK", "nearCount", "dupCount",
             "nearSemantic", "bm25"]
    carried = {k: prev_manifest[k] for k in OWNED if k in prev_manifest}
    if carried:
        manifest.update(carried)
        # 语料指纹变了而 build_relevance 还没重跑 —— 邻居表是旧的。
        # 旧不等于坏：邻居指向的作品若已不在，前端那一行自己会消失。
        manifest["relevanceStale"] = prev_manifest.get("build") != manifest["build"]
        if manifest["relevanceStale"]:
            print("\n注意：相近篇目与 BM25 索引还是上一版语料算的。")
            print("      重算：./.venv-ml/bin/python tools/embed_corpus.py"
                  " && ./.venv/bin/python tools/build_relevance.py")
    else:
        print("\n提示：还没有相近篇目与 BM25 索引。")
        print("      生成：./.venv-ml/bin/python tools/embed_corpus.py"
              " && ./.venv/bin/python tools/build_relevance.py")
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
    for d in ["index", "body", "agg", "search", "chars", "lookup"]:
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
