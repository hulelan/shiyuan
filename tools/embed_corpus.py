#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
embed_corpus.py — 把全库嵌成向量，算出每篇的近邻，只留近邻表。

    ./.venv-ml/bin/python tools/embed_corpus.py            # 全量
    ./.venv-ml/bin/python tools/embed_corpus.py --limit 200

关键的一条：**向量不上线**。
1024 维 float32，50k 篇就是 200 MB，而且浏览器拿到向量还得自己算点积。
构建期把近邻算完，只发每篇的前 12 个邻居 —— 十几 MB，前端一个 fetch 就完事。
代价是"任意两篇有多像"查不了，但页面上本来也只需要"跟这篇像的是哪几篇"。

嵌什么，比用哪个模型更要紧：
原文是文言，模型见过的绝大多数中文是白话，直接嵌原文效果并不好。
译文和赏析是现成的白话，还把诗的意思直说了出来 —— 那才是模型读得懂的那一面。
所以两路都嵌，最后加权合并（见 relevance_lib.blend）。
没做过 enrich 的篇目只有古文一路，邻居质量会明显差一截，这是实情，页面上会标出来。

模型走本地，不走 API：4300 篇跑一次几分钟，重跑不要钱，也不必把语料发出去。
"""

import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import corpus_lib as CL
import relevance_lib as R

MODEL = "BAAI/bge-m3"
OUT = os.path.join(CL.ROOT, "data", "near_semantic.json")
CACHE = os.path.join(CL.ROOT, "data", ".embed_cache.json")

K = 12
BATCH = 32
MAX_CHARS = 1400          # bge-m3 吃得下 8k，但诗文很短，截长了只是浪费


def texts_for(src, enr):
    """
    两路文本。古文那路给一句提示，把模型从白话语感上拉开一点。

    不放作者名 —— 放了以后模型会拿名字去配名字：
    《江雪》柳宗元 的邻居会挤满柳永的词，只因为都姓柳。
    朝代也不放，同理：那是筛选用的字段，不是诗的内容。
    """
    cls = "古诗文。" + R.classical_text(src)
    mod = R.modern_text(enr)
    return cls[:MAX_CHARS], mod[:MAX_CHARS]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="只处理前 N 篇（试跑用）")
    ap.add_argument("--model", default=MODEL)
    ap.add_argument("--k", type=int, default=K)
    ap.add_argument("--no-cache", action="store_true", help="忽略已存的向量，全部重算")
    args = ap.parse_args()

    src = CL.load_source()
    enr = CL.load_enrich()
    ids = sorted(src)
    if args.limit:
        ids = ids[:args.limit]
    print("语料 %d 篇" % len(ids))

    from sentence_transformers import SentenceTransformer
    import numpy as np
    import torch

    dev = "mps" if torch.backends.mps.is_available() else "cpu"
    print("模型 %s，设备 %s" % (args.model, dev))
    t0 = time.time()
    model = SentenceTransformer(args.model, device=dev)
    print("载入用时 %.1fs" % (time.time() - t0))

    cls_txt, mod_txt, mod_ids = [], [], []
    for pid in ids:
        c, m = texts_for(src[pid], enr.get(pid))
        cls_txt.append(c)
        if m.strip():
            mod_txt.append(m)
            mod_ids.append(pid)
    print("古文层 %d 篇；今文层 %d 篇（其余尚未 enrich）" % (len(cls_txt), len(mod_txt)))

    def embed(texts, tag):
        """
        自己分块并逐块报进度，不用 tqdm：它靠 \r 刷新，
        重定向到文件里就是一坨没有换行的字符，看不出跑到哪了。
        """
        t0 = time.time()
        chunks, step = [], 256
        for i in range(0, len(texts), step):
            chunks.append(model.encode(texts[i:i + step], batch_size=BATCH,
                                       normalize_embeddings=True,
                                       show_progress_bar=False,
                                       convert_to_numpy=True))
            done = min(i + step, len(texts))
            el = time.time() - t0
            print("  %s %d/%d  用时 %.0fs  预计还需 %.0fs"
                  % (tag, done, len(texts), el, el / done * (len(texts) - done)),
                  flush=True)
        import numpy as _np
        v = _np.vstack(chunks)
        print("  %s 完成：%d 条，%.1fs" % (tag, len(texts), time.time() - t0), flush=True)
        return v.astype("float32")

    # 向量存一份到 data/.embed_cache/，改邻居算法时就不必重嵌了
    # （嵌一次 6 分钟，调一次参数 20 秒）。该目录已 gitignore。
    cdir = os.path.join(CL.ROOT, "data", ".embed_cache")
    os.makedirs(cdir, exist_ok=True)
    sig = "%s-%d" % (args.model.replace("/", "_"), len(ids))

    def cached(name, texts, tag):
        f = os.path.join(cdir, "%s-%s.npy" % (sig, name))
        if os.path.exists(f) and not args.no_cache:
            v = np.load(f)
            if len(v) == len(texts):
                print("  %s：用缓存 %s" % (tag, os.path.basename(f)))
                return v
        v = embed(texts, tag)
        np.save(f, v)
        return v

    cls_vec = cached("cls", cls_txt, "古文层")
    mod_vec = cached("mod", mod_txt, "今文层") if mod_txt else None

    def neighbours(vec, keys, tag=""):
        """
        向量已归一化，点积即余弦。分块算，别一次开 n×n 的矩阵：
        50k 篇的全矩阵是 10 GB，分块之后峰值只跟块大小有关。

        两遍：先量出每一点的"人缘"，再据此修正。
        高维空间里有些点天生离谁都近（hubness）—— 直接取余弦最大的几个，
        柳永那些长调会挤进几乎每一首诗的邻居表，无论那首诗写的是什么。
        这不是它们真的像，是它们在这个空间里坐得靠中间。

        CSLS 就是冲这个来的：sim' = 2cos(x,y) - r(x) - r(y)，
        r 是该点到自己前 k 个邻居的平均余弦。人缘越好的点，扣得越多。
        """
        n = len(keys)
        kk = min(args.k, max(1, n - 1))
        step = 512

        def blocks():
            for i in range(0, n, step):
                sim = vec[i:i + step] @ vec.T
                for r in range(sim.shape[0]):
                    sim[r, i + r] = -1              # 自己不算自己的邻居
                yield i, sim

        # 第一遍：每点到前 kk 名的平均余弦
        rbar = np.empty(n, dtype="float32")
        for i, sim in blocks():
            part = np.partition(sim, -kk, axis=1)[:, -kk:]
            rbar[i:i + sim.shape[0]] = part.mean(axis=1)
        print("    %s 人缘均值：%.3f ~ %.3f" % (tag, float(rbar.min()), float(rbar.max())))

        # 第二遍：按 CSLS 修正后再取前 k
        out = {}
        for i, sim in blocks():
            adj = 2.0 * sim - rbar[i:i + sim.shape[0], None] - rbar[None, :]
            idx = np.argpartition(-adj, kk, axis=1)[:, :kk]
            for r in range(adj.shape[0]):
                order = idx[r][np.argsort(-adj[r, idx[r]])]
                # 存的是原始余弦（人看得懂的"有多像"），排序用的是修正值
                out[keys[i + r]] = [(keys[j], round(float(sim[r, j]), 4))
                                    for j in order if adj[r, j] > 0]
            if (i // step) % 4 == 0:
                print("    %s 近邻 %d/%d" % (tag, min(i + step, n), n))
        return out

    print("算近邻…")
    near_cls = neighbours(cls_vec, ids, "古文")
    near_mod = neighbours(mod_vec, mod_ids, "今文") if mod_vec is not None else {}

    # 两路各自成表，交给 build_relevance.py 去跟词面层一起融合 ——
    # 在这里先合一次，等于把名次信息丢掉两回。
    near = {"cls": {p: list(v) for p, v in near_cls.items()},
            "mod": {p: list(v) for p, v in near_mod.items()}}

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"model": args.model, "k": args.k,
                   "enriched": len(mod_ids), "total": len(ids),
                   "near": near}, f, ensure_ascii=False)
    mb = os.path.getsize(OUT) / 1e6
    print("\n写入 %s（%.1f MB）" % (os.path.relpath(OUT, CL.ROOT), mb))
    print("下一步：./.venv/bin/python tools/build_relevance.py  # 与词面层合并后分片")


if __name__ == "__main__":
    main()
