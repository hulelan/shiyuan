# Search

The header box `#search` is the public search. Typing is debounced **260ms** in `init()`, then `go("/search/" + encodeURIComponent(v))`. `viewSearch` uses `Store.searchBM25` when `manifest.bm25Buckets` is set (it is, in this checkout): query is split into Han characters `/[一-鿿]/`; **no Han → immediate empty array**. Hits render as `.word-row` under `#searchBody` (title 《…》 + dynasty·author), capped at 300. This checkout’s BM25 index includes 正文, so 明月 should surface 《静夜思》 `6c1f9747d167` **if that id is in the ranking** — assert presence when the row list contains `静夜思`, and record the live hit count; do not fake a hit list.

## Sub-features

- `debounce` — input does not change the hash until ~260ms after the last keystroke.
- `hash` — non-empty trimmed query → `#/search/<q>` (`view-search`).
- `han-bm25` — query `明月` loads `#view-search`, intro `"{q}" 命中 {n} 条`, rows in `#searchBody`.
- `latin-empty` — `hello` / `Li Bai` → still navigates to `#/search/hello` but `#searchBody .empty` (没有匹配的作品。).
- `open-hit` — click `.word-row` → `#/poem/<id>` overlay.

## How to get to it (user POV)

Stay on the public `index.html` header. Type 明月 in the search field, pause a beat, and wait for the view to switch. You should see a count and a list; 《静夜思》 is the sanity work (李白, curated id `6c1f9747d167`). Type English only and expect an empty state, not a crash. Click a row to open the overlay. Clearing the box does not auto-return home (only a non-empty `v` schedules `go`).

## Driving it with drive-shiyuan

Preconditions:

- Doctored instance; `manifest.bm25Buckets` is 64 in this checkout (if missing, UI falls back to title/author `search/` shards — still Han-only).
- Drive with the real `#search` input, not `location.hash =` as the **only** proof (hash is allowed as a second path).

- **User:** type a Latin-only query and wait past the debounce.
  **Command:** `.cursor/skills/verify-shiyuan/bin/drive-shiyuan "$RUN_ID" search` (fills `#search` with `hello`, waits 400ms).
  **Result:** hash `#/search/hello`; `#view-search` visible; `#searchBody .empty` present; `.word-row` count is 0.

- **User:** type 明月 and wait past 260ms.
  **Command:** same harness then `page.fill("#search", "明月")` and wait for `decodeURIComponent(location.hash) === "#/search/明月"`.
  **Result:** hash `#/search/明月`; intro reports a positive `n`; `#searchBody .word-row` ≥ 1. If any row text includes `静夜思`, that satisfies the BM25 sanity check; record `hasJingye` in `search-dump.json`. If 静夜思 is absent in a future corpus, fail only the “among hits” note — still require n≥1 and no invented titles.

- **User:** observe debounce.
  **Command:** harness timestamps from fill to hash change (`debounceMs` in `search-dump.json`).
  **Result:** hash does not update instantly; wait is on the order of 260ms (timer in `js/app.js` is exactly 260). Do not assert millisecond equality under load.

- **User:** click a hit (optional extra).
  **Command:** `page.locator("#searchBody .word-row").filter({ hasText: "静夜思" }).first().click()`.
  **Result:** overlay; if that row is 静夜思, id in hash is `6c1f9747d167` and 原文 must match curated.json for that id (`床前明月光，疑是地上霜。` as first line in this checkout).

## Gotchas

- BM25 **requires Han**. `Store.searchBM25` / `Store.search` both `match(/[一-鿿]/g)` and return `[]` otherwise — the route still changes.
- Debounce is on `input`, not `change`. Pasting triggers one timer.
- Empty string after trim does **not** navigate (timer still runs but `if (v)` fails).
- Intro copy differs if `bm25Buckets` is missing (“检索范围为标题与作者”). This checkout has BM25: “标题、作者与正文都在检索范围内，按相关度排序。”
- Rows do not print the id in the DOM; id is only on the click closure. Identify 静夜思 by title text, then confirm via overlay hash / curated.json.
- `#search` placeholder is `搜索标题或作者…` even though BM25 also ranks 正文.
- Do not query the live production site as “the” instance; localStorage and ranking stay on the port you launched.
