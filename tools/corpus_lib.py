"""
corpus_lib.py — 语料的共用词汇表：稳定 id、朝代分片名、JSONL 读写。

数据分两层存放，各自一份文件，互不覆写：

    data/source/<朝代>.jsonl   原文层 — 公有领域，随时可从 chinese-poetry 重新导入
    data/enrich/<朝代>.jsonl   编辑层 — 译文/注释/赏析/英译/主题/地点，花钱花时间生成的部分

两层用 id 相连。id 由内容派生（见 stable_id），因此同一首诗无论何时、以何种
顺序导入，得到的 id 都一样 —— 这正是"加新诗不会打乱旧注"的前提。

导入脚本只准写 source/，绝不碰 enrich/。
"""

import hashlib
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
SOURCE_DIR = os.path.join(DATA, "source")
ENRICH_DIR = os.path.join(DATA, "enrich")

# 朝代 → 文件名（文件名保持 ASCII，避免跨平台编码麻烦）
DYNASTIES = [
    ("先秦",   1,  "xianqin",    "上古 – 前221"),
    ("汉",     2,  "han",        "前202 – 220"),
    ("魏晋",   3,  "weijin",     "220 – 420"),
    ("南北朝", 4,  "nanbeichao", "420 – 589"),
    ("隋",     5,  "sui",        "581 – 618"),
    ("唐",     6,  "tang",       "618 – 907"),
    ("五代",   7,  "wudai",      "907 – 960"),
    ("宋",     8,  "song",       "960 – 1279"),
    ("元",     9,  "yuan",       "1271 – 1368"),
    ("明",     10, "ming",       "1368 – 1644"),
    ("清",     11, "qing",       "1644 – 1912"),
]
SLUG = {k: s for k, _, s, _ in DYNASTIES}
ORDER = {k: o for k, o, _, _ in DYNASTIES}
SPAN = {k: sp for k, _, _, sp in DYNASTIES}

# 原文层字段（导入脚本负责）
SOURCE_FIELDS = ["id", "title", "author", "dynasty", "dynastyOrder", "year",
                 "yearLabel", "form", "genre", "text", "pinyin", "source", "curated"]
# 编辑层字段（enrich 脚本负责）
# year/yearLabel 也放这一层：导入时只能按朝代给个占位年份（全唐诗一律 750），
# 真正断代要靠模型推断。放在编辑层，就不必让 enrich 反过来写原文层。
ENRICH_FIELDS = ["id", "themes", "place", "translation", "notes",
                 "appreciation", "english", "englishBy", "enrichedBy",
                 "year", "yearLabel"]


def normalize_text(s):
    """比对用的规范化文本：去掉一切空白，只留字面。"""
    return re.sub(r"\s+", "", s or "")


def stable_id(author, title, text):
    """
    内容派生的 id：md5(作者|标题|去空白原文)[:12]。

    为什么把全文算进去，而不是只取前 20 字：
    宋词元曲的 title 往往是词牌名 —— 晏殊一人就有 13 首《浣溪沙》。
    只靠 作者+标题 会把它们误判成同一首；带上全文才分得开。
    （已在 2966 篇上验证：零碰撞，13 首《浣溪沙》各自独立。）

    代价：改动原文一个字，id 就变，旧的编辑层会失联。
    校订原文时请同时在 data/id_aliases.json 里登记 旧id → 新id。
    """
    key = "%s|%s|%s" % (author or "", title or "", normalize_text(text))
    return hashlib.md5(key.encode("utf-8")).hexdigest()[:12]


def read_jsonl(path):
    """读 JSONL；文件不存在时返回空列表（首次运行的正常情况）。"""
    if not os.path.exists(path):
        return []
    out = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                out.append(json.loads(line))
    return out


def write_jsonl(path, records):
    """
    写 JSONL —— 一条一行，且 key 顺序固定。
    这样重跑 enrich 只会改动到的那几行，git diff 是行级的，
    而不是像过去那样整个 8.7MB 重写一遍。
    """
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n")


def load_layer(directory):
    """把某一层的所有朝代分片读成 {id: record}。"""
    by_id = {}
    for _, _, slug, _ in DYNASTIES:
        for r in read_jsonl(os.path.join(directory, slug + ".jsonl")):
            by_id[r["id"]] = r
    return by_id


def load_source():
    return load_layer(SOURCE_DIR)


def load_enrich():
    return load_layer(ENRICH_DIR)


def save_layer(directory, records, fields):
    """按朝代分片写回；每片内按 id 排序，保证输出可重现。"""
    buckets = {}
    for r in records:
        slug = SLUG.get(r.get("dynasty"))
        if slug is None:
            # enrich 层的记录不带 dynasty，调用方需自行传入 _slug
            slug = r.get("_slug")
        buckets.setdefault(slug, []).append(r)
    written = {}
    for slug, rs in buckets.items():
        rs.sort(key=lambda r: r["id"])
        clean = [{k: r[k] for k in fields if k in r} for r in rs]
        write_jsonl(os.path.join(directory, slug + ".jsonl"), clean)
        written[slug] = len(clean)
    return written


def is_enriched(e):
    """编辑层是否算"有内容" —— 四层里有任意一层非空即算。"""
    if not e:
        return False
    return bool(e.get("translation") or e.get("appreciation")
                or e.get("english") or e.get("notes"))
