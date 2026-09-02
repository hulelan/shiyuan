# Poem detail overlay

The reader path for a full work is a modal overlay, not a `#view-*`. `route()` on `#/poem/<id>` calls `openPoem(id)` and returns without `show()`. Data comes from `Store.poemById`: `data/site/lookup/<bucket>.json` then `data/site/body/<slug>-<nnn>.json` (URLs get `?v=<manifest.build>` after boot). For checkout proof, use curated id `aec36ff73546` 《关雎》 and compare `#pdPoem` to the same id in `data/site/curated.json` served by **this** instance. The first `.zh` line in this checkout is `关关雎鸠，在河之洲。窈窕淑女，君子好逑。` — if the file says otherwise, believe the file, never a remembered variant.

## Sub-features

- `deep-link` — `GET $ORIGIN/#/poem/aec36ff73546` opens `#overlay` `#poemDetail` after boot.
- `card-open` — `div.card` click sets hash `#/poem/<id>` (library/home/author lists).
- `original-pinyin` — `#pdPoem .pd-line .zh` / `.py`; `#pyToggle` toggles `.no-pinyin` and 隐藏拼音 / 显示拼音.
- `sections` — `.pd-sec` blocks `译　文` `注　释` `赏　析` `English` (ideographic spaces in the Chinese labels). First section starts `.open`.
- `close` — `#closeDetail`, overlay backdrop click, or Escape; restores `underlying` hash; `#overlay` gets `.hidden` again.

## How to get to it (user POV)

Three honest paths: (1) paste `#/poem/aec36ff73546` on the local origin; (2) on home, click 释　文; (3) in 诗文库, click a `div.card`. The overlay is a sheet over whatever view was showing — the URL is the poem, the view underneath does not switch. Close with ×. Author `佚名` on 关雎 is plain text, not `#pdAuthor`. For 李白 works, `#pdAuthor` navigates to `#/author/李白`.

## Driving it with drive-shiyuan

Preconditions:

- Instance launched and doctored (`ready=yes`). `curated.json` on that origin contains `aec36ff73546`.
- Do not use `file://`. Do not call `openPoem` from the console as the proof.
- Chrome/Playwright available via `bin/drive-shiyuan` (installs `playwright-core` into `.scratch/`).

- **User:** open the canonical deep link.
  **Command:** `.cursor/skills/verify-shiyuan/bin/drive-shiyuan "$RUN_ID" poem-detail`
  **Result:** hash `#/poem/aec36ff73546`; `#overlay` without `.hidden`; `.pd-head h2` is the curated `title` (关雎); first `#pdPoem .pd-line .zh` equals curated `text` split on newline `[0]`; `.py` lines equal curated `pinyin` lines; `.pd-sec-head h4` includes `译　文`, `注　释`, `赏　析`, `English`. Evidence: `overlay-guanju.png`, `pdPoem.txt`, `COMPARE_OK.txt`.

- **User:** the app fetches shards (side effect of the same navigation).
  **Command:** harness records `page.on("response")` for `/data/site/` (also dumped as `network.json`).
  **Result:** HTTP 200 for `manifest.json`, some `lookup/*.json`, some `body/*.json`. Overlay 原文 matches curated.json for that id (body shard and curated set must agree; if not, fail).

- **User:** close the overlay.
  **Command:** Playwright `page.locator("#closeDetail").click()` (or `browser_click` on `#closeDetail`).
  **Result:** `#overlay` has `.hidden`; hash leaves `#/poem/…` for the underlying route (`/` on a cold deep link once close runs `go(underlying)` — underlying starts as `/`).

- **User (card path, not the first proof):** from library, `page.locator("#libBody .card").first().click()`.
  **Command:** `.cursor/skills/verify-shiyuan/bin/drive-shiyuan "$RUN_ID" library` then a click; or CDP click `div.card`.
  **Result:** hash `#/poem/<12-hex-id>`; overlay populated. Still assert text from fetched body/curated, not from a fixture you typed.

## Gotchas

- `#/poem/<id>` does **not** add `.hidden` to `#view-home` via `show()` — on a cold load the home section may still be in the DOM without `.hidden` while the overlay sits on top. Assert overlay state, not “home is hidden”.
- Proof id is `aec36ff73546`. Title in data is **关雎**. First `.zh` line is the full first stanza (`关关雎鸠，在河之洲。窈窕淑女，君子好逑。`), not a single couplet. Do not “correct” graphs from memory.
- `佚名` means no `#pdAuthor`.
- `#pyToggle` exists only when pinyin line count equals text line count.
- Empty translation/notes render `— 待补充 —`; 关雎 is curated and has those fields — assert they are real text from curated.json, not the placeholder.
- `enrichedBy` on 关雎 shows `.ai-note`; that is expected, not a load fail.
- Closing is the user path back; do not `evaluate` `closeDetail()` as the only close proof.
- Map/near-neighbor fetches (`near/*.json`) are extra; failure there is silent in UI (`renderNear` swallows). Do not require neighbors for this proof.
