# Library (诗文库)

诗文库 is the browse-by-dynasty card list. It is not in the top tab row; it lives under 更多视角. `viewLibrary(slug)` paints `#libFilters` (chip per `manifest.dynasties` plus 全部) and `#libBody` via `listBody()` — same 卡片 / 长卷 shell as author/type/theme lists. Cards come from `data/site/index/<slug>-<nnn>.json`. Filter navigation is hash: `#/library` or `#/library/tang` (slugs `xianqin` `weijin` `tang` `wudai` `song` `yuan` `qing`).

## Sub-features

- `lens-library` — `#lensBtn` opens `#lensMenu`; `button.lens-item[data-view=library]` goes to `#/library`.
- `dynasty-chips` — `#libFilters button.chip`; 全部 → `#/library`; named chips → `#/library/<slug>` with counts from the manifest.
- `cards` — `#libBody .card` (default `readMode` `cards`); click → `#/poem/<id>`.
- `scroll` — `#libBody .rs[data-m=scroll]` 长卷; sets `localStorage.readMode`; columns `#scrollPaper .scroll-col`.
- `author-on-card` — `.author-link` click does not open the poem; hash becomes `#/author/<name>`.

## How to get to it (user POV)

From any booted page: click **更多视角**, then **诗文库**. You should see dynasty chips and a grid of `div.card` (or a handscroll if this origin already has `readMode=scroll`). Click 唐 (or the chip whose label contains the dynasty name) to stay in library with a slug in the hash. Click a card to read. Do not use the painting tab. Direct hash `#/library/tang` is also a user-shareable URL.

## Driving it with drive-shiyuan

Preconditions:

- Doctored instance; `manifest.dynasties` has slugs including `tang`.
- Prefer a fresh origin so `readMode` is default `cards` (or accept whatever this port's localStorage already holds — different ports do not share it).

- **User:** open 更多视角 and choose 诗文库.
  **Command:** `.cursor/skills/verify-shiyuan/bin/drive-shiyuan "$RUN_ID" library` (clicks `#lensBtn` then `#lensMenu button.lens-item[data-view=library]`).
  **Result:** `#lensBtn` `aria-expanded` was `true` while the menu was open; after click, hash `#/library`; `#view-library` not `.hidden`; `#view-home` is `.hidden`; `#libFilters button.chip` includes 全部 and one chip per dynasty; `#libBody .card` count ≥ 1 (or `.scroll-col` if already in 长卷). Screenshot `library.png`.

- **User:** filter to 唐.
  **Command:** Playwright `page.locator("#libFilters button.chip", { hasText: "唐" }).click()` or `page.goto(origin + "/#/library/tang")`.
  **Result:** hash `#/library/tang`; the 唐 chip has `.active`; index fetch `data/site/index/tang-000.json` (and maybe `tang-001.json`) in the network log.

- **User:** switch 卡片 → 长卷.
  **Command:** `page.locator("#libBody .rs[data-m=scroll]").click()`.
  **Result:** that button has `.on`; `#scrollPaper` exists; `localStorage.readMode === "scroll"` on **this origin**.

- **User:** open a poem from a card.
  **Command:** `page.locator("#libBody .card").first().click()`.
  **Result:** hash `#/poem/<id>`; overlay as in poem-detail.md. Do not type the 原文 yourself.

## Gotchas

- Lens items are **injected** (`#lensMenu` is empty in `index.html`). Wait for `button.lens-item` after boot; `applyChrome()` / `buildLens()` runs in `init` and again after `Store.boot()`.
- `aria-expanded` returns to `false` after a lens item click (`lensOpen(false)`).
- Chip labels are `T.dyn(d.k) + " " + d.count` (e.g. `唐 2154` in this checkout — **read the count from manifest**, do not hardcode).
- Pagination: first paint is one index shard (up to 2000 cards worth of index, then PAGE=120 in the grid). `显示更多` is `#libBody button.more-btn`.
- 长卷 lazily calls `Store.poem` per batch; it is slower and hits `body/` shards. First proof does not require it.
- `.author-link` is easy to miss: clicking the author name is **not** a poem open.
- Do not restyle `.tabrow-works` / `css/shell.css` while verifying library.
