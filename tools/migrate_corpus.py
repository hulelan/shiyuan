"""
migrate_corpus.py — 一次性迁移：把旧的单体语料拆成 原文层 / 编辑层。

    读  data/corpus.json   （2954 篇，位置编号 id "imp-d594-0"）
        data/poems.js      （12 篇精编，手写 id "guanju" 等）
    写  data/source/*.jsonl
        data/enrich/*.jsonl
        data/id_map.json   旧 id → 新 id（留档，出事能回溯）

旧的 corpus.json / corpus.js 原样保留，本脚本只增不删。
校验通过、网页切到新数据源之后，再手动删除旧文件。

    python3 tools/migrate_corpus.py          # 试运行，只报告不落盘
    python3 tools/migrate_corpus.py --write  # 真正写文件
"""

import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import corpus_lib as CL


def load_curated():
    """poems.js 是手写的 JS（带注释），借 node 求值成 JSON。"""
    script = 'global.window={};require(%s);process.stdout.write(JSON.stringify(window.POEMS));' % \
             json.dumps(os.path.join(CL.DATA, "poems.js"))
    out = subprocess.run(["node", "-e", script], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def split(rec, new_id, curated):
    """把一条完整记录拆成 (原文层, 编辑层)。"""
    src = {
        "id": new_id,
        "title": rec.get("title", ""),
        "author": rec.get("author", "") or "佚名",
        "dynasty": rec.get("dynasty", ""),
        "dynastyOrder": rec.get("dynastyOrder") or CL.ORDER.get(rec.get("dynasty"), 99),
        "year": rec.get("year"),
        "yearLabel": rec.get("yearLabel", ""),
        "form": rec.get("form", ""),
        "genre": rec.get("genre", ""),
        "text": rec.get("text", ""),
        "pinyin": rec.get("pinyin", ""),
        "source": rec.get("source", "编者" if curated else "chinese-poetry"),
        "curated": curated,
    }
    enr = {
        "id": new_id,
        "themes": rec.get("themes") or [],
        "place": rec.get("place"),
        "translation": rec.get("translation", "") or "",
        "notes": rec.get("notes") or [],
        "appreciation": rec.get("appreciation", "") or "",
        "english": rec.get("english", "") or "",
        "englishBy": rec.get("englishBy", "") or "",
        "enrichedBy": rec.get("enrichedBy", "") or "",
        "_slug": CL.SLUG.get(rec.get("dynasty")),
    }
    return src, enr


def main():
    write = "--write" in sys.argv

    curated = load_curated()
    imported = json.load(open(os.path.join(CL.DATA, "corpus.json"), encoding="utf-8"))
    print("读入  精编 %d 篇  /  导入 %d 篇  =  %d" % (
        len(curated), len(imported), len(curated) + len(imported)))

    # 精编在前：同一首诗若两边都有，以手写的那份为准。
    sources, enrichments, id_map = {}, {}, {}
    dropped = []
    unknown_dyn = []
    for rec, is_cur in [(r, True) for r in curated] + [(r, False) for r in imported]:
        nid = CL.stable_id(rec.get("author"), rec.get("title"), rec.get("text"))
        id_map[rec["id"]] = nid
        if rec.get("dynasty") not in CL.SLUG:
            unknown_dyn.append((rec["id"], rec.get("dynasty")))
            continue
        if nid in sources:
            dropped.append((rec["id"], nid, rec.get("title"), rec.get("author")))
            continue
        s, e = split(rec, nid, is_cur)
        sources[nid] = s
        enrichments[nid] = e

    print("去重后 %d 篇（合并掉 %d 篇重复）" % (len(sources), len(dropped)))
    if unknown_dyn:
        print("!! 朝代不在表内、已跳过 %d 篇: %s" % (len(unknown_dyn), unknown_dyn[:5]))
    for old, nid, t, a in dropped[:10]:
        print("   重复: %s 《%s》%s" % (old, t, a))

    # --- 校验：编辑层一条都不能丢 ---
    def enriched_old(r):
        return bool(r.get("translation") or r.get("appreciation")
                    or r.get("english") or r.get("notes"))

    before = sum(1 for r in curated + imported if enriched_old(r))
    after = sum(1 for e in enrichments.values() if CL.is_enriched(e))
    print("\n编辑层记录数  迁移前 %d  →  迁移后 %d" % (before, after))

    layers = {"译文": "translation", "注释": "notes", "赏析": "appreciation",
              "英译": "english", "主题": "themes", "地点": "place"}
    print("逐层比对：")
    ok = True
    for label, field in layers.items():
        b = sum(1 for r in curated + imported if r.get(field))
        a = sum(1 for e in enrichments.values() if e.get(field))
        # 差额应当只来自被合并掉的重复条目
        flag = "" if a >= b - len(dropped) else "   << 有损失！"
        if flag:
            ok = False
        print("   %-4s 前 %5d  后 %5d  差 %+d%s" % (label, b, a, a - b, flag))

    if not ok:
        print("\n校验未通过，未写入任何文件。")
        return 1

    if not write:
        print("\n（试运行。加 --write 才会落盘。）")
        return 0

    ns = CL.save_layer(CL.SOURCE_DIR, list(sources.values()), CL.SOURCE_FIELDS)
    ne = CL.save_layer(CL.ENRICH_DIR, list(enrichments.values()), CL.ENRICH_FIELDS)
    json.dump(id_map, open(os.path.join(CL.DATA, "id_map.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=0, sort_keys=True)

    print("\n已写入 data/source/ 与 data/enrich/：")
    for slug in sorted(ns, key=lambda s: [d[2] for d in CL.DYNASTIES].index(s)):
        print("   %-11s 原文 %5d   编辑 %5d" % (slug, ns[slug], ne.get(slug, 0)))
    print("   id_map.json  %d 条旧→新映射" % len(id_map))
    print("\n旧的 corpus.json / corpus.js 未改动。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
