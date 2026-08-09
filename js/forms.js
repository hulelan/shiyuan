/* 诗渊 — 体裁自动归类（app.js 与 admin.html 共用，勿各自复制一份）*/
(function () {
  "use strict";

  // 依句式（每句字数、句数）把每首作品归入诗体谱系；词/曲/文按 genre。
  function classifyForm(p) {
    if (p.genre === "词") return { group: "词", sub: "词", label: "词" };
    if (p.genre === "曲") return { group: "曲", sub: "曲", label: "曲" };
    if (p.genre === "文") return { group: "文", sub: "散文·语录", label: "文" };
    if (p.genre === "赋") return { group: "赋", sub: "赋", label: "赋" };
    var f = p.form || "";
    if (f.indexOf("诗经") >= 0) return { group: "四言·诗经", sub: "诗经", label: "诗经" };
    if (f.indexOf("楚辞") >= 0 || f.indexOf("骚") >= 0) return { group: "骚体·楚辞", sub: "楚辞", label: "楚辞" };
    // 按标点切成句，仅数汉字
    var clauses = p.text.split(/[，。！？、；：\n]/).map(function (s) {
      return (s.match(/[一-鿿]/g) || []).length;
    }).filter(function (n) { return n > 0; });
    var n = clauses.length;
    var L = clauses[0] || 0;
    var uniform = clauses.every(function (l) { return l === L; });
    if (uniform && L === 5 && n === 4) return { group: "近体诗", sub: "五言绝句", label: "五绝" };
    if (uniform && L === 7 && n === 4) return { group: "近体诗", sub: "七言绝句", label: "七绝" };
    if (uniform && L === 5 && n === 8) return { group: "近体诗", sub: "五言律诗", label: "五律" };
    if (uniform && L === 7 && n === 8) return { group: "近体诗", sub: "七言律诗", label: "七律" };
    if (uniform && L === 5 && n > 8)  return { group: "古体诗", sub: "五言古诗", label: "五古" };
    if (uniform && L === 7 && n > 8)  return { group: "古体诗", sub: "七言古诗", label: "七古" };
    if (uniform && L === 4)           return { group: "古体诗", sub: "四言", label: "四言" };
    if (uniform && L === 5)           return { group: "古体诗", sub: "五言古诗", label: "五古" };
    if (uniform && L === 7)           return { group: "古体诗", sub: "七言古诗", label: "七古" };
    return { group: "古体诗", sub: "杂言 / 乐府", label: "古体" };
  }

  window.classifyForm = classifyForm;
  // 体裁谱系（决定"体裁"视图的排序与分组）
  window.FORM_GROUPS = ["四言·诗经", "骚体·楚辞", "古体诗", "近体诗", "词", "曲", "文", "赋"];
})();
