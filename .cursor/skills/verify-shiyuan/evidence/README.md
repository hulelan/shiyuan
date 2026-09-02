# Evidence path

Proof artifacts for a 诗渊 verification run belong **here**:

```text
.cursor/skills/verify-shiyuan/evidence/<run-id>/
```

`<run-id>` is the same id passed to `bin/control-shiyuan launch`. The helper’s `stop` command deletes `.run/<run-id>/` only. **This directory must still exist after teardown.**

Required files for the checkout proof (`drive-shiyuan <id> poem-detail`):

- `doctor.txt` — copy of `control-shiyuan doctor` stdout
- `overlay-guanju.png` — `#poemDetail` showing 《关雎》
- `pdPoem.txt` — text of `#pdPoem`
- `COMPARE_OK.txt` — 原文/拼音 matched live `data/site/curated.json` id `aec36ff73546`
- `manifest-total.txt` — `manifest.total` from the instance
- `network.json` — real `data/site/` fetches
- `NOTES.txt` — what the screenshot showed

Do not commit PNG/JSON dumps from a run (gitignored). Do not put evidence under `.run/` or `/tmp` only. Do not invent overlay text if a screenshot is missing.
