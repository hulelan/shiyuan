# -*- coding: utf-8 -*-
"""
relevance_lib.py — 把作品切成词、算权重、找近邻。共用给
build_relevance.py（词面）与 embed_corpus.py（语义）。

为什么切成字的二元组，而不是分词：
文言文没有词界，现成的分词器都是拿现代汉语训的，切"窈窕淑女"会切出笑话。
二元组不需要知道词是什么，"明月"、"故乡"、"江南"这些真正复现的搭配它照样抓得住。
文言字密，一个字就是一个义项，二元组的信噪比比在英文里高得多。

两层分开算，最后再合：
  古文层  原文 + 标题     —— 抓的是用字：谁跟谁共用"明月""捣衣"
  今文层  译文 + 赏析 + 主题 —— 抓的是意思：谁跟谁写的是同一件事
古文层认字面，今文层认心思。只用前者会漏掉说同一件事却不共用一个字的两篇；
只用后者，没做过 enrich 的篇目就彻底没有信号了。
"""

import math
import re
from collections import defaultdict

HAN = re.compile(r"[一-鿿]")

# 虚词单独成词没有区分度，成对出现时也多半是语法而非意象。
# 二元组里只要两个字都是虚词就丢掉 —— "之于""而不"这类。
FUNCTION = set("之乎者也而以于与其则乃且夫焉哉矣耳兮所为是有无不"
               "在此彼我尔汝子君吾余相自可得如若何将欲")

# 出现在超过这一比例的篇目里的二元组，权重已经低到没意义，
# 还会把倒排表撑大。直接不要。
MAX_DF_RATIO = 0.18
# 只在一篇里出现过的二元组无法建立任何联系，也丢掉（省一半以上的表）
MIN_DF = 2


def bigrams(text):
    """连续汉字切二元组；标点与换行处断开，不跨句拼词。"""
    out = []
    for run in re.split(r"[^一-鿿]+", text or ""):
        if len(run) == 1:
            out.append(run)
            continue
        for i in range(len(run) - 1):
            g = run[i:i + 2]
            if g[0] in FUNCTION and g[1] in FUNCTION:
                continue
            out.append(g)
    return out


# 《全唐诗》的乐府部分把栏目名写进了标题。这是目录结构，不是诗题。
# 同一首诗常常同时以《杂曲歌辞 蜀道难》与《蜀道难》两条收录（本库有 1440 条带这类前缀）。
YUEFU = re.compile(r"^(杂曲歌辞|相和歌辞|琴曲歌辞|横吹曲辞|鼓吹曲辞|舞曲歌辞|"
                   r"清商曲辞|近代曲辞|新乐府辞|郊庙歌辞|杂歌谣辞)\s*")
# "论语·泰伯篇 其15" 这种编号，以及词曲的"其二"
NUMBER = re.compile(r"\s*其[一二三四五六七八九十百零〇\d]+\s*$")


SEP = re.compile(r"[·・‧•]")


def clean_title(title, form=None):
    """
    把标题里属于目录的部分剥掉，只留下真正是诗题的那一段。

    词曲的标题多是 词牌·首句 —— 词牌是曲调名，跟内容毫无关系。
    不剥的话，晏殊的五十首《浣溪沙》会因为共用三个字而互相判为"最相近"，
    纳兰的《如梦令》也会挤满李清照《如梦令》的邻居位。
    · 之后那半截（首句或自拟题）是有内容的，留着。

    form 形如 "词·浣溪沙" 时，牌名是已知的，光秃秃只有牌名的标题就整个丢掉。
    """
    t = SEP.sub("·", title or "").strip()
    t = YUEFU.sub("", t).strip()
    t = NUMBER.sub("", t)
    tune = ""
    if form:
        f = SEP.sub("·", form)
        if f.startswith("词·") or f.startswith("曲·"):
            tune = f.split("·", 1)[1].strip()
    if "·" in t:
        head, tail = t.split("·", 1)
        tail = tail.strip()
        return tail if len(tail) >= 3 else ""
    # 整个标题就是牌名（《浣溪沙》这类）—— 没有内容可言
    if tune and t == tune:
        return ""
    return t


def classical_text(src):
    """古文层：诗题算两遍 —— 题里的字是作者自己挑出来提纲挈领的。"""
    return (clean_title(src.get("title", ""), src.get("form")) + "。") * 2 + \
        (src.get("text", "") or "")


def overlap(a, b):
    """
    两段文字的二元组重合度，以短的那篇为分母。
    用来判"这两条是不是同一首的两处著录" —— 余弦相似度分不开
    "同一首诗"和"极像的两首诗"，字面覆盖率分得开。
    """
    A = set(bigrams(a))
    B = set(bigrams(b))
    if not A or not B:
        return 0.0
    return len(A & B) / min(len(A), len(B))


def modern_text(enr):
    """今文层：译文 + 赏析 + 主题词。没做过 enrich 的返回空串。"""
    if not enr:
        return ""
    parts = [enr.get("translation") or "", enr.get("appreciation") or ""]
    for t in (enr.get("themes") or []):
        parts.append((t + "。") * 3)      # 主题词短，重复几遍才压得住长赏析
    for n in (enr.get("notes") or []):
        if isinstance(n, dict):
            parts.append(n.get("term") or "")
    return "。".join(p for p in parts if p)


def build_tfidf(docs):
    """
    docs: {id: 文本}
    返回 (vecs, idf)。vecs 是 {id: {词: 权重}}，已做 L2 归一化，
    因此两个向量的点积就是余弦相似度。
    权重用 (1 + log tf) * idf —— 一首诗里"月"出现五次，
    并不比出现一次重要五倍。
    """
    tf, df = {}, defaultdict(int)
    for pid, text in docs.items():
        c = defaultdict(int)
        for g in bigrams(text):
            c[g] += 1
        tf[pid] = c
        for g in c:
            df[g] += 1

    n = max(1, len(docs))
    cap = n * MAX_DF_RATIO
    idf = {g: math.log(1 + n / d)
           for g, d in df.items() if MIN_DF <= d <= cap}

    vecs = {}
    for pid, c in tf.items():
        v = {}
        for g, k in c.items():
            w = idf.get(g)
            if w:
                v[g] = (1 + math.log(k)) * w
        norm = math.sqrt(sum(x * x for x in v.values()))
        vecs[pid] = {g: x / norm for g, x in v.items()} if norm else {}
    return vecs, idf


def knn(vecs, k=12, per_term_cap=400, min_score=0.04):
    """
    稀疏点积找近邻。不搜全表 —— 只有共用了至少一个二元组的两篇才可能相似，
    倒排表一扫就够，这是 O(n²) 与能跑完之间的差别。

    per_term_cap：某个二元组挂了太多篇时只留权重最高的那些。
    这类词本来就是弱信号，全展开会让复杂度退化回平方。
    """
    post = defaultdict(list)
    for pid, v in vecs.items():
        for g, w in v.items():
            post[g].append((w, pid))
    for g in post:
        if len(post[g]) > per_term_cap:
            post[g].sort(reverse=True)
            del post[g][per_term_cap:]

    out = {}
    for pid, v in vecs.items():
        acc = defaultdict(float)
        for g, w in v.items():
            for w2, other in post.get(g, ()):
                if other != pid:
                    acc[other] += w * w2
        top = sorted(acc.items(), key=lambda kv: (-kv[1], kv[0]))[:k]
        out[pid] = [(o, round(s, 4)) for o, s in top if s >= min_score]
    return out


def fuse(lists, k=12):
    """
    把几套近邻表合成一套。lists 是 [(权重, 表), …]。

    不能按分数加权求和 —— 每套都只是各自的前 K 名，
    某一篇没出现在另一套的前 K 里，不等于"相似度为零"，
    只等于"没进那一套的前几名"。按分数相加会把它平白扣掉一半，
    连"这两条是同一首"这种铁证也压得跟普通邻居差不多。

    改用倒数排名融合（RRF）：只看名次，不看分数量级。
    某一套缺席就不投票，不扣分。两套都排在前面的自然浮上来。
    RANK0 压低头名的绝对优势，免得任一套单独说了算。

    返回 [(id, 展示用分数, 融合分)]。展示用分数取各套里最高的那个余弦值 ——
    名次用来排序，页面上那条细线用来表示"有多像"，两件事分开。
    """
    RANK0 = 12.0
    fused, best = defaultdict(float), defaultdict(float)
    for wgt, table in lists:
        for pid, lst in table.items():
            for rank, (other, score) in enumerate(lst):
                fused[(pid, other)] += wgt / (RANK0 + rank)
                if score > best[(pid, other)]:
                    best[(pid, other)] = score

    out = defaultdict(list)
    for (pid, other), f in fused.items():
        out[pid].append((other, best[(pid, other)], f))
    for pid in out:
        out[pid].sort(key=lambda x: (-x[2], -x[1], x[0]))
        del out[pid][k:]
    return dict(out)
