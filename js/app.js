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

  // ---------- state ----------
  var state = { view: "library", dynasty: null, theme: null, query: "" };

  // ---------- card ----------
  function poemCard(p) {
    var c = el("div", "card");
    var badge = p.appreciation ? '<span class="card-badge" title="已含赏析">赏</span>' : "";
    c.innerHTML = badge +
      '<span class="dyn">' + p.dynasty + ' · ' + (p.yearLabel || "").replace(/（.*?）/, "") + '</span>' +
      '<h3>' + p.title + '</h3>' +
      '<span class="author">' + p.author + '</span>' +
      '<div class="excerpt">' + firstLine(p.text) + '</div>' +
      '<div class="tags">' + (p.themes || []).map(function (t) {
        return '<span class="tag">' + t + '</span>';
      }).join("") + '</div>';
    c.addEventListener("click", function () { openDetail(p.id); });
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

    var d = $("#poemDetail");
    d.innerHTML =
      '<button class="close-btn" id="closeDetail">×</button>' +
      '<div class="pd-head"><h2>' + p.title + '</h2>' +
      '<div class="pd-meta">' + p.author + seals + '</div>' +
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
    if (v === "library") renderLibrary();
    else if (v === "theme") renderTheme();
    else if (v === "timeline") renderTimeline();
    else if (v === "map") renderMap();
  }

  function rerenderCurrent() {
    if (state.view === "library") renderLibrary();
    else if (state.view === "theme") renderTheme();
    else if (state.view === "timeline") renderTimeline();
  }

  // ---------- init ----------
  function init() {
    document.querySelectorAll("#viewTabs button").forEach(function (b) {
      b.addEventListener("click", function () { switchView(b.getAttribute("data-view")); });
    });
    $("#search").addEventListener("input", function () {
      state.query = this.value.trim();
      rerenderCurrent();
    });
    $("#overlay").addEventListener("click", function (e) {
      if (e.target === this) closeDetail();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeDetail();
    });
    $("#footStat").textContent = "现收录 " + POEMS.length + " 篇 · 覆盖 " +
      (new Set(POEMS.map(function (p) { return p.dynasty; }))).size + " 个朝代";
    switchView("library");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
