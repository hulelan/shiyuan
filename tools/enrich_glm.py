#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
enrich_glm.py — 用 GLM-4.7（经 OpenRouter）为 data/corpus.json 里的诗文
生成 译文 / 注释 / 赏析 / 英译 / 主题 / 创作地点 / 年份。

密钥读取顺序：环境变量 OPENROUTER_API_KEY  →  项目根目录 .env 文件里的
OPENROUTER_API_KEY=xxx 一行。密钥不会出现在代码或输出里。

用法：
    ../.venv/bin/python enrich_glm.py --limit 20      # 先试 20 首
    ../.venv/bin/python enrich_glm.py                 # 处理全部未生成的
    ../.venv/bin/python enrich_glm.py --workers 4     # 并发（默认 3）

每处理 20 首自动落盘（corpus.json + corpus.js），可随时中断续跑。
生成内容标注 enrichedBy=glm-4.7，网页会显示“AI 生成·待校订”。
"""
import json, os, sys, time, argparse, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CORPUS = os.path.join(ROOT, "data", "corpus.json")
CORPUS_JS = os.path.join(ROOT, "data", "corpus.js")

MODEL = "z-ai/glm-4.7"
ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
REASONING = False   # 默认关闭思维链；--reasoning 开启（更深但慢 ~9x、贵 ~3x）

def load_key():
    k = os.environ.get("OPENROUTER_API_KEY")
    if k:
        return k.strip()
    envp = os.path.join(ROOT, ".env")
    if os.path.exists(envp):
        for line in open(envp, encoding="utf-8"):
            line = line.strip()
            if line.startswith("OPENROUTER_API_KEY"):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("未找到 OPENROUTER_API_KEY。请 export，或在项目根目录 .env 写：\n"
             "OPENROUTER_API_KEY=sk-or-...")

SYSTEM = (
    "你是一位精通中国古典文学的学者与优秀的中英翻译。"
    "给定一首古诗词曲的原文，你要产出准确、雅正的赏读资料，并严格以 JSON 返回。"
)

PROMPT_TMPL = """请为下面这首作品撰写赏读资料。

标题：{title}
作者：{author}
朝代：{dynasty}
原文：
{text}

只返回一个 JSON 对象（不要 markdown 代码块、不要多余文字），字段如下：
{{
  "translation": "通顺的白话译文，忠于原意",
  "notes": [{{"term":"字词/典故","explain":"简明解释"}}],   // 3-6 条，挑难点
  "appreciation": "120-220字的赏析，谈意境、手法与情感，勿空泛",
  "english": "流畅自然的英文翻译，可用 / 分隔诗行",
  "themes": ["主题词"],                                      // 2-4 个中文主题，如 思乡/送别/田园/爱情/咏物/怀古/边塞/哲理
  "place": {{"name":"创作地点古称","modern":"今地名","lat":纬度数字,"lng":经度数字}},  // 有据可考则填，拿不准填 null
  "yearLabel": "尽量具体的创作年份或时期，如“盛唐 约750年”"
}}
若某字段确实无法判断，宁可从简，但 translation/appreciation/english 必须给出。"""

def call_glm(key, poem, timeout=120):
    body = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": PROMPT_TMPL.format(
                title=poem["title"], author=poem["author"],
                dynasty=poem["dynasty"], text=poem["text"])},
        ],
        "temperature": 0.6,
        "response_format": {"type": "json_object"},
        # 关闭思维链：本任务无需推理，可提速 ~9x、省 ~3x（--reasoning 可开启）
        "reasoning": {"enabled": REASONING},
    }
    req = urllib.request.Request(
        ENDPOINT, data=json.dumps(body).encode("utf-8"),
        headers={"Authorization": "Bearer " + key,
                 "Content-Type": "application/json",
                 "HTTP-Referer": "https://localhost/shiyuan",
                 "X-Title": "ShiYuan Poetry"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = json.loads(r.read().decode("utf-8"))
    content = data["choices"][0]["message"]["content"]
    # 容错：剥掉可能的 ```json 包裹
    content = content.strip()
    if content.startswith("```"):
        content = content.split("```", 2)[1]
        if content.startswith("json"):
            content = content[4:]
    return json.loads(content)

def _s(v):
    return v.strip() if isinstance(v, str) else ""

def _parse_notes(raw):
    """兼容模型把注释返回成 dict、字符串、甚至 “词：释义” 形式。"""
    out = []
    if not isinstance(raw, list):
        return out
    for n in raw:
        if isinstance(n, dict):
            term = _s(n.get("term")) or _s(n.get("word")) or _s(n.get("name"))
            explain = _s(n.get("explain")) or _s(n.get("explanation")) or _s(n.get("meaning")) or _s(n.get("desc"))
            if term or explain:
                out.append({"term": term, "explain": explain})
        elif isinstance(n, str) and n.strip():
            s = n.strip()
            for sep in ("：", ":", "—", "-"):
                if sep in s:
                    a, b = s.split(sep, 1)
                    out.append({"term": a.strip(), "explain": b.strip()})
                    break
            else:
                out.append({"term": "", "explain": s})
    return out

def apply_enrichment(poem, e):
    label = MODEL.split("/")[-1]        # 如 z-ai/glm-5.2 → glm-5.2
    if _s(e.get("translation")):  poem["translation"] = _s(e["translation"])
    if _s(e.get("appreciation")): poem["appreciation"] = _s(e["appreciation"])
    if _s(e.get("english")):      poem["english"] = _s(e["english"])
    notes = _parse_notes(e.get("notes"))
    if notes:
        poem["notes"] = notes
    if isinstance(e.get("themes"), list):
        poem["themes"] = [t.strip() for t in e["themes"] if isinstance(t, str) and t.strip()][:4]
    pl = e.get("place")
    if isinstance(pl, dict) and isinstance(pl.get("lat"), (int, float)) and isinstance(pl.get("lng"), (int, float)):
        poem["place"] = {"name": _s(pl.get("name")), "modern": _s(pl.get("modern")),
                         "lat": float(pl["lat"]), "lng": float(pl["lng"])}
    if _s(e.get("yearLabel")):
        poem["yearLabel"] = _s(e["yearLabel"])
    poem["english"] = poem.get("english", "")
    poem["englishBy"] = label + " 译"
    poem["enriched"] = True
    poem["enrichedBy"] = label

def save(poems):
    json.dump(poems, open(CORPUS, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    with open(CORPUS_JS, "w", encoding="utf-8") as f:
        f.write("/* 自动生成 — 原文来自 chinese-poetry（公有领域）；\n")
        f.write("   译文/注释/赏析/英译/主题/地点由 GLM-4.7 生成，标 enrichedBy 者为 AI 生成·待校订。 */\n")
        f.write("window.POEMS_IMPORTED = ")
        json.dump(poems, f, ensure_ascii=False, indent=1)
        f.write(";\n")

def main():
    global MODEL, REASONING
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="本次最多处理多少首（0=全部）")
    ap.add_argument("--sample", type=int, default=0, help="跨朝代/体裁均匀抽 N 首来试（而非取前 N 首）")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--model", default=MODEL)
    ap.add_argument("--reasoning", action="store_true", help="开启思维链（更深，但慢 ~9x、贵 ~3x）")
    args = ap.parse_args()
    MODEL = args.model
    REASONING = args.reasoning

    key = load_key()
    poems = json.load(open(CORPUS, encoding="utf-8"))
    todo = [p for p in poems if not p.get("enriched")]
    if args.sample:
        # 按 (朝代, 体裁) 分桶，轮转抽取，尽量覆盖诗/词/曲/文各类
        buckets = {}
        for p in todo:
            buckets.setdefault((p["dynasty"], p["genre"]), []).append(p)
        keys = sorted(buckets.keys())
        picked, i = [], 0
        while len(picked) < args.sample and any(buckets[k] for k in keys):
            k = keys[i % len(keys)]
            if buckets[k]:
                picked.append(buckets[k].pop(0))
            i += 1
        todo = picked
    elif args.limit:
        todo = todo[:args.limit]
    print("待生成 %d / 共 %d 首，模型 %s，并发 %d" % (len(todo), len(poems), MODEL, args.workers))
    if not todo:
        print("没有需要生成的。"); return

    done = 0; fail = 0
    t0 = time.time()
    def work(p):
        for attempt in range(3):
            try:
                return p, call_glm(key, p)
            except urllib.error.HTTPError as ex:
                msg = ex.read().decode("utf-8", "ignore")[:200]
                if ex.code in (429, 500, 502, 503):
                    time.sleep(2 * (attempt + 1)); continue
                return p, {"__error__": "HTTP %s %s" % (ex.code, msg)}
            except Exception as ex:
                time.sleep(1.5 * (attempt + 1))
                if attempt == 2:
                    return p, {"__error__": str(ex)[:200]}
        return p, {"__error__": "重试耗尽"}

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = [ex.submit(work, p) for p in todo]
        for fut in as_completed(futs):
            p, e = fut.result()
            if "__error__" in e:
                fail += 1
                print("  ✗ 《%s》%s — %s" % (p["title"], p["author"], e["__error__"]))
            else:
                try:
                    apply_enrichment(p, e)   # 单条解析出错绝不能中断整批
                    done += 1
                    if done % 5 == 0 or done == len(todo):
                        rate = done / max(1e-9, time.time() - t0)
                        print("  ✓ %d/%d  《%s》%s  (%.1f 首/秒)" % (done, len(todo), p["title"], p["author"], rate))
                except Exception as ex:
                    fail += 1
                    print("  ✗ 《%s》%s — 解析失败: %s" % (p["title"], p["author"], str(ex)[:120]))
            if (done + fail) % 20 == 0:
                save(poems)
    save(poems)
    print("\n完成：成功 %d，失败 %d，用时 %.0f 秒。" % (done, fail, time.time() - t0))
    print("已写回 data/corpus.json 与 data/corpus.js。刷新网页即可看到。")

if __name__ == "__main__":
    main()
