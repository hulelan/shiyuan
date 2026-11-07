#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""The home page pool, and pinyin for every author.

    ./.venv/bin/python tools/build_home.py

Writes data/site/home.json, a list of [id, weight] for every poem the home
page may open on, and data/site/agg/author_py.json, {author: pinyin}.

The home page draws one poem at random, weighted. The weight is a fame
estimate built from what the repo already holds, no search-engine rank:

    curated.json                 the dozen hand-picked openers        +30
    唐诗三百首 / 宋词三百首       membership by author + first line   +20
    data/curated/canon_must.json the human list of名篇                +20
    data/curated/canon_poets.json a named poet, scaled by their cap    +1..6
    short verse (<= 60 chars)    reads well on the opening page       x1.5
    long (> 400 chars)           shows badly there                    x0.3
    ceremonial 郊庙歌辞/乐章, anonymous, outside any list              dropped

So a reload most often opens on something read for centuries, and now and
then on something nobody opens. Both are the point.
"""
import glob, json, os, re
import opencc
from pypinyin import pinyin, Style

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SITE = os.path.join(ROOT, "data", "site")
T2S = opencc.OpenCC("t2s")

def head(text, n=6):
    return re.sub(r"[^一-鿿]", "", T2S.convert(text or ""))[:n]

# ---- fame sources -----------------------------------------------------------
anth = set()
for name, titlekey in (("全唐诗_唐诗三百首.json", "title"), ("宋词_宋词三百首.json", "rhythmic")):
    p = os.path.join(HERE, ".cache", "canon", name)
    if not os.path.exists(p):
        print("missing", p, "(run import_canon.py --fetch); anthology weight skipped")
        continue
    for r in json.load(open(p, encoding="utf-8")):
        paras = r.get("paragraphs") or []
        if paras:
            anth.add((T2S.convert(r.get("author") or ""), head(paras[0])))

must = json.load(open(os.path.join(ROOT, "data", "curated", "canon_must.json"), encoding="utf-8"))
MUST = []                                   # (author, title fragment, first-line fragment or None)
for sect, by in must.items():
    if sect.startswith("_"): continue
    for au, items in by.items():
        for it in items:
            if isinstance(it, list): MUST.append((au, it[0], it[1]))
            else: MUST.append((au, it, None))

poets = json.load(open(os.path.join(ROOT, "data", "curated", "canon_poets.json"), encoding="utf-8"))
CAP = {}
for sect, by in poets.items():
    if sect.startswith("_"): continue
    for au, cap in by.items(): CAP[au] = max(CAP.get(au, 0), cap)

curated = {r["id"] for r in json.load(open(os.path.join(SITE, "curated.json"), encoding="utf-8"))}

# ---- score ------------------------------------------------------------------
CEREMONIAL = re.compile(r"郊庙|乐章|祭|享|燕射|鼓吹|横吹|舞曲|相和|琴曲|杂曲|庙|谒")
ANON = {"佚名", "不详", "无名氏", ""}
out, authors = [], set()
n_in = 0
for f in sorted(glob.glob(os.path.join(ROOT, "data", "source", "*.jsonl"))):
    for line in open(f, encoding="utf-8"):
        r = json.loads(line); n_in += 1
        au, title, text = (r.get("author") or "").strip(), r.get("title") or "", r.get("text") or ""
        authors.add(au)
        w = 0.0
        if r["id"] in curated: w += 30
        if (au, head(text)) in anth: w += 20
        for m_au, m_t, m_l in MUST:
            if m_au == au and m_t in title and (m_l is None or m_l in text):
                w += 20; break
        if au in CAP: w += 1 + 5 * min(CAP[au], 90) / 90
        if w == 0:
            if au in ANON or CEREMONIAL.search(title): continue
            w = 1
        n = len(re.sub(r"\s", "", text))
        if n <= 60: w *= 1.5
        elif n > 400: w *= 0.3
        out.append([r["id"], round(w, 1)])

json.dump(out, open(os.path.join(SITE, "home.json"), "w", encoding="utf-8"),
          ensure_ascii=False, separators=(",", ":"))
top = sum(1 for _, w in out if w >= 20)
print("home.json: %d of %d poems, %d with a fame mark" % (len(out), n_in, top))

# ---- author pinyin -----------------------------------------------------------
# Two-character surnames the corpus actually contains; everything else is
# surname + given name. Tone marks kept: the point is to say the name.
DOUBLE = ("司马", "欧阳", "诸葛", "上官", "夏侯", "东方", "纳兰", "皇甫", "公孙", "令狐", "尉迟", "长孙", "慕容", "宇文", "淳于", "鲜于", "呼延", "轩辕")
def py(name):
    if "及" in name: return " jí ".join(py(x) for x in name.split("及"))
    if name in ANON: return "Anonymous"
    if not re.search(r"[一-鿿]", name): return name
    cut = 2 if name.startswith(DOUBLE) else 1
    def one(s):
        return "".join(x[0] for x in pinyin(s, style=Style.TONE)).capitalize() if s else ""
    parts = [one(name[:cut]), one(name[cut:])]
    return " ".join(p for p in parts if p)
AP = {a: py(a) for a in sorted(authors) if a}
json.dump(AP, open(os.path.join(SITE, "agg", "author_py.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=0)
print("author_py.json: %d authors, e.g. %s" % (len(AP), ", ".join("%s %s" % (k, AP[k]) for k in list(AP)[:3])))
