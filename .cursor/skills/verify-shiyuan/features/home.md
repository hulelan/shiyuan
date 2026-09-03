# Home (一日一篇)

The landing view is a single curated poem, not a grid. `viewHome()` loads `data/site/curated.json` (12 works) plus `assets/art/index.json`, picks `pool[(floor(Date.now()/86400000) + homeOffset) % 12]`, and paints `#view-home`. Brand and bootStat live in the header and must match the live manifest after `Store.boot()`. Opening 释文 is a user path onto the same overlay as poem-detail; the poem on screen that day must exist in curated.json — never invent one.

## Sub-features

- `home-brand` — `.brand` `h1` is `诗渊`; click goes to `#/`.
- `home-bootstat` — `#bootStat` becomes `收录 {n} 篇` with `n` from `GET /data/site/manifest.json` `.total`.
- `home-daily` — `#dailyText` shows the day-indexed curated poem; `#dailyNext` (`换一篇`) increments `homeOffset` and re-renders.
- `home-open` — `#dailyOpen` (`释　文`) or click `#dailyText` → `#/poem/<id>` overlay for that curated work.
- `home-art` — if `assets/art/index.json` has a `poem` matching today's id, home uses `.daily.paired`; otherwise `.daily` plus optional「推荐一幅画」.

## How to get to it (user POV)

Open the recorded origin in a browser (`http://127.0.0.1:$PORT/`). After boot, the tabstrip shows 诗渊 active, the header says 诗渊, `#bootStat` reads 收录 … 篇, and the main column is one poem with 释　文 / 换一篇. That *is* home (`#/` or empty hash). Do not open `admin.html`. Do not click 千里江山图.

## Driving it with drive-shiyuan

Preconditions:

- `control-shiyuan launch` then `doctor` exit 0 for this `RUN_ID`.
- Origin is the recorded loopback http server (not `file://`).
- Evidence dir will be `.cursor/skills/verify-shiyuan/evidence/$RUN_ID/`.

- **User:** load the site and wait until the header count appears.
  **Command:** `.cursor/skills/verify-shiyuan/bin/drive-shiyuan "$RUN_ID" home` (internally `page.goto(origin + "/#/")` then wait until `#bootStat` matches `/收录\s*\d+\s*篇/`).
  **Result:** `#view-home` is not `.hidden`; `#dailyText` has at least one `<p>`; `#dailyOpen` text is `释　文`; `#dailyNext` text is `换一篇`; `#bootStat` equals `收录 {manifest.total} 篇`.

- **User:** click 释　文 on today's poem.
  **Command:** same harness clicks `#dailyOpen` (equivalent user click on `#dailyOpen` or `#dailyText`).
  **Result:** location becomes `#/poem/<id>`; `#overlay` loses `.hidden`; `#pdPoem .zh` first line plus `.pd-head h2` match some record in live `curated.json` (id recorded in `home-dump.json`). Screenshot `overlay-home-open.png`.

- **User:** click the brand to go home.
  **Command:** Playwright `page.locator(".brand").click()` after overlay close, or `page.goto(origin + "/#/")`.
  **Result:** hash `#/` or `#`; `#view-home` visible.

- **User (manual equivalent, MCP/CDP):** `browser_navigate` to `$ORIGIN/#/` → snapshot `#dailyText` `#dailyOpen` `#bootStat` → click `#dailyOpen` → snapshot `#pdPoem`.

## Gotchas

- Today's poem **rotates**. Do not assert a fixed title on `#dailyText`. Assert membership in curated.json.
- `file://` never fills bootStat with a count; you get `.loadfail` / 数据没能载入 instead.
- `#langToggle` changes bootStat to `{n} works` but not the poem text.
- Overlay does not `show("home")` away; closing `#closeDetail` restores the underlying hash (`/` if you opened from home).
- Do not treat `homeOffset` as something you set from the console for proof; use `#dailyNext` if you need another curated piece.
- Art pairing is optional; absence of a painting is not a failure.
