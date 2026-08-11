#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
add_art.py — 给某一篇作品配一幅画。

    ../.venv/bin/python tools/add_art.py 某张图.jpg --poem 静夜思 \
        --title 寒江独钓图 --artist 马远 --dynasty 南宋 --credit 东京国立博物馆

做三件事：把图缩到网页合适的尺寸、存进 assets/art/、在
assets/art/index.json 末尾添一行。首页遇到配了画的那一篇，
就会用画配诗的版式；没配画的照旧只排字。

--poem 可以直接给 id，也可以给标题或作者的一部分；对不上就把候选列出来。
不带 --write 只做检查与预览，不动任何文件。

注意：只放公有领域或你有权使用的图。credit 会印在画旁边。
"""

import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import corpus_lib as CL

ROOT = CL.ROOT
ART_DIR = os.path.join(ROOT, "assets", "art")
INDEX = os.path.join(ART_DIR, "index.json")

MAX_W = 1600        # 首页展示尺寸的两倍上限，够 2x 屏用
MAX_H = 2000
QUALITY = 86


def load_index():
    if not os.path.exists(INDEX):
        return []
    return json.load(open(INDEX, encoding="utf-8"))


def save_index(rows):
    """一行一条 —— 加一幅画就是加一行，手改也方便。"""
    os.makedirs(ART_DIR, exist_ok=True)
    with open(INDEX, "w", encoding="utf-8") as f:
        f.write("[\n")
        f.write(",\n".join(json.dumps(r, ensure_ascii=False, sort_keys=True) for r in rows))
        f.write("\n]\n")


def find_poem(needle):
    """按 id / 标题 / 作者 找一篇作品，返回 (记录, 候选列表)。"""
    src = CL.load_source()
    if needle in src:
        return src[needle], []
    hits = [r for r in src.values()
            if needle in r["title"] or needle in r["author"]]
    # 精编的排前面：首页只从精编里选，配画配在那儿才看得见
    hits.sort(key=lambda r: (not r.get("curated"), r["dynastyOrder"], r["title"]))
    if len(hits) == 1:
        return hits[0], []
    return None, hits[:12]


def art_filename(poem_id, title):
    """
    文件名用作品 id 打头，只保留 ASCII —— 中文文件名在 URL 里要转义，
    跨系统也容易出岔子。画名照旧记在 index.json 里，不靠文件名认人。
    一篇作品配一幅画，重配即覆盖。
    """
    tail = re.sub(r"[^a-zA-Z0-9]+", "-", title or "").strip("-").lower()
    return poem_id + ("-" + tail if tail else "") + ".jpg"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image", help="源图片路径")
    ap.add_argument("--poem", required=True, help="作品 id，或标题/作者的一部分")
    ap.add_argument("--title", default="", help="画名")
    ap.add_argument("--artist", default="", help="画家")
    ap.add_argument("--dynasty", default="", help="画的年代")
    ap.add_argument("--credit", default="", help="藏处 / 来源，会印在画旁")
    ap.add_argument("--link", default="", help="出处链接（可选）")
    ap.add_argument("--write", action="store_true", help="真正落盘")
    args = ap.parse_args()

    if not os.path.exists(args.image):
        sys.exit("找不到图片：" + args.image)

    poem, candidates = find_poem(args.poem)
    if not poem:
        if not candidates:
            sys.exit("没有匹配「%s」的作品。" % args.poem)
        print("「%s」对上了多篇，请用更明确的说法或直接给 id：" % args.poem)
        for c in candidates:
            print("   %s  %s《%s》%s%s" % (
                c["id"], c["dynasty"], c["title"], c["author"],
                "  ← 精编" if c.get("curated") else ""))
        sys.exit(1)

    if not poem.get("curated"):
        print("提醒：《%s》不在精编集里，首页轮不到它 —— 这幅画只有从别处点进这一篇时才看得到。"
              % poem["title"])

    try:
        from PIL import Image
    except ImportError:
        sys.exit("需要 Pillow：./.venv/bin/pip install Pillow")

    Image.MAX_IMAGE_PIXELS = None
    im = Image.open(args.image).convert("RGB")
    w0, h0 = im.size
    scale = min(MAX_W / w0, MAX_H / h0, 1.0)
    if scale < 1.0:
        im = im.resize((round(w0 * scale), round(h0 * scale)), Image.LANCZOS)
    w, h = im.size

    fname = art_filename(poem["id"], args.title)
    rows = load_index()
    # 同一篇作品重复配画就替换掉旧的那条，不叠加；旧图一并删掉
    for old in rows:
        if old.get("poem") == poem["id"] and old.get("file") != fname:
            stale = os.path.join(ART_DIR, old["file"])
            if args.write and os.path.exists(stale):
                os.remove(stale)
    rows = [r for r in rows if r.get("poem") != poem["id"]]
    entry = {"poem": poem["id"], "file": fname, "w": w, "h": h}
    for k, v in [("title", args.title), ("artist", args.artist),
                 ("dynasty", args.dynasty), ("credit", args.credit), ("link", args.link)]:
        if v:
            entry[k] = v
    rows.append(entry)

    print("配画：%s《%s》%s" % (poem["dynasty"], poem["title"], poem["author"]))
    print("  图片 %dx%d → %dx%d  存为 assets/art/%s" % (w0, h0, w, h, fname))
    print("  条目 " + json.dumps(entry, ensure_ascii=False, sort_keys=True))

    if not args.write:
        print("\n（试运行。加 --write 才会落盘。）")
        return

    os.makedirs(ART_DIR, exist_ok=True)
    im.save(os.path.join(ART_DIR, fname), "JPEG",
            quality=QUALITY, optimize=True, progressive=True)
    save_index(rows)
    kb = os.path.getsize(os.path.join(ART_DIR, fname)) / 1024
    print("\n已写入 assets/art/%s（%.0f KB）与 assets/art/index.json（共 %d 幅）。"
          % (fname, kb, len(rows)))
    print("不必重跑 build_site_data.py —— 首页直接读这份清单。提交推送即生效。")


if __name__ == "__main__":
    main()
