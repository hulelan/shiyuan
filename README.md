# 诗渊 · 古诗古文集 (ShiYuan)

**在线站点：<https://classicalchinesepoetry.com>**

一个古诗古文的在线库。每一篇作品都配有 **原文 · 拼音 · 译文 · 注释 · 赏析 · 英译**，
并可从 **诗文库 / 作者 / 体裁 / 主题 / 字词 / 时间轴 / 地图** 七个角度探索——沿着时间之河、山川之间，
感受文言文从《诗经》到唐诗宋词的历史流变。

> 目标：让更多人读懂、也更爱古诗古文。

---

## 目录

- [特色](#特色)
- [快速开始](#快速开始)
- [项目结构](#项目结构)
- [数据怎么存](#数据怎么存)
- [网页怎么取数](#网页怎么取数)
- [给一篇作品配画](#给一篇作品配画)
- [已知的欠账](#已知的欠账)
- [数据管线](#数据管线扩充与增强)
- [部署](#部署github-pages--自定义域名)
- [路线图](#路线图)
- [版权与致谢](#版权与致谢)

---

## 特色

**七个探索视角**（顶部切换）：

| 视图 | 作用 |
|------|------|
| **诗文库** | 卡片式浏览，按朝代筛选，全文搜索标题 / 作者 / 诗句 |
| **主题** | 按 爱情 / 田园 / 送别 / 忧国 / 思乡… 聚合，看同一母题下古人各自的写法 |
| **时间轴** | 沿朝代与年份排列，直观看到四言《诗经》→ 唐诗格律 → 宋词长短句的演变 |
| **地图** | 以真实经纬度标注创作地点，同一地点的作品自动聚合 |

**每篇六层内容**：点击任意卡片，弹出详情——原文（可一键显隐**逐字拼音**）、
**译文**、**注释**、**赏析**、**English** 英译。文言文（散文/语录）自动切换为左对齐阅读版式。

**规模**：12 篇手工精编 + 约 4288 篇开源导入 ≈ **4300 篇/条**，跨 **先秦 / 唐 / 宋 / 元 / 清**，
涵盖 **诗**（诗经·楚辞·唐诗）、**词**（宋词·纳兰）、**曲**（元曲）、**文**（论语·大学·中庸·孟子）。

**技术上**：纯静态站点，无需构建、无后端。数据以 `<script>` 直接加载，
双击 `index.html` 即可离线运行（仅"地图"底图需联网）。

---

## 快速开始

```bash
# 方式一：直接打开（最简单）
open index.html            # macOS；或用浏览器打开该文件

# 方式二：本地服务器（地图等体验更完整）
python3 -m http.server 8731
# 浏览器访问 http://127.0.0.1:8731/
```

如需运行数据管线（导入 / 生成内容），先建 Python 环境：

```bash
python3 -m venv .venv
./.venv/bin/pip install pypinyin opencc-python-reimplemented requests
```

---

## 项目结构

```
poetry/
├── index.html          页面骨架 + 四个视图
├── css/style.css       水墨风样式（宋体、朱砂、留白）
├── js/app.js           全部交互逻辑（浏览、筛选、详情、时间轴、地图、分页）
├── assets/art/         配画：图片 + index.json（手写清单）
├── data/
│   ├── source/         原文层 —— 公有领域，随时可重新导入
│   │   └── <朝代>.jsonl
│   ├── enrich/         编辑层 —— 译文/注释/赏析/英译/主题/地点/断代
│   │   └── <朝代>.jsonl
│   ├── site/           构建产物 —— 网页真正抓取的分片（由脚本生成）
│   └── id_map.json     旧 id → 新 id 的迁移留档
├── js/
│   ├── store.js        数据层：按视图抓分片、缓存
│   └── app.js          路由与呈现
├── tools/
│   ├── corpus_lib.py       稳定 id、朝代分片、JSONL 读写（共用）
│   ├── build_corpus.py     从 chinese-poetry 拉原文 → 繁转简 → 拼音 → 并入 source/
│   ├── enrich_glm.py       调模型生成编辑层，只写 enrich/
│   ├── backfill_years.py   从 yearLabel 解析数字年份
│   ├── build_site_data.py  两层语料 → data/site/ 产物
│   └── migrate_corpus.py   一次性迁移（已执行完毕，留档）
├── CNAME               自定义域名（classicalchinesepoetry.com）
├── .nojekyll           告诉 GitHub Pages 按原样托管（不走 Jekyll）
└── README.md
```

## 数据怎么存

语料分成**两层**，各存各的文件，用 id 相连：

| 层 | 文件 | 内容 | 谁来写 |
|---|---|---|---|
| 原文层 | `data/source/*.jsonl` | 原文、拼音、体裁、朝代 | `build_corpus.py` |
| 编辑层 | `data/enrich/*.jsonl` | 译文、注释、赏析、英译、主题、地点、断代 | `enrich_glm.py` |

这么分是有代价换来的教训：原文是公有领域，随时能从
[chinese-poetry](https://github.com/chinese-poetry/chinese-poetry) 重新拉一遍；
编辑层却是花钱花时间生成的，一旦覆盖就没了。所以**导入脚本永远不写 `enrich/`**。

id 由内容派生 —— `md5(作者|标题|去空白原文)[:12]`，与导入顺序无关。
全文必须进哈希：宋词的 title 常是词牌名，晏殊一人就有 13 首《浣溪沙》，
只按 作者+标题 会把它们并成一首。

JSONL 一条一行、key 排序，因此重跑 enrich 只产生行级 diff，
而不是把整个语料文件重写一遍。

**校订原文要当心**：改动一个字，id 就变了，对应的编辑层会失联。
真要改，记得同时在 `data/id_aliases.json` 里登记 旧id → 新id。

### 加新诗

```bash
./.venv/bin/python tools/build_corpus.py       # 只增不改，已有的 id 直接跳过
./.venv/bin/python tools/enrich_glm.py --dry-run   # 看待办与预估花费
./.venv/bin/python tools/enrich_glm.py         # 生成编辑层
./.venv/bin/python tools/build_site_data.py    # 重建网页产物
git add data/ && git commit && git push        # Pages 只认提交进仓库的文件
```

## 网页怎么取数

浏览器不再持有全量语料。`tools/build_site_data.py` 把两层语料编译成
`data/site/` 下的分片，所有需要"扫全库"的统计（主题计数、体裁谱系、
作者存篇、字频）都在构建期算完：

- `curated.json` — 精编篇目全文，**首页只读这一个文件**（约 30 KB）
- `index/<朝代>-<n>.json` — 卡片索引，浏览列表用
- `body/<朝代>-<n>.json` — 全文，点开某篇时才抓对应那片
- `agg/…` — 作者、主题、体裁、地点、时间轴的预计算结果
- `search/<桶>.json` — 标题与作者的二元组倒排（**正文不在检索范围内**）
- `chars/<桶>.json` — 字词索引，每字最多 300 例，跨朝代抽样
- `lookup/<桶>.json` — id → 分片，供 `#/poem/<id>` 深链定位

每篇作品都有自己的地址：`#/poem/<id>`、`#/author/<名>`、`#/library/<朝代>` 等。

因为要按需抓取，页面**必须以 http 方式访问**，直接双击打开 `file://` 不行：

```bash
python3 -m http.server 8899     # 然后开 http://localhost:8899/
```

`admin.html` 是内部库存页，未挂在导航上，读的也是 `data/site/` 的产物。

## 给一篇作品配画

首页遇到配了画的那一篇，就用画配诗的版式：画在左，诗竖排在右，中间一道细线，
画名与藏处印在画下。没配画的照旧只排字 —— 两种版式并存，不必二选一。

加一幅画：

```bash
./.venv/bin/python tools/add_art.py 某张图.jpg --poem 静夜思 \
    --title 寒江独钓图 --artist 马远 --dynasty 南宋 --credit 东京国立博物馆 --write
```

脚本把图缩到网页尺寸、存进 `assets/art/`、在 `assets/art/index.json` 添一行。
`--poem` 可以给 id，也可以给标题或作者的一部分，对不上会把候选列出来。
不加 `--write` 只预览。

也可以手改 `assets/art/index.json` —— 一行一幅：

```json
{"poem":"6c1f9747d167","file":"6c1f9747d167.jpg","w":1200,"h":900,
 "title":"寒江独钓图","artist":"马远","dynasty":"南宋","credit":"东京国立博物馆"}
```

`poem` 是作品 id（`data/source/*.jsonl` 里查，或让脚本代查）。一篇配一幅，重配即覆盖。

**不必重跑 `build_site_data.py`** —— 这份清单是手写的，首页直接读它，提交推送即生效。

几点注意：

- 首页只从**精编集**里轮，配在非精编篇目上的画，只有从别处点进那一篇才看得到。
- 竖排只用在 60 字以内的短篇上，长调会自动改回横排，窄屏也一律横排。
- 只放**公有领域或你有权使用**的图。`credit` 会印在画旁边，`link` 可给出处链接。

### 别人（或你自己）推荐一幅画

作品详情浮层的最下面有一行「✎ 推荐一幅画」，首页那一篇若还没配画，
操作行里也会多出同一个入口。点开是一个**填好了作品信息的 GitHub issue**：
标题、作者、朝代、`id`、以及这一篇的直链都已写好，只剩画的信息要填。

收到之后照常走 `tools/add_art.py` —— issue 正文里那行 `id` 就是命令里的 `--poem`，
也是 `assets/art/index.json` 里的 `poem` 字段。

issue 的标题与正文一律用中文，界面切到英文也不变：这是给维护者看的，不是给读者看的。

## 色板

全站颜色都收在 `css/style.css` 顶部的 `:root` 里，正文规则**一处写死的颜色都没有**；
要一层浅淡就用 `color-mix()` 从主色兑。当前固定为「素宣」：
生宣白纸、墨色近黑、赭金收成灰褐，只留一方朱砂印作活色。

`css/shell.css`（两个站共用的标签条）里的颜色都写成 `var(--x, 原值)`：
诗站定义了就跟着色板走，画站没定义就还是原来的样子。

## 界面语言

页眉右端有个很小的 `EN` / `中文`。**只换界面**——导航、按钮、说明文字、栏目名，
外加朝代名的拉丁转写（诗文库靠它筛选，算导航）。
诗文、作者名、体裁名、主题词一概不译：那是内容。

词条在 `js/i18n.js`，用中文原句作键。没译到的句子会原样落回中文，
不会出现空白或 `missing.key`。新加界面文案时记得包一层 `T()`。

## 已知的欠账

- **主题词没有受控词表**：模型逐篇自由生成，2966 篇就产出 960 个主题，
  其中 748 个不足 5 篇。扩库前值得先定一份词表并回标。
- **检索只覆盖标题与作者**，正文尚未建索引，也还没有相关性排序。
- **字词索引有截断**：只为最常见的 1500 字建索引，每字最多 300 例。
- **断代仍有空白**：约 700 篇只有"盛唐""春秋末期"这类无数字的标签，
  时间轴上按朝代整体定位，页面会标出来。
- **地图的时间滑块只认确年**：1135 篇有坐标，其中 1013 篇断得出确年；
  余下 122 篇只知朝代，按年筛选时不计入（全览里照常在）。
  滑块上 -250 ～ 400 与 1150 ～ 1250 两段几乎全空，那是语料的缺口，不是历史的。

## 数据管线：扩充与增强

### 1) 导入原文（`build_corpus.py`）

从 chinese-poetry 拉取选定语料，繁体转简体（opencc），生成逐字拼音（pypinyin），
按本项目 schema **并入** `data/source/*.jsonl` —— 只增不改，已有的 id 直接跳过，
`data/enrich/` 除了给新诗补一条空记录之外一个字都不动。
编辑脚本顶部的 `SOURCES` 可增删语料、调整数量。

```bash
cd tools && ../.venv/bin/python build_corpus.py
```

### 2) 生成译文/注释/赏析/英译（`enrich_glm.py`）

调模型（经 OpenRouter）为原文层补齐编辑层：读 `data/source/`，只写 `data/enrich/`，
精编篇目自动跳过。**密钥从项目根目录 `.env` 读取**
（该文件已 gitignore，绝不提交）：

```
OPENROUTER_API_KEY=sk-or-你的key
```

```bash
cd tools
../.venv/bin/python enrich_glm.py --sample 20        # 跨朝代抽 20 首试跑
../.venv/bin/python enrich_glm.py --dry-run                # 只看待办与预估花费
../.venv/bin/python enrich_glm.py --workers 8              # 全量
```

常用参数：

| 参数 | 说明 |
|------|------|
| `--sample N` | 跨朝代/体裁均匀抽 N 首试跑（而非取前 N 首） |
| `--limit N` | 本次最多处理 N 首 |
| `--workers N` | 并发数（默认 8） |
| `--model` | OpenRouter 模型 id，默认 `qwen/qwen3-vl-235b-a22b-instruct` |
| `--dry-run` | 只列待办与预估花费，不调 API、不写文件 |
| `--reasoning` | 开启思维链（更深，但慢约 9×、贵约 3×）。默认关闭 |

**性能与成本**（关思维链、8 并发）：约 7 秒/首，全量约 45 分钟；
GLM-4.7 全量约 \$3，GLM-5.2 约 \$7。脚本每 200 首落盘一次，且只重写当次改动过的朝代分片，可随时中断、续跑跳过已完成的。

### 3) 补断代（`backfill_years.py`）

导入时只能按朝代给一个占位年份（全唐诗一律 750），时间轴会退化成几根直柱。
这个脚本从既有的 `yearLabel` 里解析出数字年份，并用朝代区间验算
（模型常漏写「前」字，「战国 约320年」若照单全收会把孟子放到公元 320 年）。

```bash
python3 tools/backfill_years.py           # 试运行
python3 tools/backfill_years.py --write
```

### 4) 编译网页产物（`build_site_data.py`）

改动过语料之后必须重跑，否则网页看到的还是旧分片。

```bash
./.venv/bin/python tools/build_site_data.py
```

### 3) 对比模型（`compare_models.py`）

在相同诗文上并排跑两个模型，输出对照到 `tools/model_compare.md`，便于选型。

---

## 部署：GitHub Pages + 自定义域名

站点是纯静态文件，托管在 **GitHub Pages**，`main` 分支根目录直接发布：

- 每次 `git push` 自动重新部署。
- 自定义域名 `classicalchinesepoetry.com` 通过仓库根的 `CNAME` 文件 + 域名 DNS 的 A 记录
  （指向 GitHub Pages `185.199.108–111.153`）绑定，已启用强制 HTTPS。
- `www` 子域名可加一条 CNAME 指向 `hulelan.github.io`。

更新数据后重新发布：

```bash
git add data/ && git commit -m "更新语料" && git push
```

---

## 路线图

- **人工校订**：把 AI 生成的名篇逐步审校后"转正"（去掉 `enrichedBy` 标记）。
- **更多语料**：`build_corpus.py` 里加 `全宋诗`、`五代`、更多唐诗分卷，走向"每一首已知古诗古文"。
- **数据分片**：诗文过万后，把导入集按朝代/作者分文件，或转后端 + 数据库 + 搜索引擎。
- **功能**：作者专页、诗词朗读、繁简切换、逐字注音悬浮、书法字体。

---

## 版权与致谢

- **原文**：为公有领域，主要来自 [chinese-poetry](https://github.com/chinese-poetry/chinese-poetry)（MIT）。
- **编辑层**（译文/注释/赏析/英译）：由本项目自撰或大模型生成，页面标注来源；不抓取
  古诗文网 / 古文岛等网站的受版权保护的原创注解。
- **地图底图**：© OpenStreetMap 贡献者。
- 拼音由 [pypinyin](https://github.com/mozillazg/python-pinyin) 生成，繁简转换用
  [OpenCC](https://github.com/BYVoid/OpenCC)。

文本仅供学习研究之用。
