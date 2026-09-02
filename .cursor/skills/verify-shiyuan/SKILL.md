---
name: verify-shiyuan
description: Drive 诗渊 (classicalchinesepoetry.com) in a real browser — launch the static site, doctor the instance, and prove user-facing views (home, poem overlay, library, search, authors). Use when verifying UI, routing, data load, or visual changes.
---

# Verify 诗渊

This skill is for the next agent that has never opened the app. 诗渊 is a **GitHub Pages static SPA**. There is no `package.json`, Makefile, Playwright config, or test suite in the repo. The public site is `index.html`. Live: https://classicalchinesepoetry.com

Do **not** edit painting / classicalchinesepainting.com. The tabstrip links there; do not click it, restyle `css/shell.css` (shared CSS contract), or clone extra remotes. Do **not** invent poems or fake 原文 / 拼音 / 译文 — assert overlay text against `data/site/curated.json` fetched from the instance you launched. Do **not** run `tools/enrich_glm.py` or any enrich pipeline. Do **not** read or print `.env`. `admin.html` is internal inventory (`noindex`, not in nav) — mention it, do not map it as a user feature. `tools/` is the data pipeline, not user-facing.

When selectors, hashes, or proof poems drift, update this map (`/maintain-verification-skill`).

## Launch

From the **repo root** (the directory that contains `index.html` and `data/site/manifest.json`):

```bash
RUN_ID=$(date -u +%Y%m%dT%H%M%SZ)
.cursor/skills/verify-shiyuan/bin/control-shiyuan launch "$RUN_ID"
```

What that does (do not improvise a different server unless you are debugging the helper itself):

- `cd` to repo root, then `python3 -m http.server $PORT --bind 127.0.0.1`.
- Prefers port **8731** (README quickstart). README also mentions 8899 once; ignore 8899 unless 8731 and the 8732–8799 scan are busy. If 8731 is taken, the helper binds another high port and **records it**. Different ports are different origins (`localStorage` keys `lang`, `readMode`, `sy_font` do not carry over).
- Writes `.cursor/skills/verify-shiyuan/.run/$RUN_ID/{port,pid,origin}` (also `cwd`, `started`, `server.log`).
- Prints `RUN_ID`, `pid`, `port`, `origin`.

**Ready check** (the helper already waits for this; re-check if you launched by hand):

```text
GET http://127.0.0.1:$PORT/                    -> 200 HTML containing 诗渊 and id="tabstrip"
GET http://127.0.0.1:$PORT/data/site/manifest.json
                                               -> JSON object with numeric `total` and string `build`
```

`file://` is **not** ready. Double-clicking `index.html` (README “方式一”) makes `Store.boot()` `fetch("data/site/manifest.json")` fail; `js/app.js` replaces `#main` with `<p class="loadfail">数据没能载入。`. Doctor must fail closed on that origin.

No environment variables are required for the public site. Do not source `.env`.

**Teardown:** `control-shiyuan stop "$RUN_ID"` (see Cleanup). Never `pkill python` / `killall http.server`.

Equivalent manual launch if you must see the command:

```bash
python3 -m http.server 8731 --bind 127.0.0.1
# ready: curl -sS http://127.0.0.1:8731/ | grep -q 'id="tabstrip"'
#        curl -sS http://127.0.0.1:8731/data/site/manifest.json  # has "total" and "build"
```

Only drive a server **this run** started. Do not point the harness at the live domain or at a leftover process on 8731.

## Doctor

Read-only. Exit **0** only if this instance is worth driving; exit **1** otherwise.

```bash
.cursor/skills/verify-shiyuan/bin/control-shiyuan doctor "$RUN_ID"
```

Checks, in order:

1. `.run/$RUN_ID/{origin,port,pid}` exist (a run **this helper** started).
2. `origin` is loopback `http://`, **not** `file://`. `file://` fails closed: `Store.boot()` cannot fetch, UI shows `数据没能载入`.
3. Recorded `pid` is alive (`/proc/$pid`). Unknown/dead pid fails closed.
4. `/proc/$pid/cmdline` contains `http.server` and the recorded port.
5. `/proc/$pid/cwd` is the repo root (so `/` is *this* `index.html`, not some other tree).
6. That pid **owns** the recorded port (inode match on `/proc/net/tcp`). A stolen port fails closed.
7. `GET /` is this SPA: `诗渊`, `#tabstrip`, `.tabrow-works`, `#bootStat`, `#viewTabs`, `#lensBtn` `aria-controls="lensMenu"`, `#search`, `#langToggle`, `#view-home`, `#overlay`, `#poemDetail`. Static HTML must **not** already contain `.loadfail`.
8. `GET /data/site/manifest.json` parses as JSON with `total` and `build`. Missing shards here are what the UI would surface as `.loadfail`.
9. `GET /data/site/curated.json` is a non-empty array and includes canonical id `aec36ff73546`.

Capture stdout into evidence:

```bash
mkdir -p .cursor/skills/verify-shiyuan/evidence/$RUN_ID
.cursor/skills/verify-shiyuan/bin/control-shiyuan doctor "$RUN_ID" \
  | tee .cursor/skills/verify-shiyuan/evidence/$RUN_ID/doctor.txt
```

There is no login. “Auth/boot valid” for this site means: the process we started is the one answering, and `Store.boot()`’s manifest is fetchable JSON.

## Drive

Harness: Playwright against the recorded origin (`bin/drive-shiyuan`). Do not call internal setters (`Store.boot` from the console, `openPoem(id)` by hand, `localStorage` pokes) as the **proof path**. Navigate and click the way a reader would.

```bash
# After launch + doctor:
.cursor/skills/verify-shiyuan/bin/drive-shiyuan "$RUN_ID" poem-detail
```

First run installs `playwright-core` into `.cursor/skills/verify-shiyuan/.scratch/` (gitignored) and uses machine Chrome (`/usr/local/bin/google-chrome` when present) with `--no-sandbox`. That is the only Playwright install this project needs; do not add a repo-root `package.json`. Do **not** `npm init -y` inside `.scratch/` — npm infers an illegal package name from the leading dot. The wrapper writes `{"name":"shiyuan-verify-scratch","private":true}` and runs `npm install --no-fund --no-audit playwright-core`.

Feature files (selectors, hashes, gotchas) live in `features/`. The first proof on a new checkout is **poem-detail** via deep link `#/poem/aec36ff73546`.

### Real handles (from `index.html` + `js/app.js`)

**Tabstrip** (shared with painting — do not restyle `css/shell.css` in a verification change):

- `#tabstrip` `.tabrow-works`
- `a.tabstrip-tab.active` `href="index.html"` text `诗渊`
- `a.tabstrip-tab` `href="https://classicalchinesepainting.com/"` text `千里江山图` — **do not operate**

**Header**

- `.brand` click → `#/` ; `h1` text `诗渊`
- `#bootStat` after `Store.boot()`: `收录 {n} 篇` where `n` is **live** `manifest.total` (currently 4675 in this checkout — assert against the JSON, do not hardcode forever). English UI: `{n} works` (`js/i18n.js`).
- `#viewTabs button[data-view="home"]` text `首页`
- `#lensBtn` text `更多视角` (EN: `Perspectives`); `aria-haspopup="true"` `aria-expanded` `aria-controls="lensMenu"`
- `#lensMenu` (filled by `buildLens()`): `button.lens-item[role=menuitem]` with `data-view`:

  | data-view | 中文 |
  |-----------|------|
  | library | 诗文库 |
  | authors | 作者 |
  | type | 体裁 |
  | theme | 主题 |
  | word | 字词 |
  | timeline | 时间轴 |
  | map | 地图 |
  | art | 配画 |

- `#search` — `input` debounce **260ms** → `#/search/<q>`. BM25 (`Store.searchBM25`) keeps only `/[一-鿿]/`; Latin-only queries resolve empty.
- `#langToggle` — `EN` / `中文`. UI only; poems stay Chinese. Sets `<html lang>` to `en` or `zh-Hans`. Key: `localStorage.lang`.

**Views** (`#view-*`, hidden with `.hidden` via `show()`):

`#view-home` `#view-library` `#view-authors` `#view-author` `#view-type` `#view-theme` `#view-word` `#view-timeline` `#view-map` `#view-art` `#view-search`

**Hashes** (`js/app.js` `route()`):

| hash | what happens |
|------|----------------|
| `#/` | `show("home")` `viewHome()` |
| `#/library` `#/library/<slug>` | slugs from `manifest.dynasties[].slug`: `xianqin` `weijin` `tang` `wudai` `song` `yuan` `qing` |
| `#/authors` | author index |
| `#/author/<name>` | e.g. `#/author/李白` |
| `#/type` `#/type/<k>` | `k` from `data/site/agg/forms.json` (e.g. `f000` 词) |
| `#/theme` `#/theme/<k>` | `k` from `data/site/agg/themes.json` |
| `#/word` `#/word/<char>` | |
| `#/timeline` | |
| `#/map` | Leaflet CDN + OSM — gotcha, not required for first proof |
| `#/art` | |
| `#/search/<q>` | |
| `#/poem/<id>` | **overlay only** — `openPoem(id)` then `return`; does **not** `show()` a view |

**Home:** `#dailyText` (click opens overlay), `#dailyOpen` `释　文`, `#dailyNext` `换一篇`. Pool is the 12 curated works, `pool[(floor(Date.now()/86400000)+homeOffset) % 12]`.

**Cards:** `div.card` click → `#/poem/<id>`. `.author-link` `stopPropagation` → `#/author/<name>`.

**Overlay:** `#overlay` (`.hidden` when closed), `#poemDetail`, `#closeDetail`, `#pdPoem`, `.pd-line` `.py` / `.zh`, `#pyToggle`, `.pd-sec` / `.pd-sec-head` `h4` labels `译　文` `注　释` `赏　析` `English`. Canonical proof poem: **《关雎》** id `aec36ff73546` from `data/site/curated.json` (author `佚名`, so `#pdAuthor` is absent). First `#pdPoem .zh` line in this checkout is `关关雎鸠，在河之洲。窈窕淑女，君子好逑。` (诗经 stanzas are stored as newline-separated *pairs* of couplets — assert against the file, including the 雎鸠 graphs). Also curated: 《静夜思》 `6c1f9747d167` 李白.

**Read mode:** `.rs[data-m=cards|scroll]` inside list shells; `localStorage.readMode`.

**Failure:** `.loadfail` — boot (`数据没能载入。`), shard fetch (`没能取到这部分数据。`), missing poem (`没能取到这首作品。`).

Do not drive `admin.html` as a user path. Do not click `千里江山图`.

## Evidence

Directory (survives `stop`):

```text
.cursor/skills/verify-shiyuan/evidence/<run-id>/
```

For the required **poem-detail** proof, that directory must contain at least:

| file | what it proves |
|------|----------------|
| `doctor.txt` | doctor stdout (pid, port, origin, manifest total/build, ready=yes) |
| `manifest-total.txt` / `manifest.json` | `total` and `build` from the live instance, not a remembered number |
| `overlay-guanju.png` | screenshot of `#poemDetail` showing 《关雎》 / 关关雎鸠 |
| `pdPoem.txt` | `#pdPoem` innerText |
| `overlay-dump.json` | DOM title, `.zh` / `.py` lines, section labels, hash |
| `curated-aec36ff73546.json` | the curated record used for comparison (copied from the instance, not invented) |
| `network.json` | real `data/site/manifest.json`, `lookup/*.json`, `body/*.json` fetches |
| `COMPARE_OK.txt` | `.zh`/`.py` matched curated.json |
| `NOTES.txt` | human-readable: URL, first line, bootStat |

Proof standards:

- Real user path: `page.goto(origin + "/#/poem/aec36ff73546")` or click a card / `#dailyOpen`. Not `Store.poemById` from the console.
- Capture the **action** (hash, click) **and** the **resulting state** (`#overlay` without `.hidden`, `#pdPoem .zh` text).
- Side effects: JSON fetches under `data/site/`; overlay 原文/拼音 equal the curated record for that id. If they disagree, fail — do not “fix” the assertion by typing a poem from memory.
- No mocks. No invented poems. No fixture that replaces `data/site/`.

`evidence/` is gitignored except `evidence/README.md`. Quote the run path in the PR; do not commit PNGs.

## Cleanup

```bash
.cursor/skills/verify-shiyuan/bin/control-shiyuan stop "$RUN_ID"
```

- Kills **the recorded pid only** (SIGTERM, then SIGKILL if needed). Never `pkill -f http.server`.
- Deletes `.run/$RUN_ID/` (instance metadata + server log).
- Does **not** delete `.cursor/skills/verify-shiyuan/evidence/$RUN_ID/`.
- After stop, confirm:

```bash
test -f .cursor/skills/verify-shiyuan/evidence/$RUN_ID/overlay-guanju.png
test -f .cursor/skills/verify-shiyuan/evidence/$RUN_ID/pdPoem.txt
test ! -e .cursor/skills/verify-shiyuan/.run/$RUN_ID
```

If a drive fails, `stop` that RUN_ID before launching another so ports are not stranded.

`.scratch/` (Playwright install) may stay; it is gitignored. Do not put proof screenshots there.

## Helpers

Both binaries are executable under `.cursor/skills/verify-shiyuan/bin/`.

```bash
# 1. Launch an isolated static server (records pid/port/origin)
RUN_ID=$(date -u +%Y%m%dT%H%M%SZ)
.cursor/skills/verify-shiyuan/bin/control-shiyuan launch "$RUN_ID"
# → RUN_ID=… pid=… port=8731 origin=http://127.0.0.1:8731

# 2. Doctor (exit 0 / 1)
.cursor/skills/verify-shiyuan/bin/control-shiyuan doctor "$RUN_ID" \
  | tee .cursor/skills/verify-shiyuan/evidence/$RUN_ID/doctor.txt

# 3. Drive one mapped feature (poem-detail is the checkout proof)
.cursor/skills/verify-shiyuan/bin/drive-shiyuan "$RUN_ID" poem-detail
# other mapped features: home | library | search | authors

# 4. Tear down the process this run started; keep evidence
.cursor/skills/verify-shiyuan/bin/control-shiyuan stop "$RUN_ID"
```

Fail-closed doctor (expect exit 1; use throwaway run dirs, not the live RUN_ID):

```bash
# file://
FAKE=.cursor/skills/verify-shiyuan/.run/filetest
mkdir -p "$FAKE"
printf '%s\n' 'file:///tmp/index.html' > "$FAKE/origin"
echo 8731 > "$FAKE/port"
echo 1 > "$FAKE/pid"
.cursor/skills/verify-shiyuan/bin/control-shiyuan doctor filetest; echo $?   # 1

# unknown pid
FAKE=.cursor/skills/verify-shiyuan/.run/deadpid
mkdir -p "$FAKE"
echo 'http://127.0.0.1:8731' > "$FAKE/origin"
echo 8731 > "$FAKE/port"
echo 99999999 > "$FAKE/pid"
.cursor/skills/verify-shiyuan/bin/control-shiyuan doctor deadpid; echo $?   # 1
```

Do not leave those fake dirs around; `rm -rf` them (they were never launched, so `stop` has no process to kill).

## Feature map

See `features/README.md`. Top five user features: home, poem-detail, library, search, authors.

Map (`#/map`) needs the Leaflet CDN and OSM tiles — treat as a gotcha, not the first proof.
