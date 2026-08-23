/* i18n.js — 只译界面，不译诗。
 *
 * 范围划得很清楚：导航、按钮、说明文字、栏目名 —— 也就是"怎么用这个站"。
 * 诗文、作者名、体裁名、主题词一律留原样：那是内容，不是界面。
 * 朝代名是个例外，它同时也是导航（诗文库的筛选就靠它），所以给了拉丁转写。
 *
 * 词典用中文原句作键。这样即使某句还没译，T() 也会原样返回，
 * 界面不会出现空白或 "missing.key" 这种东西。
 * 带 {n} 之类的占位符，中英两边都要留着。
 */
window.T = (function () {
  "use strict";

  var LANG = "zh";
  try { LANG = localStorage.getItem("lang") === "en" ? "en" : "zh"; } catch (e) {}

  var EN = {
    /* ---- 页眉 / 导航 ---- */
    "古诗古文 · 溯源": "Classical Chinese Poetry",
    "收录 {n} 篇": "{n} works",
    "首页": "Home",
    "诗文库": "Library",
    "作者": "Poets",
    "体裁": "Forms",
    "主题": "Themes",
    "字词": "Words",
    "时间轴": "Timeline",
    "地图": "Map",
    /* 顶栏的下拉。每一项带一句说明，展开时才看得到 */
    "更多视角": "Other ways in",
    "按朝代翻卡片": "Browse by dynasty",
    "一人一生的笔墨": "A poet's whole hand",
    "四言、律诗、词、曲": "Four-character verse, regulated verse, ci, qu",
    "送别、思乡、田园": "Parting, homesickness, the countryside",
    "循一个字走进诗篇": "Follow a single character",
    "沿年份看诗体流变": "How the forms changed over time",
    "诗写在哪一片土地上": "Where the poems were written",
    "搜索标题或作者…": "Search titles or poets…",
    "文本仅供学习研究之用": "Texts provided for study and research",

    /* ---- 通用 ---- */
    "取书中…": "Loading…",
    "检索中…": "Searching…",
    "没能取到这部分数据。": "Could not load this data.",
    "数据没能载入。": "The data could not be loaded.",
    "全部": "All",
    "共 {n} 篇": "{n} works",
    "显示更多（还有 {n} 篇）": "Show more ({n} remaining)",
    "没取到，点此重试": "Failed — click to retry",
    "这里还没有作品。": "Nothing here yet.",
    "收起": "Show fewer",

    /* ---- 首页 ---- */
    "释　文": "Read",
    "换一篇": "Another",

    /* ---- 作者 ---- */
    "一人一生的笔墨，聚在一处看，才见得出脾气。按朝代筛选，或直接搜名字。":
      "A poet's whole hand, gathered in one place. Filter by dynasty, or search a name.",
    "搜索作者，如 李白、苏轼…": "Search a poet — 李白, 苏轼…",
    "共 {n} 位": "{n} poets",
    "（显示前 600，可搜索缩小范围）": " (first 600 shown — search to narrow)",
    "‹ 作者索引": "‹ All poets",
    "共收录 <b>{n}</b> 篇": "<b>{n}</b> works collected",
    "多作": "mostly",
    "常写主题": "Recurring themes",
    "作品": "Works",
    "没有 {name} 的作品": "No works by {name}",

    /* ---- 体裁 / 主题 ---- */
    "选一项，看归入其下的作品。": "Pick one to see the works filed under it.",
    "更多主题（共 {n} 个）": "More themes ({n} in all)",
    "从《诗经》的四言，到楚辞、乐府、古体诗，再到唐人格律严整的近体诗，乃至宋词元曲——诗体的演进，就是一部文言文的呼吸史。体裁由每首作品的句式自动归类。":
      "From the four-character lines of the Book of Songs through Chu ci, yuefu and old-style verse, to the strict regulated forms of the Tang and the song lyrics of the Song and Yuan. Form is assigned automatically from each poem's line structure.",
    "按主题浏览——爱情、田园、送别、忧国……看古人如何在同一母题下各抒其怀。":
      "Browse by theme — love, the countryside, parting, grief for the state. Theme labels stay in Chinese.",
    "主题词由模型逐篇标注，尚无统一词表，长尾较杂。":
      "Themes are labelled per poem by a model, with no controlled vocabulary yet — the long tail is messy.",

    /* ---- 字词 ---- */
    "古人炼字，一字千金。这里可循一个字走进无数诗篇——看\"月\"如何照过千年，\"风\"如何吹遍江山。":
      "One character at a time. Follow a single graph through the corpus — how 月 (moon) has shone for a thousand years, where 风 (wind) blows.",
    "已为最常见的 {a} 个字建立索引（全库共 {b} 个不同字）；每字最多列 {c} 例，且跨朝代抽样，不是只取最早的几篇。":
      "The {a} most common characters are indexed (the corpus has {b} distinct ones). At most {c} examples per character, sampled across dynasties rather than taken from the earliest works.",
    "输入一个字，如 月、风、江…": "Enter one character — 月, 风, 江…",
    "点一个字，看它在诗篇中的身影。": "Pick a character to see it at work.",
    "\"{c}\" 不在索引内——它在全库中出现得较少。":
      "\"{c}\" is not indexed — it is uncommon in the corpus.",
    "\"<b>{c}</b>\" 现身于 <b>{n}</b> 篇": "\"<b>{c}</b>\" appears in <b>{n}</b> works",
    "，以下列出其中 {n} 例（跨朝代抽样）": ", showing {n} of them (sampled across dynasties)",

    /* ---- 时间轴 ---- */
    "沿着时间之河，看文言文从《诗经》的四言到唐诗的格律、宋词的长短句，如何一路演变。":
      "Down the river of time: four-character verse, Tang regulation, Song long-and-short lines.",
    "浅色的朝代尚未逐篇断代，只能按朝代整体定位。":
      "Dimmed dynasties have not been dated poem by poem — they are placed by dynasty as a whole.",
    "尚未逐篇断代": "not yet dated per poem",
    "虚线的朝代按作者生卒估算 —— 画的是诗人活在什么时候，不是这首诗写于哪一年。":
      "Dashed dynasties are placed by the poet's dates \u2014 the shape shows when the poets lived, not when each poem was written.",
    "按作者生卒估算": "placed by the poet's dates",
    "{d} 年代 · {n} 篇": "{d}s · {n} works",
    "{n} 篇": "{n} works",

    /* ---- 地图 ---- */
    "每一首诗都诞生在具体的山川之间。点击标记，看看哪些名篇写于同一片土地。":
      "Every poem was written somewhere. Click a marker to see what was written on the same ground.",
    "地图组件需要联网加载（Leaflet / OpenStreetMap）。":
      "The map needs a network connection (Leaflet / OpenStreetMap).",
    "连上网络后刷新页面即可查看诗文的地理分布。":
      "Reload once you are online to see the geography.",
    "其余功能均可离线使用。": "Everything else works offline.",
    "标记内数字为该地留存的诗文篇数；共 {n} 篇有据可考。":
      "The number in each marker is how many works survive from that place; {n} works are locatable.",
    "全览": "All time",
    "不分时间，{n} 篇": "All periods — {n} works",
    "{a} – {b} 年": "{a} – {b}",
    "前{n}": "{n} BCE",
    "此档无诗": "nothing in this window",
    "此档 {n} 篇": "{n} works in this window",
    "另有 {n} 篇只知朝代、不知确年，按年筛选时不计入。":
      "A further {n} works are known only by dynasty, not by year; they are left out when filtering by time.",
    "拖动滑块，每档五十年": "Drag the slider — fifty years per step",

    /* ---- 检索 ---- */
    "\"<b>{q}</b>\" 命中 <b>{n}</b> 条": "<b>{n}</b> matches for \"<b>{q}</b>\"",
    "检索范围为标题与作者；正文暂未建索引。":
      "Search covers titles and poets only; the poem texts are not indexed yet.",
    "标题、作者与正文都在检索范围内，按相关度排序。":
      "Titles, poets and poem texts are all searched, ranked by relevance.",
    "没有匹配的标题或作者。": "No matching title or poet.",
    "没有匹配的作品。": "Nothing matched.",
    "仅显示前 300 条": "First 300 shown",

    /* ---- 与此篇相近 ---- */
    "与此篇相近": "Close to this one",
    "同篇异录": "The same work, filed twice",
    "同一首作品在本库中的另一处著录，题名或归属或有出入。":
      "Another record of the same work in this collection; the title or attribution may differ.",
    "相近度": "closeness",

    /* ---- 详情浮层 ---- */
    "译　文": "Translation",
    "注　释": "Notes",
    "赏　析": "Commentary",
    "— 待补充 —": "— not yet written —",
    "隐藏拼音": "Hide pinyin",
    "显示拼音": "Show pinyin",
    "✦ 译文 / 注释 / 赏析 / 英译 由 AI（{by}）生成，待校订":
      "✦ Translation, notes, commentary and English rendering generated by AI ({by}); not yet checked",
    "没能取到这首作品。": "Could not load this work.",
    "未找到 {id}": "Not found: {id}",
    "已含赏析": "has commentary",
    "推荐一幅画": "Suggest a painting",
    "为这一篇推荐一幅画（会开一个 GitHub issue）":
      "Suggest a painting for this work (opens a GitHub issue)"
  };

  /* 朝代既是内容也是导航 —— 诗文库、作者页的筛选全靠它，所以给转写。
     用威妥玛式还是拼音？拼音，跟站上其它注音一致。 */
  var DYN = {
    "先秦": "Pre-Qin", "汉": "Han", "魏晋": "Wei–Jin", "南北朝": "Northern & Southern",
    "隋": "Sui", "唐": "Tang", "五代": "Five Dynasties", "宋": "Song",
    "元": "Yuan", "明": "Ming", "清": "Qing", "北宋": "Northern Song", "南宋": "Southern Song"
  };

  function fill(s, vars) {
    if (!vars) return s;
    return s.replace(/\{(\w+)\}/g, function (m, k) {
      return vars[k] == null ? m : vars[k];
    });
  }

  function T(zh, vars) {
    var s = (LANG === "en" && EN[zh]) ? EN[zh] : zh;
    return fill(s, vars);
  }

  T.lang = function () { return LANG; };
  T.isEn = function () { return LANG === "en"; };
  T.set = function (l) {
    LANG = (l === "en") ? "en" : "zh";
    try {
      if (LANG === "zh") localStorage.removeItem("lang");
      else localStorage.setItem("lang", "en");
    } catch (e) {}
    document.documentElement.setAttribute("lang", LANG === "en" ? "en" : "zh-Hans");
  };
  /* 朝代名。英文界面下给转写，中文界面下原样返回。 */
  T.dyn = function (name) {
    return (LANG === "en" && DYN[name]) ? DYN[name] : name;
  };
  /* 年份 -> 可读的年代。公元前在中文里是"前340"，英文里是"340 BCE"。 */
  T.year = function (y) {
    if (y == null) return "";
    if (y < 0) return LANG === "en" ? (-y) + " BCE" : "前" + (-y);
    return LANG === "en" ? String(y) : y + "";
  };

  return T;
})();
