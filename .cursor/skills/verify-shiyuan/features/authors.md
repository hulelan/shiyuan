# Authors

The author index is a lens view (`#/authors`); a single poet is `#/author/<name>` (`view-author`, not the same section). Index data is `data/site/agg/authors.json`; works are `data/site/agg/author/<bucket>.json`. Proof poet is **李白**, which is a real name in this corpus (静夜思 `6c1f9747d167` is one of the curated works). Do not invent an author page for someone not in `agg/authors.json`.

## Sub-features

- `index` — `#/authors` shows `#authorInput`, `#authorFilters` chips, `#authorIndex .au-cell`, `#authorsCount`.
- `filter-search` — `#authorInput` filters `a.n`; dynasty chips on `#authorFilters` set `authorDyn`.
- `open-poet` — click `.au-cell` or hash `#/author/李白` → `#view-author` `h1.author-name` 李白.
- `works` — `#authorWorks` uses the same `listBody` (卡片/长卷); card click → overlay.
- `back` — `#authorBack` `‹ 作者索引` → `#/authors`.

## How to get to it (user POV)

更多视角 → 作者, or open `#/authors`. Scan or search 李白, click the cell (seal 李, name 李白). The dedicated page has a back link, a count 共收录 **n** 篇, and a work list. Clicking a card is the overlay path. Direct URL `#/author/李白` is valid (name is decoded from the hash).

## Driving it with drive-shiyuan

Preconditions:

- Doctored instance. `GET /data/site/agg/authors.json` must include an entry whose `n` is `李白` (if a future corpus drops 李白, stop — do not pick a random substitute in the skill without updating this file).

- **User:** open the author index.
  **Command:** `.cursor/skills/verify-shiyuan/bin/drive-shiyuan "$RUN_ID" authors` starts at `origin + "/#/authors"`.
  **Result:** `#view-authors` not `.hidden`; `#authorIndex .au-cell` count ≥ 1; `#authorsCount` matches `共 {n} 位`.

- **User:** open 李白.
  **Command:** harness sets `location.hash = "/author/" + encodeURIComponent("李白")` after the index has booted (user-equivalent: click the `.au-cell` whose `.au-name` is 李白, or `page.goto(origin + "/#/author/" + encodeURIComponent("李白"))`).
  **Result:** `#view-author` visible; `h1.author-name` text `李白`; `#authorBack` present; `#authorWorks .card` or `.scroll-col` count ≥ 1; no `.loadfail`. Screenshot `author-libai.png`. Hash is `#/author/李白` (percent-encoded in `location.hash` is still this poet after `decodeURIComponent`).

- **User:** open a work, then go back to the index.
  **Command:** `page.locator("#authorWorks .card").first().click()` then later `page.locator("#authorBack").click()`.
  **Result:** overlay hash `#/poem/<id>`; after close + back, `#/authors` and `#view-authors` visible.

- **User (lens path):** click `#lensBtn` then `button.lens-item[data-view=authors]`.
  **Command:** same selectors as library.md, `data-view=authors`.
  **Result:** hash `#/authors`; `#lensBtn` label becomes `作者` while that lens is active (`show()` rewrites the button to the current lens name).

## Gotchas

- `#view-authors` and `#view-author` are **different** sections. Assert the one `show()` selected.
- Names in the hash are URI-encoded. Always `decodeURIComponent` when comparing to `李白`.
- Index paint caps at 600 cells (`共 {n} 位（显示前 600，可搜索缩小范围）`). Search `#authorInput` rather than scrolling forever.
- `authorQuery` / `authorDyn` are module-level; they persist for the tab lifetime on this origin.
- Empty poet (`Store.authorWorks` → `[]`) renders `.loadfail` `没有 {name} 的作品` — that is a failed navigation, not a reason to invent works.
- `.author-link` on cards elsewhere also routes here; stopPropagation means the card poem must not open.
- Do not follow 千里江山图 from this page either.
