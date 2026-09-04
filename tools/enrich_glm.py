#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
enrich_glm.py — 经 OpenRouter 调模型，为原文层的诗文生成
译文 / 注释 / 赏析 / 英译 / 主题 / 创作地点 / 年份。

默认模型 qwen/qwen3-vl-235b-a22b-instruct；--model 可换。
已有的 2964 篇是早先用 glm-5.2 生成的，各条记录的 enrichedBy 字段
保留着当时的模型名，网页据此标注来源，不会因为换模型而混淆。

    读  data/source/*.jsonl   原文层（只读，绝不写）
        data/enrich/*.jsonl   编辑层（已有的部分，用来跳过）
    写  data/enrich/*.jsonl   只写这一层

密钥读取顺序：环境变量 OPENROUTER_API_KEY  →  项目根目录 .env 文件里的
OPENROUTER_API_KEY=xxx 一行。密钥不会出现在代码或输出里。

用法：
    ../.venv/bin/python enrich_glm.py --limit 20      # 先试 20 首
    ../.venv/bin/python enrich_glm.py --dry-run       # 只看待办清单，不调 API
    ../.venv/bin/python enrich_glm.py                 # 处理全部未生成的
    ../.venv/bin/python enrich_glm.py --workers 8     # 并发（默认 8）

每 200 首落盘一次，且只重写当次改动过的朝代分片，可随时中断续跑。
生成内容标注 enrichedBy=<模型名>，网页会显示"AI 生成·待校订"。
"""
import json, os, re, sys, time, argparse, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import corpus_lib as CL

MODEL = "qwen/qwen3-vl-235b-a22b-instruct"
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
  "notes": [{{"term":"字词/典故","explain":"简明解释"}}],   // {nnotes}
                       // term 必须是原文里**一字不差**的连续片段，页面要拿它在正文中定位、
                       // 做成可点的行内注（像莎剧笺注本那样）。不要写成"甲/乙"、
                       // "甲、乙"这种并列，也不要写标题或篇名；一条只注一处。
  "appreciation": "120-220字的赏析，谈意境、手法与情感，勿空泛",
  "english": "流畅自然的英文翻译，可用 / 分隔诗行",
  "themes": ["主题词"],                                      // 2-4 个中文主题，如 思乡/送别/田园/爱情/咏物/怀古/边塞/哲理
  "place": {{"name":"创作地点古称","modern":"今地名","lat":纬度数字,"lng":经度数字}},  // 有据可考则填，拿不准填 null
  "year": 公元年份数字,                                       // 创作年份，公元前为负数；只能估到几十年也请给中值，实在无据填 null
  "yearLabel": "尽量具体的创作年份或时期，如“盛唐 约750年”"
}}
若某字段确实无法判断，宁可从简，但 translation/appreciation/english 必须给出。"""

def notes_quota(poem):
    """
    要几条注，按篇幅走。

    原先一律"3-6 条"。那是照着绝句定的：二十个字挑三五个难点正合适。
    可《前赤壁赋》六百四十五字，五条注等于没注 —— 而这些注现在是
    页面上的行内笺（读到哪个词点哪个词），密度不够就形同虚设。
    莎剧笺注本大约每十到二十字一条，这里按每 25 字一条估，上下封顶。
    """
    n = len(re.sub(r"\s", "", poem.get("text") or ""))
    lo = max(3, min(24, n // 25))
    hi = max(6, min(40, n // 14))
    if n <= 40:                      # 绝句一类，注多了反而盖过诗
        lo, hi = 3, 6
    return "%d-%d 条，挑真正难懂的：僻字、古义、典故、名物、通假" % (lo, hi)


def call_glm(key, poem, timeout=120):
    body = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": PROMPT_TMPL.format(
                title=poem["title"], author=poem["author"],
                dynasty=poem["dynasty"], text=poem["text"],
                nnotes=notes_quota(poem))},
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

def apply_enrichment(rec, e):
    """把模型返回的内容写进编辑层记录 rec（原文层只读，这里碰不到）。"""
    label = MODEL.split("/")[-1]        # 如 z-ai/glm-5.2 → glm-5.2
    if _s(e.get("translation")):  rec["translation"] = _s(e["translation"])
    if _s(e.get("appreciation")): rec["appreciation"] = _s(e["appreciation"])
    if _s(e.get("english")):      rec["english"] = _s(e["english"])
    notes = _parse_notes(e.get("notes"))
    if notes:
        rec["notes"] = notes
    if isinstance(e.get("themes"), list):
        rec["themes"] = [t.strip() for t in e["themes"] if isinstance(t, str) and t.strip()][:4]
    pl = e.get("place")
    if isinstance(pl, dict) and isinstance(pl.get("lat"), (int, float)) and isinstance(pl.get("lng"), (int, float)):
        rec["place"] = {"name": _s(pl.get("name")), "modern": _s(pl.get("modern")),
                        "lat": float(pl["lat"]), "lng": float(pl["lng"])}
    # 断代：导入时按朝代给的占位年份（如全唐诗一律 750）在这里被模型的估计取代。
    # 时间轴要看得出年代分布，全靠这一步。
    y = e.get("year")
    if isinstance(y, (int, float)) and -2000 < y < 2000:
        rec["year"] = int(y)
    if _s(e.get("yearLabel")):
        rec["yearLabel"] = _s(e["yearLabel"])
    rec["englishBy"] = label + " 译"
    rec["enrichedBy"] = label


def save_shards(enrich, by_slug, slugs):
    """只重写这次改动过的朝代分片 —— 50k 规模下全量重写太慢。

    by_slug 在 main 里一次性建好（id → 朝代分片），
    这里不再为每个分片把整个 enrich 扫一遍（O(n·分片数)）。
    """
    for slug in sorted(slugs):
        rows = [enrich[i] for i in by_slug.get(slug, [])]
        rows.sort(key=lambda r: r["id"])
        clean = [{k: r[k] for k in CL.ENRICH_FIELDS if k in r} for r in rows]
        CL.write_jsonl(os.path.join(CL.ENRICH_DIR, slug + ".jsonl"), clean)

def main():
    global MODEL, REASONING
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="本次最多处理多少首（0=全部）")
    ap.add_argument("--ids", nargs="*", default=None,
                    help="只处理这几个 id（试注释密度、补单篇时用）")
    ap.add_argument("--sample", type=int, default=0, help="跨朝代/体裁均匀抽 N 首来试（而非取前 N 首）")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--model", default=MODEL)
    ap.add_argument("--reasoning", action="store_true", help="开启思维链（更深，但慢 ~9x、贵 ~3x）")
    ap.add_argument("--dry-run", action="store_true", help="只列待办与预估花费，不调 API、不写文件")
    args = ap.parse_args()
    MODEL = args.model
    REASONING = args.reasoning

    source = CL.load_source()
    enrich = CL.load_enrich()
    if not source:
        sys.exit("原文层为空。先跑 tools/migrate_corpus.py --write 或 tools/build_corpus.py。")

    # id → 朝代分片，建一次；save_shards 只取自己那几片，不再扫全量
    by_slug = defaultdict(list)
    for i in enrich:
        by_slug[CL.SLUG.get(source[i]["dynasty"])].append(i)

    # 待办 = 有原文、非精编（精编是手写的，不让模型覆盖）、编辑层还空着的
    todo_ids = [i for i, s_ in source.items()
                if not s_.get("curated") and not CL.is_enriched(enrich.get(i))]
    todo_ids.sort(key=lambda i: (source[i]["dynastyOrder"], source[i]["title"]))

    if args.ids:
        # 指定 id 时连"已有编辑层"也重做 —— 补注释、试新提示词都要能覆盖
        todo_ids = [i for i in args.ids if i in source]
        missing = [i for i in args.ids if i not in source]
        if missing:
            print("这几个 id 不在原文层里：", "、".join(missing))
    elif args.sample:
        # 按 (朝代, 体裁) 分桶，轮转抽取，尽量覆盖诗/词/曲/文各类
        buckets = {}
        for i in todo_ids:
            s_ = source[i]
            buckets.setdefault((s_["dynasty"], s_["genre"]), []).append(i)
        keys = sorted(buckets.keys())
        picked, k = [], 0
        while len(picked) < args.sample and any(buckets[x] for x in keys):
            b = keys[k % len(keys)]
            if buckets[b]:
                picked.append(buckets[b].pop(0))
            k += 1
        todo_ids = picked
    elif args.limit:
        todo_ids = todo_ids[:args.limit]

    have = sum(1 for i in source if CL.is_enriched(enrich.get(i)))
    print("原文 %d 篇，已有编辑层 %d 篇，本次待生成 %d 篇" % (len(source), have, len(todo_ids)))
    print("模型 %s，并发 %d" % (MODEL, args.workers))
    if args.dry_run:
        by = {}
        for i in todo_ids:
            by[source[i]["dynasty"]] = by.get(source[i]["dynasty"], 0) + 1
        print("待办分布：", "  ".join("%s %d" % kv for kv in sorted(by.items(), key=lambda x: -x[1])) or "（无）")
        print("预估花费：约 $%.2f（按 $1.7/1000 首）" % (len(todo_ids) * 0.0017))
        print("（--dry-run：未调用 API，未写任何文件。）")
        return
    if not todo_ids:
        print("没有需要生成的。"); return

    key = load_key()
    done = 0; fail = 0; dirty = set(); since_save = 0
    t0 = time.time()

    def work(pid):
        p_ = source[pid]
        for attempt in range(3):
            try:
                return pid, call_glm(key, p_)
            except urllib.error.HTTPError as ex:
                msg = ex.read().decode("utf-8", "ignore")[:200]
                if ex.code in (429, 500, 502, 503):
                    time.sleep(2 * (attempt + 1)); continue
                return pid, {"__error__": "HTTP %s %s" % (ex.code, msg)}
            except Exception as ex:
                time.sleep(1.5 * (attempt + 1))
                if attempt == 2:
                    return pid, {"__error__": str(ex)[:200]}
        return pid, {"__error__": "重试耗尽"}

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = [ex.submit(work, i) for i in todo_ids]
        for fut in as_completed(futs):
            pid, e = fut.result()
            s_ = source[pid]
            if "__error__" in e:
                fail += 1
                print("  ✗ 《%s》%s — %s" % (s_["title"], s_["author"], e["__error__"]))
            else:
                try:
                    rec = enrich.setdefault(pid, {"id": pid, "themes": [], "place": None,
                                                  "translation": "", "notes": [],
                                                  "appreciation": "", "english": "",
                                                  "englishBy": "", "enrichedBy": ""})
                    apply_enrichment(rec, e)   # 单条解析出错绝不能中断整批
                    dirty.add(CL.SLUG[s_["dynasty"]])
                    done += 1; since_save += 1
                    if done % 25 == 0 or done == len(todo_ids):
                        rate = done / max(1e-9, time.time() - t0)
                        print("  ✓ %d/%d  《%s》%s  (%.1f 首/秒)" % (
                            done, len(todo_ids), s_["title"], s_["author"], rate))
                except Exception as ex:
                    fail += 1
                    print("  ✗ 《%s》%s — 解析失败: %s" % (s_["title"], s_["author"], str(ex)[:120]))
            if since_save >= 200:
                save_shards(enrich, by_slug, dirty); dirty.clear(); since_save = 0

    if dirty or since_save:
        save_shards(enrich, by_slug, dirty or {CL.SLUG[source[i]["dynasty"]] for i in todo_ids})
    print("\n完成：成功 %d，失败 %d，用时 %.0f 秒。" % (done, fail, time.time() - t0))
    print("已写回 data/enrich/。原文层未改动。")
    print("接着跑 tools/build_site_data.py 生成网页用的数据文件。")


if __name__ == "__main__":
    main()
