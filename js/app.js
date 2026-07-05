/* 诗渊 — 应用逻辑 */
(function () {
  "use strict";

  // 精编集（poems.js）在前，导入集（corpus.js）在后合并
  var POEMS = (window.POEMS || []).concat(window.POEMS_IMPORTED || []);
  var DYNASTIES = window.DYNASTIES || [];
  var byId = {};
  POEMS.forEach(function (p) { byId[p.id] = p; });

  // ---------- helpers ----------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function firstLine(text) { return text.split("\n")[0]; }
  function allThemes() {
    var set = {};
    POEMS.forEach(function (p) { (p.themes || []).forEach(function (t) { set[t] = (set[t] || 0) + 1; }); });
    return Object.keys(set).sort(function (a, b) { return set[b] - set[a]; })
      .map(function (t) { return { name: t, count: set[t] }; });
  }
  var HAN = /[一-鿿]/;

  // ---------- 体裁自动归类 ----------
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
  // 体裁谱系（用于"体裁"视图的排序与分组）
  var FORM_GROUPS = ["四言·诗经", "骚体·楚辞", "古体诗", "近体诗", "词", "曲", "文", "赋"];
  POEMS.forEach(function (p) { p._form = classifyForm(p); });

  function formTree() {
    var tree = {};
    POEMS.forEach(function (p) {
      var g = p._form.group, s = p._form.sub;
      (tree[g] = tree[g] || {})[s] = ((tree[g] || {})[s] || 0) + 1;
    });
    return tree;
  }

  // ---------- 作者统计 ----------
  function topAuthors(n) {
    var c = {};
    POEMS.forEach(function (p) { if (p.author && p.author !== "佚名") c[p.author] = (c[p.author] || 0) + 1; });
    return Object.keys(c).sort(function (a, b) { return c[b] - c[a]; })
      .slice(0, n).map(function (a) { return { name: a, count: c[a] }; });
  }

  // ---------- 字词索引（懒构建）----------
  var _charIdx = null;
  function charIndex() {
    if (_charIdx) return _charIdx;
    var freq = {}, poemsWith = {};
    POEMS.forEach(function (p) {
      var seen = {};
      for (var i = 0; i < p.text.length; i++) {
        var ch = p.text[i];
        if (!HAN.test(ch)) continue;
        freq[ch] = (freq[ch] || 0) + 1;
        if (!seen[ch]) { (poemsWith[ch] = poemsWith[ch] || []).push(p); seen[ch] = 1; }
      }
    });
    _charIdx = { freq: freq, poemsWith: poemsWith };
    return _charIdx;
  }

  // ---------- state ----------
  var state = { view: "home", dynasty: null, theme: null, formSub: null, query: "" };

  // ---------- card ----------
  function poemCard(p) {
    var c = el("div", "card");
    var badge = p.appreciation ? '<span class="card-badge" title="已含赏析">赏</span>' : "";
    var authorCls = (p.author && p.author !== "佚名") ? "author author-link" : "author";
    c.innerHTML = badge +
      '<span class="dyn">' + p.dynasty + ' · ' + p._form.label + '</span>' +
      '<h3>' + p.title + '</h3>' +
      '<span class="' + authorCls + '">' + p.author + '</span>' +
      '<div class="excerpt">' + firstLine(p.text) + '</div>' +
      '<div class="tags">' + (p.themes || []).map(function (t) {
        return '<span class="tag">' + t + '</span>';
      }).join("") + '</div>';
    c.addEventListener("click", function () { openDetail(p.id); });
    var al = c.querySelector(".author-link");
    if (al) al.addEventListener("click", function (e) { e.stopPropagation(); goAuthor(p.author); });
    return c;
  }

  function matchesQuery(p, q) {
    if (!q) return true;
    q = q.toLowerCase();
    return [p.title, p.author, p.dynasty, p.text, p.translation, (p.themes || []).join(" ")]
      .join(" ").toLowerCase().indexOf(q) !== -1;
  }

  // ---------- library view ----------
  function renderFilters() {
    var box = $("#filters");
    box.innerHTML = "";
    var all = el("button", "chip" + (state.dynasty ? "" : " active"), "全部");
    all.addEventListener("click", function () { state.dynasty = null; renderLibrary(); });
    box.appendChild(all);
    DYNASTIES.forEach(function (d) {
      if (!POEMS.some(function (p) { return p.dynasty === d.key; })) return;
      var b = el("button", "chip" + (state.dynasty === d.key ? " active" : ""), d.key);
      b.addEventListener("click", function () {
        state.dynasty = state.dynasty === d.key ? null : d.key; renderLibrary();
      });
      box.appendChild(b);
    });
  }

  var PAGE = 120;
  // 分页渲染：先出 PAGE 张，多余的用"显示更多"按需追加，避免一次塞入数千 DOM
  function renderPaged(grid, list, countEl) {
    grid.innerHTML = "";
    // 清掉上一次渲染残留的"显示更多"按钮
    var stale = grid.parentNode.querySelectorAll(".more-btn");
    for (var s = 0; s < stale.length; s++) stale[s].remove();
    var shown = 0;
    var moreBtn = null;
    function step() {
      var end = Math.min(shown + PAGE, list.length);
      for (var i = shown; i < end; i++) grid.appendChild(poemCard(list[i]));
      shown = end;
      if (moreBtn) moreBtn.remove();
      if (shown < list.length) {
        moreBtn = el("button", "more-btn", "显示更多（还有 " + (list.length - shown) + " 篇）");
        moreBtn.addEventListener("click", step);
        grid.parentNode.insertBefore(moreBtn, grid.nextSibling);
      }
    }
    step();
    if (countEl) countEl.textContent = "共 " + list.length + " 篇";
  }

  function renderLibrary() {
    renderFilters();
    var list = POEMS.filter(function (p) {
      return (!state.dynasty || p.dynasty === state.dynasty) && matchesQuery(p, state.query);
    }).sort(function (a, b) { return a.dynastyOrder - b.dynastyOrder || a.year - b.year; });
    renderPaged($("#poemGrid"), list, $("#libCount"));
  }

  // ---------- theme view ----------
  function renderTheme() {
    var cloud = $("#themeCloud");
    cloud.innerHTML = "";
    var themes = allThemes();
    var allBtn = el("button", "chip big" + (state.theme ? "" : " active"), "全部主题");
    allBtn.addEventListener("click", function () { state.theme = null; renderTheme(); });
    cloud.appendChild(allBtn);
    themes.forEach(function (t) {
      var b = el("button", "chip big" + (state.theme === t.name ? " active" : ""),
        t.name + ' <small>' + t.count + '</small>');
      b.addEventListener("click", function () {
        state.theme = state.theme === t.name ? null : t.name; renderTheme();
      });
      cloud.appendChild(b);
    });
    var list = POEMS.filter(function (p) {
      return (!state.theme || (p.themes || []).indexOf(state.theme) !== -1) && matchesQuery(p, state.query);
    }).sort(function (a, b) { return a.dynastyOrder - b.dynastyOrder; });
    renderPaged($("#themeGrid"), list, null);
  }

  // ---------- timeline view ----------
  function renderTimeline() {
    var tl = $("#timeline");
    tl.innerHTML = "";
    var groups = {};
    POEMS.filter(function (p) { return matchesQuery(p, state.query); })
      .forEach(function (p) { (groups[p.dynasty] = groups[p.dynasty] || []).push(p); });
    DYNASTIES.forEach(function (d) {
      var items = groups[d.key];
      if (!items) return;
      items.sort(function (a, b) { return a.year - b.year; });
      var band = el("div", "era-band");
      band.appendChild(el("div", "era-label", d.key + '<span class="era-span">' + d.span + '</span>'));
      items.forEach(function (p) {
        var it = el("div", "tl-item");
        it.innerHTML =
          '<div class="tl-year">' + p.yearLabel + '</div>' +
          '<div class="tl-title">' + p.title + ' <small>· ' + p.author + '</small></div>' +
          '<div class="tl-form">' + [p.form, (p.place && p.place.name)].filter(Boolean).join(' ｜ ') + '</div>';
        it.addEventListener("click", function () { openDetail(p.id); });
        band.appendChild(it);
      });
      tl.appendChild(band);
    });
  }

  // ---------- map view ----------
  var map = null, mapReady = false;
  function renderMap() {
    var note = $("#mapNote");
    if (typeof L === "undefined") {
      $("#mapCanvas").innerHTML =
        '<div class="map-fallback">地图组件需要联网加载（Leaflet / OpenStreetMap）。<br>' +
        '连上网络后刷新页面即可查看诗文的地理分布。<br>其余功能均可离线使用。</div>';
      note.textContent = "";
      return;
    }
    if (mapReady) { setTimeout(function () { map.invalidateSize(); }, 60); return; }
    mapReady = true;
    map = L.map("mapCanvas", { scrollWheelZoom: true, attributionControl: true })
      .setView([33.5, 112.5], 4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 10, attribution: "© OpenStreetMap"
    }).addTo(map);

    // 按地点聚合（仅含有坐标的作品）
    var spots = {};
    POEMS.forEach(function (p) {
      if (!p.place || typeof p.place.lat !== "number" || typeof p.place.lng !== "number") return;
      var k = p.place.lat + "," + p.place.lng;
      (spots[k] = spots[k] || { place: p.place, poems: [] }).poems.push(p);
    });
    Object.keys(spots).forEach(function (k) {
      var s = spots[k];
      var icon = L.divIcon({
        className: "",
        html: '<div style="background:#a8322d;color:#fff;border-radius:50%;width:26px;height:26px;' +
              'display:flex;align-items:center;justify-content:center;font-family:serif;font-size:13px;' +
              'border:2px solid #f4efe4;box-shadow:0 1px 4px rgba(0,0,0,.4)">' + s.poems.length + '</div>',
        iconSize: [26, 26], iconAnchor: [13, 13]
      });
      var html = '<div class="map-popup"><h4>' + s.place.name + '</h4>' +
        '<div class="mp-meta">' + s.place.modern + '</div><div style="margin-top:6px">' +
        s.poems.map(function (p) {
          return '<div><span class="mp-open" data-id="' + p.id + '">《' + p.title + '》· ' + p.author + '</span></div>';
        }).join("") + '</div></div>';
      var marker = L.marker([s.place.lat, s.place.lng], { icon: icon }).addTo(map).bindPopup(html);
      marker.on("popupopen", function () {
        document.querySelectorAll(".mp-open").forEach(function (n) {
          n.onclick = function () { openDetail(n.getAttribute("data-id")); };
        });
      });
    });
    note.textContent = "标记内数字为该地留存的诗文篇数；点击可展开。";
  }

  // ---------- 跨视图跳转 ----------
  function goDynasty(k) { state.dynasty = k; state.query = ""; $("#search").value = ""; switchView("library"); }
  function goForm(sub) { state.formSub = sub; state.query = ""; $("#search").value = ""; switchView("type"); }
  function goTheme(t) { state.theme = t; state.query = ""; $("#search").value = ""; switchView("theme"); }
  function goWord(ch) { switchView("word"); $("#wordInput").value = ch; showWord(ch); }
  function goAuthor(name) {
    if (!name || name === "佚名") return;
    state.author = name; switchView("author");
  }

  // ---------- 作者专页 ----------
  function renderAuthor() {
    var name = state.author;
    var works = POEMS.filter(function (p) { return p.author === name; });
    var host = $("#view-author");
    if (!works.length) { switchView("home"); return; }
    works.sort(function (a, b) { return a.dynastyOrder - b.dynastyOrder || a.year - b.year; });

    var dyns = []; works.forEach(function (w) { if (dyns.indexOf(w.dynasty) < 0) dyns.push(w.dynasty); });
    var forms = {}; works.forEach(function (w) { forms[w._form.sub] = (forms[w._form.sub] || 0) + 1; });
    var topForms = Object.keys(forms).sort(function (a, b) { return forms[b] - forms[a]; }).slice(0, 4);
    var themes = {}; works.forEach(function (w) { (w.themes || []).forEach(function (t) { themes[t] = (themes[t] || 0) + 1; }); });
    var topThemes = Object.keys(themes).sort(function (a, b) { return themes[b] - themes[a]; }).slice(0, 8);
    var places = []; works.forEach(function (w) { if (w.place && w.place.name && places.indexOf(w.place.name) < 0) places.push(w.place.name); });

    var lines = [];
    lines.push('<span class="ap-dyn">' + dyns.join(" · ") + '</span>');
    lines.push("共收录 <b>" + works.length + "</b> 篇 / 条");
    if (topForms.length) lines.push("多作 " + topForms.map(function (f) { return "<em>" + f + "</em>"; }).join("、"));
    var meta = lines.join(" ｜ ");

    var themeHtml = topThemes.length
      ? '<div class="ap-block"><h4>常写主题</h4><div class="ap-chips">' + topThemes.map(function (t) {
          return '<button class="mini-chip" data-theme="' + t + '">' + t + '<i>' + themes[t] + '</i></button>';
        }).join("") + '</div></div>'
      : "";
    var placeHtml = places.length
      ? '<div class="ap-block"><h4>足迹（' + places.length + ' 地）</h4><div class="ap-chips">' +
          places.slice(0, 20).map(function (pl) { return '<span class="ap-place" data-place="' + pl + '">' + pl + '</span>'; }).join("") +
          '</div></div>'
      : "";

    host.innerHTML =
      '<button class="back-link" id="authorBack">‹ 返回</button>' +
      '<div class="author-head">' +
        '<div class="author-seal">' + name.slice(0, 1) + '</div>' +
        '<h1 class="author-name">' + name + '</h1>' +
        '<div class="author-meta">' + meta + '</div>' +
      '</div>' +
      themeHtml + placeHtml +
      '<h4 class="ap-works-h">作品</h4>' +
      '<div class="grid" id="authorGrid"></div>' +
      '<p class="count" id="authorCount"></p>';

    renderPaged($("#authorGrid"), works, $("#authorCount"));
    $("#authorBack").addEventListener("click", function () { history.length > 1 ? window.history.back() : switchView("home"); });
    host.querySelectorAll("[data-theme]").forEach(function (b) {
      b.addEventListener("click", function () { goTheme(b.getAttribute("data-theme")); });
    });
    host.querySelectorAll("[data-place]").forEach(function (b) {
      b.addEventListener("click", function () { switchView("map"); });
    });
  }

  // ---------- 首页 ----------
  function poemOfDay() {
    var pool = (window.POEMS && window.POEMS.length) ? window.POEMS : POEMS;
    var day = Math.floor((new Date()).getTime() / 86400000);
    return pool[day % pool.length];
  }
  function renderHome() {
    var host = $("#view-home");
    var nAuthors = new Set(POEMS.filter(function (p) { return p.author && p.author !== "佚名"; })
      .map(function (p) { return p.author; })).size;
    var genres = {}; POEMS.forEach(function (p) { genres[p.genre] = (genres[p.genre] || 0) + 1; });
    var dyns = DYNASTIES.filter(function (d) { return POEMS.some(function (p) { return p.dynasty === d.key; }); });
    var dynCount = {}; POEMS.forEach(function (p) { dynCount[p.dynasty] = (dynCount[p.dynasty] || 0) + 1; });
    var pod = poemOfDay();
    var podLines = pod.text.split("\n");

    var tree = formTree();
    var formChips = "";
    FORM_GROUPS.forEach(function (g) {
      if (!tree[g]) return;
      Object.keys(tree[g]).sort(function (a, b) { return tree[g][b] - tree[g][a]; }).forEach(function (s) {
        formChips += '<button class="mini-chip" data-form="' + s + '">' + s +
          '<i>' + tree[g][s] + '</i></button>';
      });
    });

    var themes = allThemes().slice(0, 14);
    var themeChips = themes.length ? themes.map(function (t) {
      return '<button class="mini-chip" data-theme="' + t.name + '">' + t.name + '<i>' + t.count + '</i></button>';
    }).join("") : '<span class="dim">主题将随内容生成逐步丰富…</span>';

    var ci = charIndex();
    var topChars = Object.keys(ci.poemsWith)
      .sort(function (a, b) { return ci.poemsWith[b].length - ci.poemsWith[a].length; }).slice(0, 30);
    var charChips = topChars.map(function (c) {
      return '<button class="ch" data-char="' + c + '">' + c + '</button>';
    }).join("");

    var authors = topAuthors(16);
    var authorChips = authors.map(function (a) {
      return '<button class="mini-chip" data-author="' + a.name + '">' + a.name + '<i>' + a.count + '</i></button>';
    }).join("");

    var featured = (window.POEMS || []).slice(0, 8);

    host.innerHTML =
      '<div class="hero">' +
        '<div class="hero-seal">詩淵</div>' +
        '<div class="hero-verse" id="heroVerse">' +
          podLines.map(function (l) { return '<span>' + l + '</span>'; }).join("") +
        '</div>' +
        '<div class="hero-attr">——' + pod.dynasty + '·' + pod.author + '《' + pod.title + '》</div>' +
        '<div class="hero-tag">古诗古文的溯源之地 · 原文 · 拼音 · 译文 · 注释 · 赏析 · 英译</div>' +
      '</div>' +

      '<div class="stat-ribbon">' +
        '<div><b>' + POEMS.length + '</b><span>篇 / 条</span></div>' +
        '<div><b>' + nAuthors + '</b><span>位作者</span></div>' +
        '<div><b>' + dyns.length + '</b><span>个朝代</span></div>' +
        '<div><b>' + Object.keys(genres).length + '</b><span>类体裁</span></div>' +
        '<div class="genre-mini">' + Object.keys(genres).sort(function (a, b) { return genres[b] - genres[a]; })
          .map(function (g) { return g + ' ' + genres[g]; }).join(' · ') + '</div>' +
      '</div>' +

      '<section class="home-sec"><h2>循 朝 代</h2><div class="dyn-strip">' +
        dyns.map(function (d) {
          return '<button class="dyn-block" data-dyn="' + d.key + '">' +
            '<b>' + d.key + '</b><em>' + d.span + '</em><i>' + (dynCount[d.key] || 0) + ' 篇</i></button>';
        }).join("") +
      '</div></section>' +

      '<section class="home-sec"><h2>循 体 裁</h2><div class="chip-flow">' + formChips + '</div></section>' +

      '<section class="home-sec"><h2>循 主 题</h2><div class="chip-flow">' + themeChips + '</div></section>' +

      '<section class="home-sec"><h2>字 里 行 间</h2>' +
        '<p class="sec-sub">循一字，读万篇。点击进入"字词"视图。</p>' +
        '<div class="char-row">' + charChips + '</div></section>' +

      (authorChips ? '<section class="home-sec"><h2>名 家</h2><div class="chip-flow">' + authorChips + '</div></section>' : "") +

      '<section class="home-sec"><h2>名 篇 精 选</h2><div class="grid" id="homeFeatured"></div></section>';

    // 名篇卡片
    var fg = $("#homeFeatured");
    featured.forEach(function (p) { fg.appendChild(poemCard(p)); });

    // 事件绑定
    host.querySelector(".hero-verse").addEventListener("click", function () { openDetail(pod.id); });
    host.querySelectorAll("[data-dyn]").forEach(function (b) {
      b.addEventListener("click", function () { goDynasty(b.getAttribute("data-dyn")); });
    });
    host.querySelectorAll("[data-form]").forEach(function (b) {
      b.addEventListener("click", function () { goForm(b.getAttribute("data-form")); });
    });
    host.querySelectorAll("[data-theme]").forEach(function (b) {
      b.addEventListener("click", function () { goTheme(b.getAttribute("data-theme")); });
    });
    host.querySelectorAll("[data-char]").forEach(function (b) {
      b.addEventListener("click", function () { goWord(b.getAttribute("data-char")); });
    });
    host.querySelectorAll("[data-author]").forEach(function (b) {
      b.addEventListener("click", function () { goAuthor(b.getAttribute("data-author")); });
    });
  }

  // ---------- 体裁视图 ----------
  function renderType() {
    var nav = $("#typeNav");
    nav.innerHTML = "";
    var tree = formTree();
    var allBtn = el("button", "chip" + (state.formSub ? "" : " active"), "全部体裁");
    allBtn.addEventListener("click", function () { state.formSub = null; renderType(); });
    nav.appendChild(allBtn);
    FORM_GROUPS.forEach(function (g) {
      if (!tree[g]) return;
      var grp = el("div", "type-group");
      grp.appendChild(el("span", "type-group-label", g));
      Object.keys(tree[g]).sort(function (a, b) { return tree[g][b] - tree[g][a]; }).forEach(function (s) {
        var b = el("button", "chip" + (state.formSub === s ? " active" : ""), s + ' <i>' + tree[g][s] + '</i>');
        b.addEventListener("click", function () {
          state.formSub = state.formSub === s ? null : s; renderType();
        });
        grp.appendChild(b);
      });
      nav.appendChild(grp);
    });
    var list = POEMS.filter(function (p) {
      return (!state.formSub || p._form.sub === state.formSub) && matchesQuery(p, state.query);
    }).sort(function (a, b) { return a.dynastyOrder - b.dynastyOrder || a.year - b.year; });
    renderPaged($("#typeGrid"), list, $("#typeCount"));
  }

  // ---------- 字词视图 ----------
  function renderWord() {
    var cloud = $("#charCloud");
    cloud.innerHTML = "";
    var ci = charIndex();
    var chars = Object.keys(ci.poemsWith)
      .sort(function (a, b) { return ci.poemsWith[b].length - ci.poemsWith[a].length; }).slice(0, 80);
    var max = ci.poemsWith[chars[0]].length, min = ci.poemsWith[chars[chars.length - 1]].length;
    chars.forEach(function (c) {
      var n = ci.poemsWith[c].length;
      var sz = 15 + Math.round(26 * (n - min) / Math.max(1, max - min));
      var b = el("button", "cloud-char", c);
      b.style.fontSize = sz + "px";
      b.title = n + " 篇含此字";
      b.addEventListener("click", function () { $("#wordInput").value = c; showWord(c); });
      cloud.appendChild(b);
    });
    if (state.wordTerm) showWord(state.wordTerm);
  }
  function highlightLine(text, term) {
    var lines = text.split("\n");
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf(term) !== -1) {
        return lines[i].split(term).join('<mark>' + term + '</mark>');
      }
    }
    return firstLine(text);
  }
  function showWord(term) {
    term = (term || "").trim();
    state.wordTerm = term;
    var box = $("#wordResult");
    if (!term) { box.innerHTML = '<p class="dim" style="text-align:center">输入或点选一个字，看它在诗篇中的身影。</p>'; return; }
    var hits = POEMS.filter(function (p) { return p.text.indexOf(term) !== -1; });
    hits.sort(function (a, b) { return a.dynastyOrder - b.dynastyOrder || a.year - b.year; });
    var head = '<p class="word-count">"<b>' + term + '</b>" 现身于 <b>' + hits.length + '</b> 篇 —</p>';
    box.innerHTML = head + '<div class="word-list" id="wordList"></div>';
    var list = $("#wordList");
    hits.slice(0, 200).forEach(function (p) {
      var row = el("div", "word-row");
      row.innerHTML = '<div class="wr-line">' + highlightLine(p.text, term) + '</div>' +
        '<div class="wr-meta">' + p.dynasty + '·' + p.author + '《' + p.title + '》 <span>' + p._form.label + '</span></div>';
      row.addEventListener("click", function () { openDetail(p.id); });
      list.appendChild(row);
    });
    if (hits.length > 200) list.appendChild(el("p", "dim", "仅显示前 200 篇，可用更具体的词缩小范围。"));
  }

  // ---------- detail overlay ----------
  function section(title, bodyHtml, enClass) {
    return '<div class="pd-sec">' +
      '<div class="pd-sec-head"><h4>' + title + '</h4><span class="arrow">▸</span></div>' +
      '<div class="pd-sec-body' + (enClass ? " en" : "") + '">' + bodyHtml + '</div></div>';
  }

  function openDetail(id) {
    var p = byId[id];
    if (!p) return;
    var lines = p.text.split("\n");
    var pys = p.pinyin ? p.pinyin.split("\n") : [];
    var hasPinyin = pys.length === lines.length;

    var poemHtml = lines.map(function (ln, i) {
      return '<div class="pd-line">' +
        '<span class="py">' + (hasPinyin ? pys[i] : "") + '</span>' +
        '<span class="zh">' + ln + '</span></div>';
    }).join("");

    // 各层内容按需渲染；缺失的层显示"待补"占位，不再假定一定存在
    var todo = '<span style="color:var(--gold)">— 待补充 —</span>';
    var secHtml = "";
    secHtml += section("译　文", p.translation || todo);
    if (p.notes && p.notes.length) {
      secHtml += section("注　释", '<ul class="notes-list">' + p.notes.map(function (n) {
        return '<li><span class="term">' + n.term + '</span>' + n.explain + '</li>';
      }).join("") + '</ul>');
    } else {
      secHtml += section("注　释", todo);
    }
    secHtml += section("赏　析", p.appreciation || todo);
    secHtml += section("English", (p.english
      ? p.english.replace(/\n/g, "<br>") +
        (p.englishBy ? '<div style="font-style:normal;font-size:12px;color:var(--gold);margin-top:8px">— ' + p.englishBy + '</div>' : "")
      : todo), true);

    var seals = '<span class="seal">' + p.dynasty + '</span>' +
      (p.form ? '<span class="seal" style="background:var(--jade)">' + p.form + '</span>' : "");
    var placeHtml = (p.place && p.place.name)
      ? '<div class="pd-place">✎ ' + p.place.name + (p.place.modern ? '（' + p.place.modern + '）' : "") + '</div>'
      : "";

    var authorHtml = (p.author && p.author !== "佚名")
      ? '<span class="pd-author-link" id="pdAuthor">' + p.author + '</span>' : p.author;
    var d = $("#poemDetail");
    d.innerHTML =
      '<button class="close-btn" id="closeDetail">×</button>' +
      '<div class="pd-head"><h2>' + p.title + '</h2>' +
      '<div class="pd-meta">' + authorHtml + seals + '</div>' +
      (p.yearLabel ? '<div class="pd-meta" style="margin-top:4px">' + p.yearLabel + '</div>' : "") +
      placeHtml + '</div>' +
      '<div class="pd-poem' + (hasPinyin ? "" : " no-pinyin") + (p.genre === "文" ? " prose" : "") + '" id="pdPoem">' + poemHtml + '</div>' +
      (hasPinyin ? '<button class="pinyin-toggle" id="pyToggle">隐藏拼音</button>' : "") +
      (p.enrichedBy ? '<div class="ai-note">✦ 译文 / 注释 / 赏析 / 英译 由 AI（' + p.enrichedBy + '）生成，待校订</div>' : "") +
      '<div class="pd-sections">' + secHtml + '</div>';

    // 默认展开译文
    var secs = d.querySelectorAll(".pd-sec");
    if (secs[0]) secs[0].classList.add("open");
    d.querySelectorAll(".pd-sec-head").forEach(function (h) {
      h.addEventListener("click", function () { h.parentNode.classList.toggle("open"); });
    });
    $("#closeDetail").addEventListener("click", closeDetail);
    var pdA = $("#pdAuthor");
    if (pdA) pdA.addEventListener("click", function () { closeDetail(); goAuthor(p.author); });
    if (hasPinyin) {
      $("#pyToggle").addEventListener("click", function () {
        var poem = $("#pdPoem");
        var hidden = poem.classList.toggle("no-pinyin");
        this.textContent = hidden ? "显示拼音" : "隐藏拼音";
      });
    }
    $("#overlay").classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }
  function closeDetail() {
    $("#overlay").classList.add("hidden");
    document.body.style.overflow = "";
  }

  // ---------- view switching ----------
  function switchView(v) {
    state.view = v;
    document.querySelectorAll("#viewTabs button").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-view") === v);
    });
    document.querySelectorAll(".view").forEach(function (s) { s.classList.add("hidden"); });
    $("#view-" + v).classList.remove("hidden");
    window.scrollTo(0, 0);
    if (v === "home") renderHome();
    else if (v === "library") renderLibrary();
    else if (v === "type") renderType();
    else if (v === "theme") renderTheme();
    else if (v === "word") renderWord();
    else if (v === "timeline") renderTimeline();
    else if (v === "map") renderMap();
    else if (v === "author") renderAuthor();
  }

  function rerenderCurrent() {
    if (state.view === "library") renderLibrary();
    else if (state.view === "type") renderType();
    else if (state.view === "theme") renderTheme();
    else if (state.view === "timeline") renderTimeline();
    else if (state.view === "word") showWord(state.query || state.wordTerm);
  }

  // ---------- init ----------
  function init() {
    document.querySelectorAll("#viewTabs button").forEach(function (b) {
      b.addEventListener("click", function () { switchView(b.getAttribute("data-view")); });
    });
    var brand = document.querySelector(".brand[data-view]");
    if (brand) brand.addEventListener("click", function () { switchView("home"); });
    $("#search").addEventListener("input", function () {
      state.query = this.value.trim();
      if (state.view === "home") { switchView("library"); return; }
      rerenderCurrent();
    });
    var wi = $("#wordInput");
    if (wi) wi.addEventListener("input", function () { showWord(this.value); });
    $("#overlay").addEventListener("click", function (e) {
      if (e.target === this) closeDetail();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeDetail();
    });
    $("#footStat").textContent = "现收录 " + POEMS.length + " 篇 · 覆盖 " +
      (new Set(POEMS.map(function (p) { return p.dynasty; }))).size + " 个朝代";
    switchView("home");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
