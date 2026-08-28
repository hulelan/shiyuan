#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_relevance.py — 出两样东西：

  data/site/near/<桶>.json    每篇的近邻（"与此篇相近"）
  data/site/bm25/<桶>.json    检索用的倒排 + BM25 所需的统计

近邻有两个来源：
  词面层  本脚本现算 —— 字的二元组 TF-IDF，无依赖、可重现、秒级
  语义层  embed_corpus.py 预先算好放在 data/near_semantic.json（可选）
两者都在就加权合并。词面层认得出共用"明月""捣衣"的篇目，
语义层认得出说同一件事却不共用一个字的篇目 —— 两种"像"都是真的像。
没跑过 embed_corpus.py 也能出结果，只是少一半信号，manifest 里会记下来。

检索这边把**正文纳入索引**，并改用 BM25 排序。原先只索引标题与作者、
且命中即算数、不排先后，搜"月"出来的顺序基本是随机的。
"""

import json
import math
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import corpus_lib as CL
import relevance_lib as R

SITE = os.path.join(CL.ROOT, "data", "site")
SEMANTIC = os.path.join(CL.ROOT, "data", "near_semantic.json")

NEAR_BUCKETS = 64
BM25_BUCKETS = 64
K = 8                    # 页面上一次给 8 篇，多了就成列表页了
W_LEX, W_SEM = 0.40, 0.60

# BM25 的两个常数，取通行值。b 控制长度归一：
# 诗有四行的也有几百字的赋，不归一的话长篇会仗着词多通吃。
BM25_K1, BM25_B = 1.4, 0.72
POST_CAP = 1200          # 单个词最多留多少篇，按 BM25 权重取前列


def bucket(s, n):
    """与 build_site_data.py / store.js 同一套 FNV-1a。"""
    h = 2166136261
    b = s.encode("utf-16-le")
    for i in range(0, len(b), 2):
        h ^= b[i] | (b[i + 1] << 8)
        h = (h * 16777619) & 0xFFFFFFFF
    return h % n


def w(path, obj):
    p = os.path.join(SITE, path)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return os.path.getsize(p)


def main():
    src = CL.load_source()
    enr = CL.load_enrich()
    ids = sorted(src)
    print("语料 %d 篇" % len(ids))

    # ---------- 词面近邻 ----------
    print("词面层：切词、算 TF-IDF…")
    cls_docs = {p: R.classical_text(src[p]) for p in ids}
    mod_docs = {p: R.modern_text(enr.get(p)) for p in ids}
    mod_docs = {p: t for p, t in mod_docs.items() if t.strip()}
    print("  古文层 %d 篇；今文层 %d 篇" % (len(cls_docs), len(mod_docs)))

    cls_vec, _ = R.build_tfidf(cls_docs)
    lex_cls = R.knn(cls_vec, k=K * 2)
    lex_mod = {}
    if mod_docs:
        mod_vec, _ = R.build_tfidf(mod_docs)
        lex_mod = R.knn(mod_vec, k=K * 2)

    # ---------- 语义近邻（可选） ----------
    sem_cls, sem_mod, sem_meta = {}, {}, None
    if os.path.exists(SEMANTIC):
        d = json.load(open(SEMANTIC, encoding="utf-8"))
        # 向量文件可能比语料旧：既会少了新篇，也会留着已经删掉的篇。
        # 后者必须在这里滤掉 —— 否则那些 id 会混进邻居表，
        # 到下面查 src[pid] 时才炸，而且报的是一个看不出所以然的 KeyError。
        def clean(tbl):
            out = {}
            for pid, v in tbl.items():
                if pid not in src:
                    continue
                keep = [tuple(x) for x in v if x[0] in src]
                if keep:
                    out[pid] = keep
            return out
        sem_cls = clean(d["near"]["cls"])
        sem_mod = clean(d["near"]["mod"])
        stale = (len(d["near"]["cls"]) - len(sem_cls))
        sem_meta = {"model": d.get("model"), "enriched": d.get("enriched")}
        print("语义层：%s，古文 %d 篇 / 今文 %d 篇"
              % (sem_meta["model"], len(sem_cls), len(sem_mod)))
        # 语料变过而没重跑 embed_corpus.py 时，新篇目只有词面一路信号。
        # 这不算坏，但邻居明显更松，得说出来 —— 不然只会觉得"新导的诗推荐不准"。
        gap = [p for p in ids if p not in sem_cls]
        if gap:
            print("  ！其中 %d 篇没有语义向量（语料比向量新），只能靠词面层。"
                  % len(gap))
            print("    补齐：./.venv-ml/bin/python tools/embed_corpus.py --no-cache")
            sem_meta["missing"] = len(gap)
        if stale:
            print("  另有 %d 篇向量对应的作品已从语料里删掉，已忽略" % stale)
    else:
        print("语义层：没找到 data/near_semantic.json —— 只用词面层。")
        print("  跑一遍 ./.venv-ml/bin/python tools/embed_corpus.py 可以补上。")

    # 四张表一起融合，而不是两两先合。
    # 今文层（译文/赏析）说的是诗的意思，权重给高些；
    # 古文层说的是用字，是所有篇目都有的那一路，不能压太低。
    tables = [(W_LEX * 0.45, lex_cls), (W_LEX * 0.55, lex_mod)]
    if sem_cls:
        tables += [(W_SEM * 0.45, sem_cls), (W_SEM * 0.55, sem_mod)]
    else:
        tables = [(0.45, lex_cls), (0.55, lex_mod)]
    near = R.fuse([t for t in tables if t[1]], k=K + 6)

    # ---------- 分出"同篇异录" ----------
    # 本库里同一首诗常有两条：《杂曲歌辞 蜀道难》与《蜀道难》、
    # 精编的《江雪》与导入的《江雪》、乃至《赤壁》分挂在杜牧与李商隐名下。
    # 这些若混在"相近的篇目"里，头几位会被自己的副本占满，等于没有推荐。
    # 但它们本身是有意思的 —— 异文、异题、异属，值得单独列一行。
    print("分辨同篇异录…")
    # 判定只看古文层的词面余弦 + 字面覆盖，不看融合后的名次：
    # 语义模型分不出"同一首诗的两处著录"和"两首很像的诗"，字面覆盖分得出。
    lexmap = {p: dict(v) for p, v in lex_cls.items()}
    dup, kin = defaultdict(list), {}
    ndup = 0
    for pid, lst in near.items():
        a = src[pid].get("text", "")
        d, k2 = [], []
        for o, sc, _f in lst:
            lex = lexmap.get(pid, {}).get(o, 0.0)
            # 先用词面分粗筛，再算覆盖率 —— 覆盖率贵，不能对每一对都算
            # 门槛放到 0.70：真正的异文本来就不会字字相同。
            # 《静夜思》两个传本"床前明月光"与"床前看月光"，覆盖率 0.80 ——
            # 那正是最值得并列给人看的一对，卡在 0.82 反而把它漏掉了。
            if lex >= 0.55 and R.overlap(a, src[o].get("text", "")) >= 0.70:
                d.append([o, round(lex, 3)])
            else:
                k2.append([o, round(sc, 3)])
        if d:
            dup[bucket(pid, NEAR_BUCKETS)].append(pid)
            ndup += 1
        kin[pid] = (k2[:K], d[:4])
    print("  %d 篇有同篇异录（占 %.1f%%）" % (ndup, 100.0 * ndup / max(1, len(ids))))

    # 落一份清单供人工核对。不自动删 —— 哪一条该留是编辑判断：
    # 《赤壁》挂在杜牧还是李商隐名下、精编的《关雎》与全本该留哪个，
    # 都不是脚本能替人决定的事。
    rep = os.path.join(CL.ROOT, "data", "dupes.tsv")
    seen = set()
    rows = []
    for pid, (_k2, d) in kin.items():
        for o, sc in d:
            key = tuple(sorted([pid, o]))
            if key in seen:
                continue
            seen.add(key)
            A, B = src[key[0]], src[key[1]]
            rows.append((sc, key[0], A["dynasty"], A["title"], A["author"],
                         "精编" if A.get("curated") else "导入",
                         key[1], B["dynasty"], B["title"], B["author"],
                         "精编" if B.get("curated") else "导入"))
    rows.sort(reverse=True)
    with open(rep, "w", encoding="utf-8") as f:
        f.write("词面相似\tidA\t朝代A\t题A\t作者A\t来源A\tidB\t朝代B\t题B\t作者B\t来源B\n")
        for r in rows:
            f.write("\t".join(str(x) for x in r) + "\n")
    print("  清单写到 data/dupes.tsv（%d 对，供人工核对；脚本不自动删）" % len(rows))

    # ---------- 近邻分片 ----------
    # 邻居只存 id 与分数；标题作者等等由前端拿 id 去 lookup/ + body/ 取，
    # 那两份本来就在，重复存一遍纯属浪费。
    nb = defaultdict(dict)
    kept = 0
    for pid, (k2, d) in kin.items():
        if not k2 and not d:
            continue
        rec = {"n": k2}
        if d:
            rec["d"] = d
        nb[bucket(pid, NEAR_BUCKETS)][pid] = rec
        kept += 1
    nbytes = sum(w("near/%02d.json" % k, v) for k, v in nb.items())
    print("近邻：%d 篇有邻居，%d 个分片，%.1f MB" % (kept, len(nb), nbytes / 1e6))

    # ---------- BM25 ----------
    print("检索：建正文倒排…")
    # 标题与作者单独加权：搜"李白"该先出李白的作品，而不是提到李白的诗。
    fields = {}
    for pid in ids:
        r = src[pid]
        fields[pid] = (
            R.bigrams(r.get("title", "")) * 3 +
            R.bigrams(r.get("author", "")) * 4 +
            R.bigrams(r.get("text", ""))
        )
    dl = {p: len(t) for p, t in fields.items()}
    avgdl = sum(dl.values()) / max(1, len(dl))
    df = defaultdict(int)
    tfs = {}
    for pid, toks in fields.items():
        c = defaultdict(int)
        for t in toks:
            c[t] += 1
        tfs[pid] = c
        for t in c:
            df[t] += 1

    n = len(ids)
    post = defaultdict(list)
    for pid, c in tfs.items():
        L = dl[pid] or 1
        for t, f in c.items():
            d = df[t]
            if d < 2 and len(t) > 1:      # 只出现一次的二元组留不住，单字留着
                continue
            idf = math.log(1 + (n - d + 0.5) / (d + 0.5))
            s = idf * (f * (BM25_K1 + 1)) / (f + BM25_K1 * (1 - BM25_B + BM25_B * L / avgdl))
            post[t].append((round(s, 3), pid))

    trimmed = 0
    for t in post:
        if len(post[t]) > POST_CAP:
            post[t].sort(reverse=True)
            del post[t][POST_CAP:]
            trimmed += 1

    # 每桶自带卡片小表，倒排只存下标 —— 与 search/ 分片同一套路，
    # 一次检索只取一两个文件，不必再回头拼卡片。
    cards = {}
    for pid in ids:
        r = src[pid]
        cards[pid] = [pid, r["title"], r["author"], r["dynastyOrder"]]

    sb = defaultdict(lambda: {"c": [], "at": {}, "g": {}})
    for term in sorted(post):
        B = sb[bucket(term, BM25_BUCKETS)]
        refs = []
        for s, pid in sorted(post[term], key=lambda kv: (-kv[0], kv[1])):
            if pid not in B["at"]:
                B["at"][pid] = len(B["c"])
                B["c"].append(cards[pid])
            refs.append([B["at"][pid], s])
        B["g"][term] = refs
    bbytes = sum(w("bm25/%02d.json" % k, {"c": B["c"], "g": B["g"]})
                 for k, B in sb.items())
    print("BM25：%d 个词，%d 个分片，%.1f MB（%d 个词过长被截到 %d 篇）"
          % (len(post), len(sb), bbytes / 1e6, trimmed, POST_CAP))

    # ---------- 记进 manifest ----------
    mp = os.path.join(SITE, "manifest.json")
    m = json.load(open(mp, encoding="utf-8"))
    m["nearBuckets"] = NEAR_BUCKETS
    m["bm25Buckets"] = BM25_BUCKETS
    m["nearK"] = K
    m["nearCount"] = kept
    m["dupCount"] = ndup
    m["nearSemantic"] = sem_meta          # 没跑语义层时是 null，前端据此措辞
    m["bm25"] = {"k1": BM25_K1, "b": BM25_B, "cap": POST_CAP,
                 "avgdl": round(avgdl, 2)}
    m["relevanceStale"] = False       # 刚算完，跟当前语料是对上的
    with open(mp, "w", encoding="utf-8") as f:
        json.dump(m, f, ensure_ascii=False, sort_keys=True)
    print("\nmanifest 已更新。合计新增 %.1f MB。" % ((nbytes + bbytes) / 1e6))


if __name__ == "__main__":
    main()
