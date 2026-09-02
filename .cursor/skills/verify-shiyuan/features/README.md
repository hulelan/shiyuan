# 诗渊 feature map

User-facing surfaces to drive against a `control-shiyuan` instance. Each file is written for an agent that has not seen the app.

| File | Feature | First-proof? |
|------|---------|--------------|
| [home.md](home.md) | 一日一篇, brand, bootStat, 释文 → overlay | no |
| [poem-detail.md](poem-detail.md) | Overlay via `#/poem/<id>` and card click; 原文/拼音/译文 | **yes — drive this first** |
| [library.md](library.md) | 诗文库 from 更多视角; dynasty chips; 卡片/长卷 | no |
| [search.md](search.md) | `#search` → `#/search/明月`; Han vs Latin; debounce | no |
| [authors.md](authors.md) | `#/authors` → `#/author/李白` | no |

Not mapped as user features (do not spend a proof run here unless the change is specifically about them):

- `admin.html` — internal inventory, `noindex`, not in nav.
- `tools/` — corpus pipeline; never run enrich to “verify UI”.
- `#/map` — Leaflet CDN + OpenStreetMap; fails offline. Gotcha only.
- `#/type` `#/theme` `#/word` `#/timeline` `#/art` — real hashes (see SKILL.md) but not in the top five.
- Tab `千里江山图` → `https://classicalchinesepainting.com/` — **do not operate**.

Canonical poems (from `data/site/curated.json` on the instance, not from memory):

- 《关雎》 `aec36ff73546` first line `关关雎鸠，在河之洲。`
- 《静夜思》 `6c1f9747d167` 李白

If those ids are missing from curated.json, fail the run. Do not invent a replacement poem.

Harness: `bin/control-shiyuan` (launch/doctor/stop) + `bin/drive-shiyuan` (Playwright). Evidence: `.cursor/skills/verify-shiyuan/evidence/<run-id>/`.
