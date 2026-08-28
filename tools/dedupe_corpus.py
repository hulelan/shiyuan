#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
dedupe_corpus.py — 清掉同一首诗的重复著录。

    ./.venv/bin/python tools/dedupe_corpus.py             # 只看要删什么
    ./.venv/bin/python tools/dedupe_corpus.py --write     # 真删

为什么不能只按 stable_id 去重：那是 `作者|标题|去空白原文` 的哈希，
只认一字不差。库里真正的重复没有一类是一字不差的。

五类，只自动处理前三类 —— 后两类是编辑判断，脚本不替人拿主意：

    乐府栏目重出   《杂曲歌辞 蜀道难》←→《蜀道难》      自动：留没有栏目名的
    同文异题       原文一字不差，题目两样               自动：留题目更干净的
    精编撞导入     手工精编的那条 ←→ 导入的那条         自动：留精编
    ── 以上自动 ────────────────────────────────────
    传本异文       "床前明月光" ←→ "床前看月光"          留着，两条都要
    归属存疑       《赤壁》杜牧 ←→《赤壁》李商隐         留着，两条都要

后两类不是脏数据，是有意思的东西：详情页的「同篇异录」一栏就是给它们的。
清单另出一份 data/dupes_review.tsv，什么时候想逐条定夺都行。

删之前会做三件事，缺一件都会丢东西：
  1. 编辑层搬家 —— 被删那条的译文/注释/赏析若是留下那条没有的，搬过去。
     那是花钱生成的，不能跟着记录一起没。
  2. 配画改挂 —— assets/art/index.json 里指向被删 id 的，改指留下的那条。
  3. 精编标记继承 —— 被删的那条若是精编，把标记留给留下的那条。
"""

import argparse
import json
import os
import re
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import corpus_lib as CL
import relevance_lib as R

ART = os.path.join(CL.ROOT, "assets", "art", "index.json")
LOG = os.path.join(CL.ROOT, "data", "dedupe_log.tsv")
REVIEW = os.path.join(CL.ROOT, "data", "dupes_review.tsv")

OVERLAP = 0.70          # 与 build_relevance.py 的同篇异录门槛保持一致
LEXMIN = 0.55
NUM = re.compile(r"其([一二三四五六七八九十百零〇\d]+)\s*$")


def norm(s):
    return re.sub(r"[^一-鿿]", "", s or "")


def title_score(rec):
    """
    题目的"干净"程度，越小越该留。依次看：
      有没有乐府栏目名 → 题里带不带编号 → 题有多长
    《蜀道难》胜过《杂曲歌辞 蜀道难》；《出塞二首 一》胜过《横吹曲辞 出塞 一》。
    """
    t = rec["title"]
    m = NUM.search(t)
    n = 0
    if m:
        try:
            n = int(m.group(1))
        except ValueError:
            n = 999          # 中文数字，排在阿拉伯数字后面，不细究
    return (1 if R.YUEFU.match(t) else 0, 1 if m else 0, n, len(t), t)


def classify(A, B):
    """返回 (类别, 留下的, 删掉的)；不自动处理的返回 (类别, None, None)。"""
    if A["author"] != B["author"]:
        return ("归属存疑", None, None)

    ay, by = bool(R.YUEFU.match(A["title"])), bool(R.YUEFU.match(B["title"]))
    same_text = norm(A["text"]) == norm(B["text"])

    # 精编优先 —— 那是手工校过的。但有一个例外：
    # 精编那条明显更短时，多半是节选而不是校订。
    # 《关雎》的精编本只有前三章 48 字，导入本是全篇 80 字（五章）。
    # 留短的等于把后两章丢了。这种情况留长的，把精编标记和译注一并继承过去。
    if A.get("curated") != B.get("curated"):
        cur, imp = (A, B) if A.get("curated") else (B, A)
        if len(norm(imp["text"])) > len(norm(cur["text"])) * 1.3:
            return ("精编是节选", imp, cur)
        return ("精编撞导入", cur, imp)

    # 一个带栏目名一个不带 —— 无论正文有没有小出入，都是同一首的两处著录
    if ay != by:
        keep, drop = (B, A) if ay else (A, B)
        return ("乐府栏目重出", keep, drop)

    if same_text:
        keep, drop = sorted([A, B], key=title_score)[:2]
        return ("同文异题", keep, drop)

    return ("传本异文", None, None)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="真正落盘")
    args = ap.parse_args()

    src = CL.load_source()
    enr = CL.load_enrich()
    print("语料 %d 篇" % len(src))

    # 重新算一遍，不读 dupes.tsv —— 那份可能是上一版语料留下的
    print("找重复著录…")
    vecs, _ = R.build_tfidf({p: R.classical_text(src[p]) for p in src})
    near = R.knn(vecs, k=6, min_score=0.4)

    pairs, seen = [], set()
    for pid, lst in near.items():
        for other, sc in lst:
            key = tuple(sorted([pid, other]))
            if key in seen or sc < LEXMIN:
                continue
            seen.add(key)
            if R.overlap(src[key[0]]["text"], src[key[1]]["text"]) >= OVERLAP:
                pairs.append((sc, key[0], key[1]))
    pairs.sort(reverse=True)
    print("  %d 对" % len(pairs))

    # ---- 定夺 ----
    # 一首诗可能牵进不止一对（三处著录的情况）。按相似度从高到低处理，
    # 已经决定要删的就不再当作"留下的"去参与下一对，免得 A 删了 B、B 又删了 C。
    drops, decisions, review = {}, [], []
    counts = defaultdict(int)
    for sc, ia, ib in pairs:
        A, B = src[ia], src[ib]
        kind, keep, drop = classify(A, B)
        counts[kind] += 1
        if keep is None:
            review.append((sc, kind, A, B))
            continue
        if drop["id"] in drops or keep["id"] in drops:
            continue                      # 这一对里已经有一条要删了，跳过
        drops[drop["id"]] = keep["id"]
        decisions.append((sc, kind, keep, drop))

    print()
    for k in ("乐府栏目重出", "同文异题", "精编撞导入", "精编是节选",
              "传本异文", "归属存疑"):
        if counts[k]:
            auto = k in ("乐府栏目重出", "同文异题", "精编撞导入", "精编是节选")
            print("  %-6s %3d 对   %s" % (k, counts[k], "自动合并" if auto else "留着，两条都要"))
    print("\n实际要删 %d 篇（有些诗牵进不止一对，只算一次）" % len(drops))

    # ---- 编辑层搬家 / 配画改挂 / 精编继承 ----
    moved_enrich, moved_art, inherited = 0, 0, 0
    art = json.load(open(ART, encoding="utf-8")) if os.path.exists(ART) else []
    for did, kid in drops.items():
        de, ke = enr.get(did), enr.setdefault(kid, {"id": kid})
        if de:
            for f in CL.ENRICH_FIELDS:
                if f == "id":
                    continue
                if de.get(f) and not ke.get(f):
                    ke[f] = de[f]
                    moved_enrich += 1
        if src[did].get("curated") and not src[kid].get("curated"):
            src[kid]["curated"] = True
            inherited += 1
        for a in art:
            if a.get("poem") == did:
                a["poem"] = kid
                moved_art += 1
    print("编辑层搬家 %d 个字段；配画改挂 %d 幅；精编标记继承 %d 处"
          % (moved_enrich, moved_art, inherited))

    # ---- 清单 ----
    def w(path, header, rows):
        with open(path, "w", encoding="utf-8") as f:
            f.write("\t".join(header) + "\n")
            for r in rows:
                f.write("\t".join(str(x) for x in r) + "\n")

    w(LOG, ["相似", "类别", "留id", "留题", "留作者", "留来源",
            "删id", "删题", "删作者", "删来源"],
      [(round(sc, 3), k, kp["id"], kp["title"], kp["author"],
        "精编" if kp.get("curated") else "导入",
        dp["id"], dp["title"], dp["author"],
        "精编" if dp.get("curated") else "导入")
       for sc, k, kp, dp in decisions])
    w(REVIEW, ["相似", "类别", "idA", "题A", "作者A", "字数A",
               "idB", "题B", "作者B", "字数B"],
      [(round(sc, 3), k, A["id"], A["title"], A["author"], len(norm(A["text"])),
        B["id"], B["title"], B["author"], len(norm(B["text"])))
       for sc, k, A, B in review])
    print("\n决定写到 data/dedupe_log.tsv；待人工定夺的写到 data/dupes_review.tsv")

    # 删掉的若明显比留下的长，多半是留错了 —— 单独提出来看一眼
    odd = [(k, kp, dp) for _, k, kp, dp in decisions
           if len(norm(dp["text"])) > len(norm(kp["text"])) * 1.3]
    if odd:
        print("\n注意：以下 %d 处删掉的那条比留下的长出三成以上，值得看一眼 ——" % len(odd))
        for k, kp, dp in odd[:10]:
            print("   %s  留《%s》%s(%d字)  删《%s》%s(%d字)"
                  % (k, kp["title"], kp["author"], len(norm(kp["text"])),
                     dp["title"], dp["author"], len(norm(dp["text"]))))

    if not args.write:
        print("\n（试运行。加 --write 才会落盘。）")
        return

    for did in drops:
        src.pop(did, None)
        enr.pop(did, None)
    CL.save_layer(CL.SOURCE_DIR, list(src.values()), CL.SOURCE_FIELDS)
    # enrich 层的记录不带 dynasty，得从原文层借朝代来分片
    for pid, e in enr.items():
        if pid in src:
            e["_slug"] = CL.SLUG[src[pid]["dynasty"]]
    CL.save_layer(CL.ENRICH_DIR, [e for p, e in enr.items() if p in src],
                  CL.ENRICH_FIELDS)
    if moved_art:
        with open(ART, "w", encoding="utf-8") as f:
            f.write("[\n")
            f.write(",\n".join(json.dumps(a, ensure_ascii=False, sort_keys=True) for a in art))
            f.write("\n]\n")
    print("\n已删 %d 篇，原文层剩 %d 篇。" % (len(drops), len(src)))
    print("接着跑：build_site_data.py → embed_corpus.py → build_relevance.py")


if __name__ == "__main__":
    main()
