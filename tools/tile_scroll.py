#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Slice a very wide handscroll image into edge-to-edge vertical strips for the web.

Single 41783-px-wide JPEGs get downsampled by mobile Safari (>~16k px / 16 MP) and
force a 25 MB one-shot download. Tiling into full-height strips keeps each tile under
the decode limit and lets the browser lazy-load only what the viewer scrolls to.

Outputs: assets/scroll/tiles/tile-NN.jpg  +  manifest.js (window.SCROLL).
"""
import os, json
from PIL import Image

Image.MAX_IMAGE_PIXELS = None  # trusted local file; disable decompression-bomb guard

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = "/Users/lelan/Desktop/dpm_download/img0065_full_41783x1673.jpg"
OUT = os.path.join(ROOT, "assets", "scroll", "tiles")
TILE_W = 2048          # <= mobile decode limit; also lazy-load granularity
QUALITY = 86

os.makedirs(OUT, exist_ok=True)
im = Image.open(SRC)
im = im.convert("RGB")
W, H = im.size
print("source %dx%d" % (W, H))

tiles = []
i = 0
x = 0
while x < W:
    w = min(TILE_W, W - x)
    crop = im.crop((x, 0, x + w, H))
    fn = "tile-%02d.jpg" % i
    crop.save(os.path.join(OUT, fn), "JPEG",
              quality=QUALITY, optimize=True, progressive=True)
    tiles.append({"f": fn, "w": w})
    print("  %s  %dx%d" % (fn, w, H))
    x += w
    i += 1

manifest = {"w": W, "h": H, "tileW": TILE_W, "tiles": tiles,
            "title": "千里江山图", "author": "王希孟", "dynasty": "北宋"}
with open(os.path.join(ROOT, "assets", "scroll", "manifest.js"), "w", encoding="utf-8") as f:
    f.write("window.SCROLL = ")
    json.dump(manifest, f, ensure_ascii=False)
    f.write(";\n")

total = sum(os.path.getsize(os.path.join(OUT, t["f"])) for t in tiles)
print("done: %d tiles, %.1f MB total" % (len(tiles), total / 1e6))
