#!/usr/bin/env python3
"""给本站的 css / js 链接盖上当前提交号，让一次部署就是一批新地址。

    python3 tools/stamp_build.py && git commit -am "…"

静态资源带 max-age=600。不盖戳的话，新 HTML 会和十分钟前的旧 CSS 撞在一起：
样式改了、页面不动，看上去像改动没生效 —— 画站上就是这么白折腾了一轮。
改动 css/ 或 js/ 之后跑一次。
"""
import os, re, subprocess, glob

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
build = subprocess.check_output(["git", "-C", ROOT, "rev-parse", "--short", "HEAD"]).decode().strip()

pat = re.compile(r'((?:href|src)=")((?:css|js)/[A-Za-z0-9_.-]+\.(?:css|js))(?:\?b=[^"]*)?(")')
changed = []
for p in glob.glob(os.path.join(ROOT, "*.html")):
    s = open(p, encoding="utf-8").read()
    new = pat.sub(lambda m: m.group(1) + m.group(2) + "?b=" + build + m.group(3), s)
    if new != s:
        open(p, "w", encoding="utf-8").write(new)
        changed.append(os.path.basename(p))
print("stamped", build, "->", ", ".join(changed) if changed else "nothing to change")
