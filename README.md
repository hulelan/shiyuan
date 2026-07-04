# 诗渊 · 古诗古文集 (ShiYuan)

**在线站点：<https://classicalchinesepoetry.com>**

一个古诗古文的在线库。每一篇作品都配有 **原文 · 拼音 · 译文 · 注释 · 赏析 · 英译**，
并可从 **诗文库 / 主题 / 时间轴 / 地图** 四个角度探索——沿着时间之河、山川之间，
感受文言文从《诗经》到唐诗宋词的历史流变。

> 目标：让更多人读懂、也更爱古诗古文。

---

## 目录

- [特色](#特色)
- [快速开始](#快速开始)
- [项目结构](#项目结构)
- [数据模型](#数据模型)
- [数据管线](#数据管线扩充与增强)
- [部署](#部署github-pages--自定义域名)
- [路线图](#路线图)
- [版权与致谢](#版权与致谢)

---

## 特色

**四个探索视角**（顶部切换）：

| 视图 | 作用 |
|------|------|
| **诗文库** | 卡片式浏览，按朝代筛选，全文搜索标题 / 作者 / 诗句 |
| **主题** | 按 爱情 / 田园 / 送别 / 忧国 / 思乡… 聚合，看同一母题下古人各自的写法 |
| **时间轴** | 沿朝代与年份排列，直观看到四言《诗经》→ 唐诗格律 → 宋词长短句的演变 |
| **地图** | 以真实经纬度标注创作地点，同一地点的作品自动聚合 |

**每篇六层内容**：点击任意卡片，弹出详情——原文（可一键显隐**逐字拼音**）、
**译文**、**注释**、**赏析**、**English** 英译。文言文（散文/语录）自动切换为左对齐阅读版式。

**规模**：12 篇手工精编 + 约 2954 篇开源导入 ≈ **2966 篇/条**，跨 **先秦 / 唐 / 宋 / 元 / 清**，
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
├── data/
│   ├── poems.js        window.POEMS —— 12 篇手工精编（质量标杆）
│   ├── corpus.js       window.POEMS_IMPORTED —— 开源导入集（网页加载用）
│   └── corpus.json     导入集的 JSON 源（管线读写用）
├── tools/
│   ├── build_corpus.py 从 chinese-poetry 拉原文 → 繁转简 → 生成拼音
│   ├── enrich_glm.py   用 GLM（OpenRouter）生成 译文/注释/赏析/英译/主题/地点/年份
│   └── compare_models.py  并排对比不同模型的生成质量
├── CNAME               自定义域名（classicalchinesepoetry.com）
├── .nojekyll           告诉 GitHub Pages 按原样托管（不走 Jekyll）
└── README.md
```

数据分两层，来源不同、互不覆盖：

- **`data/poems.js`** — 手工精编的 12 篇，六层内容齐全，是质量标杆。
- **`data/corpus.js`** — 自动导入。原文来自
  [chinese-poetry](https://github.com/chinese-poetry/chinese-poetry)（公有领域），拼音自动生成；
  译文/注释/赏析/英译/主题/地点由大模型生成，页面标注"AI 生成·待校订"（`enrichedBy` 字段）。

---

## 数据模型

`window.POEMS` / `window.POEMS_IMPORTED` 均为同一 schema 的对象数组：

```js
{
  id: "唯一标识",
  title: "标题",
  author: "作者",                 // 不详写 "佚名"
  dynasty: "唐",                  // 须是 DYNASTIES 中的朝代
  dynastyOrder: 6,                // 朝代排序权重（时间轴用）
  year: 757,                      // 约略年份，公元前用负数
  yearLabel: "盛唐 757 年",        // 展示用年份文字
  form: "五言律诗",               // 体裁 / 格律 / 词牌
  genre: "诗",                    // 诗 / 词 / 曲 / 文 / 赋
  themes: ["战乱", "忧国"],        // 主题标签（主题视图据此聚合）
  place: { name:"长安", modern:"今西安", lat:34.27, lng:108.95 }, // 或 null
  text: "第一句。\n第二句。",       // 原文，句间用 \n
  pinyin: "dì yī jù 。\ndì èr jù 。", // 逐行对应 text，可为 ""
  translation: "白话译文…",
  notes: [ { term:"词语", explain:"解释" } ],
  appreciation: "赏析…",
  english: "English translation…",
  enrichedBy: "glm-5.2"           // 若为 AI 生成则标注，页面据此显示提示
}
```

字段可缺省——应用会优雅降级：缺失的层显示"待补"，无坐标的作品不出现在地图上。
手工新增一篇：直接在 `data/poems.js` 的数组里按上表追加一个对象即可，无需改代码。

> ⚠️ 中文文本内部若要引号，请用全角 “ ” ，避免与 JS 字符串的英文引号冲突。

---

## 数据管线：扩充与增强

### 1) 导入原文（`build_corpus.py`）

从 chinese-poetry 拉取选定语料，繁体转简体（opencc），生成逐字拼音（pypinyin），
按本项目 schema 写出 `data/corpus.{json,js}`。编辑脚本顶部的 `SOURCES` 可增删语料、调整数量。

```bash
cd tools && ../.venv/bin/python build_corpus.py
```

### 2) 生成译文/注释/赏析/英译（`enrich_glm.py`）

用 GLM（经 OpenRouter）为导入的原文补齐编辑层。**密钥从项目根目录 `.env` 读取**
（该文件已 gitignore，绝不提交）：

```
OPENROUTER_API_KEY=sk-or-你的key
```

```bash
cd tools
../.venv/bin/python enrich_glm.py --sample 20        # 跨朝代抽 20 首试跑
../.venv/bin/python enrich_glm.py --model z-ai/glm-5.2 --workers 8   # 全量
```

常用参数：

| 参数 | 说明 |
|------|------|
| `--sample N` | 跨朝代/体裁均匀抽 N 首试跑（而非取前 N 首） |
| `--limit N` | 本次最多处理 N 首 |
| `--workers N` | 并发数（默认 8） |
| `--model` | OpenRouter 模型 id，默认 `z-ai/glm-4.7`；可用 `z-ai/glm-5.2` |
| `--reasoning` | 开启思维链（更深，但慢约 9×、贵约 3×）。默认关闭 |

**性能与成本**（关思维链、8 并发）：约 7 秒/首，全量约 45 分钟；
GLM-4.7 全量约 \$3，GLM-5.2 约 \$7。脚本每 20 首自动落盘，可随时中断、续跑跳过已完成的。

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
