#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
compare_models.py — 在相同诗文上并排跑 GLM-4.7 与 GLM-5.2（均关思维链），
输出对照，便于判断是否值得为全量用 5.2。不写回 corpus。
用法：../.venv/bin/python compare_models.py
"""
import json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import enrich_glm as e

MODELS = ["z-ai/glm-4.7", "z-ai/glm-5.2"]
WANT = ["论语·学而篇 其1", "关雎"]  # 一首散文语录 + 一首诗

def pick(corpus):
    out = []
    for w in WANT:
        for p in corpus:
            if w in p["title"]:
                out.append(p); break
    # 再加一首唐诗
    for p in corpus:
        if p["dynasty"] == "唐" and p["genre"] == "诗":
            out.append(p); break
    return out

def run(key, poem, model):
    e.MODEL = model; e.REASONING = False
    t = time.time()
    r = e.call_glm(key, poem, timeout=90)
    return r, time.time() - t

def main():
    key = e.load_key()
    corpus = json.load(open(e.CORPUS, encoding="utf-8"))
    poems = pick(corpus)
    lines = ["# GLM-4.7 vs GLM-5.2 对照（均关思维链）\n"]
    for poem in poems:
        lines.append("\n" + "=" * 70)
        lines.append("## 《%s》%s  [%s·%s]" % (poem["title"], poem["author"], poem["dynasty"], poem["genre"]))
        lines.append("原文：" + poem["text"].replace("\n", " / "))
        for m in MODELS:
            try:
                r, dt = run(key, poem, m)
                lines.append("\n### %s  （%.1fs）" % (m, dt))
                lines.append("**译文**：" + (r.get("translation", "") or "")[:200])
                lines.append("**主题**：" + " ".join(r.get("themes", []) or []))
                lines.append("**注释**：" + " ｜ ".join("%s—%s" % (n.get("term",""), n.get("explain","")) for n in (r.get("notes") or [])[:3]))
                lines.append("**赏析**：" + (r.get("appreciation", "") or "")[:260])
                lines.append("**英译**：" + (r.get("english", "") or "").replace("\n", " ")[:200])
                lines.append("**地点**：" + json.dumps(r.get("place"), ensure_ascii=False))
            except Exception as ex:
                lines.append("\n### %s — 失败：%s" % (m, repr(ex)[:150]))
    out = "\n".join(lines)
    print(out)
    open(os.path.join(e.ROOT, "tools", "model_compare.md"), "w", encoding="utf-8").write(out)
    print("\n\n已保存 tools/model_compare.md")

if __name__ == "__main__":
    main()
