/* 诗渊 — 应用逻辑
 *
 * 数据一律经 Store 按需取用（见 js/store.js）；本文件只管路由与呈现。
 * 每篇作品都有自己的地址 #/poem/<id>，可直接分享、可被收录。
 */
(function () {
  "use strict";

  // ---------- helpers ----------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function dyn(o) { return Store.dynastyName(o); }
  function loading(host, msg) {
    host.innerHTML = '<p class="loading">' + (msg || "取书中…") + '</p>';
  }
  function failed(host, err) {
    host.innerHTML = '<p class="loadfail">没能取到这部分数据。<br><small>' +
      esc(err && err.message || err) + '</small></p>';
  }
  // 视图切换过程中可能有慢请求回来，用序号作废过期的渲染
  var epoch = 0;
  function guard() { var mine = ++epoch; return function () { return mine === epoch; }; }

  // ---------- 卡片 ----------
  function poemCard(c) {
    var card = el("div", "card");
    card.innerHTML =
      (c.ap ? '<span class="card-badge" title="已含赏析">赏</span>' : "") +
      '<span class="dyn">' + esc(dyn(c.d)) + ' · ' + esc(c.f) + '</span>' +
      '<h3>' + esc(c.t) + '</h3>' +
      '<span class="' + (c.a && c.a !== "佚名" ? "author author-link" : "author") + '">' + esc(c.a) + '</span>' +
      '<div class="excerpt">' + esc(c.x) + '</div>' +
      '<div class="tags">' + (c.th || []).map(function (t) {
        return '<span class="tag">' + esc(t) + '</span>';
      }).join("") + '</div>';
    card.addEventListener("click", function () { go("/poem/" + c.id); });
    var al = card.querySelector(".author-link");
    if (al) al.addEventListener("click", function (e) {
      e.stopPropagation(); go("/author/" + encodeURIComponent(c.a));
    });
    return card;
  }

  var PAGE = 120;
  /* 分页渲染：一次只塞 PAGE 张，其余按需追加。
     more 是个返回 Promise<卡片数组> 的取数函数，没有下一批时返回 null。 */
  function renderCards(host, cards, opts) {
    opts = opts || {};
    host.innerHTML = "";
    var grid = el("div", "grid");
    host.appendChild(grid);
    var countEl = el("p", "count");
    var shown = 0, list = cards.slice(), btn = null;

    function draw() {
      var end = Math.min(shown + PAGE, list.length);
      for (var i = shown; i < end; i++) grid.appendChild(poemCard(list[i]));
      shown = end;
      if (btn) btn.remove();
      var rest = opts.total ? opts.total - shown : list.length - shown;
      if (rest > 0) {
        btn = el("button", "more-btn", "显示更多（还有 " + rest + " 篇）");
        btn.addEventListener("click", function () {
          if (shown < list.length) return draw();
          btn.textContent = "取书中…";
          opts.more(list.length).then(function (next) {
            if (!next || !next.length) { btn.remove(); btn = null; return; }
            list = list.concat(next);
            draw();
          })["catch"](function () { btn.textContent = "没取到，点此重试"; });
        });
        host.appendChild(btn);
      }
      countEl.textContent = "共 " + (opts.total || list.length) + " 篇";
    }
    draw();
    host.appendChild(countEl);
    if (!list.length) host.innerHTML = '<p class="empty">这里还没有作品。</p>';
  }

  // ---------- 首页：一日一篇 ----------
  var homeOffset = 0;
  function viewHome() {
    var host = $("#view-home"), ok = guard();
    loading(host);
    Promise.all([Store.curated(), Store.art()]).then(function (res) {
      if (!ok()) return;
      var pool = res[0], art = res[1] || [];
      if (!pool.length) return failed(host, new Error("精编集为空"));
      var day = Math.floor(Date.now() / 86400000);
      var p = pool[(day + homeOffset) % pool.length];
      var lines = (p.text || "").split("\n");
      var prose = p.genre === "文" || lines.some(function (l) { return l.length > 22; });
      var pic = art.filter(function (a) { return a.poem === p.id; })[0];

      // 竖排只用在短篇上：长调竖排会溢出，横排反而稳当
      var chars = (p.text || "").replace(/\s/g, "").length;
      var vertical = pic && !prose && chars <= 60;

      var verse = '<div class="daily-text' + (prose ? " prose" : "") +
        (vertical ? " vertical" : "") + '" id="dailyText">' +
        lines.map(function (l) { return '<p>' + esc(l) + '</p>'; }).join("") + '</div>';
      var attr = '<div class="daily-attr">' + esc(p.dynasty) + '　' + esc(p.author) +
        '　《' + esc(p.title) + '》</div>';
      var acts = '<div class="daily-acts">' +
        '<button class="quiet" id="dailyOpen">释　文</button>' +
        '<span class="daily-sep">·</span>' +
        '<button class="quiet" id="dailyNext">换一篇</button></div>';

      if (pic) {
        var cap = [pic.dynasty, pic.artist].filter(Boolean).join(" ") +
          (pic.title ? '《' + pic.title + '》' : "");
        var credit = pic.credit
          ? (pic.link ? '<a href="' + esc(pic.link) + '" target="_blank" rel="noopener">' +
              esc(pic.credit) + '</a>' : esc(pic.credit))
          : "";
        host.innerHTML =
          '<div class="daily paired">' +
            '<figure class="daily-art">' +
              '<img src="assets/art/' + esc(pic.file) + '" alt="' + esc(cap) + '"' +
                (pic.w && pic.h ? ' width="' + pic.w + '" height="' + pic.h + '"' : "") + '>' +
              '<figcaption>' + esc(cap) + (credit ? '<span>' + credit + '</span>' : "") +
              '</figcaption>' +
            '</figure>' +
            '<div class="daily-words">' +
              '<div class="daily-seal">詩淵</div>' + verse + attr + acts +
            '</div>' +
          '</div>';
      } else {
        host.innerHTML = '<div class="daily">' +
          '<div class="daily-seal">詩淵</div>' + verse + attr + acts + '</div>';
      }

      function open() { go("/poem/" + p.id); }
      $("#dailyText").addEventListener("click", open);
      $("#dailyOpen").addEventListener("click", open);
      $("#dailyNext").addEventListener("click", function () { homeOffset++; viewHome(); });
    })["catch"](function (e) { if (ok()) failed(host, e); });
  }

  // ---------- 诗文库 ----------
  function viewLibrary(slug) {
    var host = $("#view-library"), ok = guard();
    var M = Store.manifest();
    var dyns = M.dynasties;
    var cur = slug && dyns.filter(function (d) { return d.slug === slug; })[0];

    host.innerHTML = '<div class="filters" id="libFilters"></div><div id="libBody"></div>';
    var f = $("#libFilters");
    var all = el("button", "chip" + (cur ? "" : " active"), "全部");
    all.addEventListener("click", function () { go("/library"); });
    f.appendChild(all);
    dyns.forEach(function (d) {
      var b = el("button", "chip" + (cur && cur.slug === d.slug ? " active" : ""),
        esc(d.k) + ' <i>' + d.count + '</i>');
      b.addEventListener("click", function () { go("/library/" + d.slug); });
      f.appendChild(b);
    });

    var body = $("#libBody");
    loading(body);
    // 不选朝代时按朝代顺序逐片取，选了就只取那个朝代
    var targets = cur ? [cur] : dyns.slice();
    var at = { i: 0, k: 0 };
    var total = targets.reduce(function (s, d) { return s + d.count; }, 0);

    function nextShard() {
      if (at.i >= targets.length) return Promise.resolve(null);
      var d = targets[at.i];
      if (at.k >= d.shards) { at.i++; at.k = 0; return nextShard(); }
      var k = at.k++;
      return Store.indexShard(d.slug, k);
    }
    nextShard().then(function (first) {
      if (!ok()) return;
      renderCards(body, first || [], { total: total, more: function () { return nextShard(); } });
    })["catch"](function (e) { if (ok()) failed(body, e); });
  }

  // ---------- 作者索引 ----------
  var authorQuery = "", authorDyn = null;
  function viewAuthors() {
    var host = $("#view-authors"), ok = guard();
    loading(host);
    Store.authors().then(function (list) {
      if (!ok()) return;
      host.innerHTML =
        '<p class="view-intro">一人一生的笔墨，聚在一处看，才见得出脾气。按朝代筛选，或直接搜名字。</p>' +
        '<div class="author-search"><input type="search" id="authorInput" placeholder="搜索作者，如 李白、苏轼…" autocomplete="off"></div>' +
        '<div class="filters" id="authorFilters"></div>' +
        '<div class="author-index" id="authorIndex"></div>' +
        '<p class="count" id="authorsCount"></p>';
      var input = $("#authorInput");
      input.value = authorQuery;
      input.addEventListener("input", function () { authorQuery = this.value; paint(); });

      var box = $("#authorFilters");
      var dyns = [];
      list.forEach(function (a) { if (dyns.indexOf(a.dy) < 0) dyns.push(a.dy); });
      var all = el("button", "chip" + (authorDyn ? "" : " active"), "全部");
      all.addEventListener("click", function () { authorDyn = null; viewAuthors(); });
      box.appendChild(all);
      dyns.forEach(function (k) {
        var b = el("button", "chip" + (authorDyn === k ? " active" : ""), esc(k));
        b.addEventListener("click", function () {
          authorDyn = authorDyn === k ? null : k; viewAuthors();
        });
        box.appendChild(b);
      });

      function paint() {
        var q = authorQuery.trim();
        var rows = list.filter(function (a) {
          return (!authorDyn || a.dy === authorDyn) && (!q || a.n.indexOf(q) !== -1);
        });
        var grid = $("#authorIndex");
        grid.innerHTML = "";
        rows.slice(0, 600).forEach(function (a) {
          var c = el("div", "au-cell",
            '<span class="au-seal">' + esc(a.n.slice(0, 1)) + '</span>' +
            '<span class="au-name">' + esc(a.n) + '</span>' +
            '<span class="au-dyn">' + esc(a.dy) + '</span>' +
            '<span class="au-n">' + a.c + '</span>');
          c.addEventListener("click", function () { go("/author/" + encodeURIComponent(a.n)); });
          grid.appendChild(c);
        });
        $("#authorsCount").textContent = "共 " + rows.length + " 位" +
          (rows.length > 600 ? "（显示前 600，可搜索缩小范围）" : "");
      }
      paint();
    })["catch"](function (e) { if (ok()) failed(host, e); });
  }

  // ---------- 作者专页 ----------
  function viewAuthor(name) {
    var host = $("#view-author"), ok = guard();
    loading(host);
    Store.authorWorks(name).then(function (works) {
      if (!ok()) return;
      if (!works.length) return failed(host, new Error("没有 " + name + " 的作品"));
      var dyns = [], forms = {}, themes = {};
      works.forEach(function (w) {
        var d = dyn(w.d);
        if (dyns.indexOf(d) < 0) dyns.push(d);
        forms[w.f] = (forms[w.f] || 0) + 1;
        (w.th || []).forEach(function (t) { themes[t] = (themes[t] || 0) + 1; });
      });
      var topForms = Object.keys(forms).sort(function (a, b) { return forms[b] - forms[a]; }).slice(0, 4);
      var topThemes = Object.keys(themes).sort(function (a, b) { return themes[b] - themes[a]; }).slice(0, 8);

      host.innerHTML =
        '<button class="back-link" id="authorBack">‹ 作者索引</button>' +
        '<div class="author-head">' +
          '<div class="author-seal">' + esc(name.slice(0, 1)) + '</div>' +
          '<h1 class="author-name">' + esc(name) + '</h1>' +
          '<div class="author-meta">' +
            '<span class="ap-dyn">' + esc(dyns.join(" · ")) + '</span>' +
            ' ｜ 共收录 <b>' + works.length + '</b> 篇' +
            (topForms.length ? ' ｜ 多作 ' + topForms.map(function (f) {
              return '<em>' + esc(f) + '</em>'; }).join("、") : "") +
          '</div>' +
        '</div>' +
        (topThemes.length ? '<div class="ap-block"><h4>常写主题</h4><div class="ap-chips">' +
          topThemes.map(function (t) {
            return '<button class="mini-chip" data-theme="' + esc(t) + '">' + esc(t) +
              '<i>' + themes[t] + '</i></button>';
          }).join("") + '</div></div>' : "") +
        '<h4 class="ap-works-h">作品</h4><div id="authorWorks"></div>';

      renderCards($("#authorWorks"), works, {});
      $("#authorBack").addEventListener("click", function () { go("/authors"); });
      host.querySelectorAll("[data-theme]").forEach(function (b) {
        b.addEventListener("click", function () { goThemeByName(b.getAttribute("data-theme")); });
      });
    })["catch"](function (e) { if (ok()) failed(host, e); });
  }

  // ---------- 体裁 / 主题：同一套「先选键，再列作品」 ----------
  function facetView(hostSel, load, keyOf, labelOf, groupOf, intro, current, onPick) {
    var host = $(hostSel), ok = guard();
    loading(host);
    load().then(function (metas) {
      if (!ok()) return;
      // 体裁与主题共用这段渲染，两个视图会同时存在于 DOM 里。
      // 因此一律用 class + host 作用域查找：按 id 找会命中文档中靠前的那个视图。
      host.innerHTML = '<p class="view-intro">' + intro + '</p>' +
        '<div class="facet-nav"></div><div class="facet-body"></div>';
      var nav = $(".facet-nav", host);
      // 主题有近千个（模型自由生成，无受控词表），一次全铺出来没法看：
      // 先只列常见的，其余折在"更多"后面。选中的那个无论排多后都要露出来。
      var CAP = 40;
      var expanded = false;
      function paintNav() {
        nav.innerHTML = "";
        var shown = metas;
        if (!expanded && metas.length > CAP) {
          shown = metas.slice(0, CAP);
          if (current && shown.indexOf(metas.filter(function (m) { return keyOf(m) === current; })[0]) < 0) {
            shown = shown.concat(metas.filter(function (m) { return keyOf(m) === current; }));
          }
        }
        var groups = {}, order = [];
        shown.forEach(function (m) {
          var g = groupOf(m);
          if (!groups[g]) { groups[g] = []; order.push(g); }
          groups[g].push(m);
        });
        order.forEach(function (g) {
          var row = el("div", "facet-group");
          if (g) row.appendChild(el("span", "facet-group-label", esc(g)));
          groups[g].forEach(function (m) {
            var b = el("button", "chip" + (current === keyOf(m) ? " active" : ""),
              esc(labelOf(m)) + ' <i>' + m.c + '</i>');
            b.addEventListener("click", function () { onPick(keyOf(m)); });
            row.appendChild(b);
          });
          nav.appendChild(row);
        });
        if (metas.length > CAP) {
          var t = el("button", "facet-toggle",
            expanded ? "收起" : "更多主题（共 " + metas.length + " 个）");
          t.addEventListener("click", function () { expanded = !expanded; paintNav(); });
          nav.appendChild(t);
        }
      }
      paintNav();
      var body = $(".facet-body", host);
      var meta = metas.filter(function (m) { return keyOf(m) === current; })[0];
      if (!meta) {
        body.innerHTML = '<p class="empty">选一项，看归入其下的作品。</p>';
        return;
      }
      loading(body);
      var k = 0;
      var fetchOne = function () { return meta._cards(k++); };
      fetchOne().then(function (first) {
        if (!ok()) return;
        renderCards(body, first || [], {
          total: meta.c,
          more: function () { return (k < (meta.s || 1)) ? fetchOne() : Promise.resolve(null); }
        });
      })["catch"](function (e) { if (ok()) failed(body, e); });
    })["catch"](function (e) { if (ok()) failed(host, e); });
  }

  function viewType(key) {
    facetView("#view-type",
      function () {
        return Store.forms().then(function (ms) {
          ms.forEach(function (m) { m._cards = function (k) { return Store.formCards(m, k); }; });
          return ms;
        });
      },
      function (m) { return m.k; }, function (m) { return m.n; }, function (m) { return m.g; },
      "从《诗经》的四言，到楚辞、乐府、古体诗，再到唐人格律严整的近体诗，乃至宋词元曲——诗体的演进，就是一部文言文的呼吸史。体裁由每首作品的句式自动归类。",
      key, function (k) { go("/type/" + k); });
  }

  var themeMetaCache = null;
  function viewTheme(key) {
    facetView("#view-theme",
      function () {
        return Store.themes().then(function (ms) {
          themeMetaCache = ms;
          ms.forEach(function (m) { m._cards = function (k) { return Store.themeCards(m, k); }; });
          return ms;
        });
      },
      function (m) { return m.k; }, function (m) { return m.n; }, function () { return ""; },
      "按主题浏览——爱情、田园、送别、忧国……看古人如何在同一母题下各抒其怀。" +
      '<br><small class="caveat">主题词由模型逐篇标注，尚无统一词表，长尾较杂。</small>',
      key, function (k) { go("/theme/" + k); });
  }
  function goThemeByName(name) {
    (themeMetaCache ? Promise.resolve(themeMetaCache) : Store.themes()).then(function (ms) {
      themeMetaCache = ms;
      var m = ms.filter(function (x) { return x.n === name; })[0];
      if (m) go("/theme/" + m.k);
    });
  }

  // ---------- 字词 ----------
  function viewWord(term) {
    var host = $("#view-word"), ok = guard();
    loading(host);
    Store.charSummary().then(function (sum) {
      if (!ok()) return;
      host.innerHTML =
        '<p class="view-intro">古人炼字，一字千金。这里可循一个字走进无数诗篇——看"月"如何照过千年，"风"如何吹遍江山。' +
        '<br><small class="caveat">已为最常见的 ' + sum.indexed + ' 个字建立索引（全库共 ' + sum.distinct +
        ' 个不同字）；每字最多列 ' + sum.maxHits + ' 例，且跨朝代抽样，不是只取最早的几篇。</small></p>' +
        '<div class="word-search"><input type="search" id="wordInput" placeholder="输入一个字，如 月、风、江…" autocomplete="off"></div>' +
        '<div class="char-cloud" id="charCloud"></div><div id="wordResult"></div>';

      var input = $("#wordInput");
      input.value = term || "";
      input.addEventListener("change", function () {
        var v = (this.value.trim().match(/[一-鿿]/) || [""])[0];
        if (v) go("/word/" + encodeURIComponent(v));
      });

      var cloud = $("#charCloud");
      var max = sum.cloud[0].n, min = sum.cloud[sum.cloud.length - 1].n;
      sum.cloud.slice(0, 80).forEach(function (c) {
        var b = el("button", "cloud-char", esc(c.c));
        b.style.fontSize = (13 + Math.round(20 * (c.n - min) / Math.max(1, max - min))) + "px";
        b.title = c.n + " 篇含此字";
        b.addEventListener("click", function () { go("/word/" + encodeURIComponent(c.c)); });
        cloud.appendChild(b);
      });

      var out = $("#wordResult");
      if (!term) {
        out.innerHTML = '<p class="empty">点一个字，看它在诗篇中的身影。</p>';
        return;
      }
      loading(out);
      Store.charHits(term).then(function (hit) {
        if (!ok()) return;
        if (!hit) {
          out.innerHTML = '<p class="empty">"' + esc(term) + '" 不在索引内——它在全库中出现得较少。</p>';
          return;
        }
        out.innerHTML = '<p class="word-count">"<b>' + esc(term) + '</b>" 现身于 <b>' + hit.n +
          '</b> 篇' + (hit.shown < hit.n ? '，以下列出其中 ' + hit.shown + ' 例（跨朝代抽样）' : "") + '</p>' +
          '<div class="word-list" id="wordList"></div>';
        var list = $("#wordList");
        hit.h.forEach(function (h) {
          var row = el("div", "word-row",
            '<div class="wr-line">' + esc(h.l).split(esc(term)).join('<mark>' + esc(term) + '</mark>') + '</div>' +
            '<div class="wr-meta">' + esc(dyn(h.d)) + '·' + esc(h.a) + '《' + esc(h.t) + '》</div>');
          row.addEventListener("click", function () { go("/poem/" + h.id); });
          list.appendChild(row);
        });
      })["catch"](function (e) { if (ok()) failed(out, e); });
    })["catch"](function (e) { if (ok()) failed(host, e); });
  }

  // ---------- 时间轴 ----------
  function viewTimeline(openBand) {
    var host = $("#view-timeline"), ok = guard();
    loading(host);
    Store.timeline().then(function (bands) {
      if (!ok()) return;
      var anyLoose = bands.some(function (b) { return !b.confident; });
      host.innerHTML =
        '<p class="view-intro">沿着时间之河，看文言文从《诗经》的四言到唐诗的格律、宋词的长短句，如何一路演变。' +
        (anyLoose ? '<br><small class="caveat">浅色的朝代尚未逐篇断代，只能按朝代整体定位。</small>' : "") +
        '</p><div class="tl-bands" id="tlBands"></div><div id="tlDrill"></div>';
      var wrap = $("#tlBands");
      var peak = 1;
      bands.forEach(function (b) { b.hist.forEach(function (h) { peak = Math.max(peak, h.n); }); });

      bands.forEach(function (b) {
        var band = el("div", "tl-band" + (b.confident ? "" : " vague"));
        band.innerHTML =
          '<div class="tl-band-head"><b>' + esc(b.k) + '</b><em>' + esc(b.span) + '</em>' +
          '<i>' + b.c + ' 篇</i></div>';
        var bars = el("div", "tl-hist");
        if (b.confident && b.hist.length > 1) {
          b.hist.forEach(function (h) {
            var bar = el("button", "tl-bar");
            bar.style.height = Math.max(3, Math.round(46 * h.n / peak)) + "px";
            bar.title = h.d + " 年代 · " + h.n + " 篇";
            bar.addEventListener("click", function () { go("/library/" + b.slug); });
            bars.appendChild(bar);
          });
        } else {
          bars.appendChild(el("span", "tl-flat", "尚未逐篇断代"));
        }
        band.appendChild(bars);
        band.addEventListener("click", function (e) {
          if (e.target.className !== "tl-bar") go("/library/" + b.slug);
        });
        wrap.appendChild(band);
      });
    })["catch"](function (e) { if (ok()) failed(host, e); });
  }

  // ---------- 地图 ----------
  var map = null, mapDone = false;
  function viewMap() {
    var host = $("#view-map"), ok = guard();
    if (mapDone) { setTimeout(function () { map && map.invalidateSize(); }, 60); return; }
    host.innerHTML = '<p class="view-intro">每一首诗都诞生在具体的山川之间。点击标记，看看哪些名篇写于同一片土地。</p>' +
      '<div id="mapCanvas"></div><p class="map-note" id="mapNote"></p>';
    if (typeof L === "undefined") {
      $("#mapCanvas").innerHTML = '<div class="map-fallback">地图组件需要联网加载（Leaflet / OpenStreetMap）。<br>' +
        '连上网络后刷新页面即可查看诗文的地理分布。<br>其余功能均可离线使用。</div>';
      return;
    }
    $("#mapNote").textContent = "取书中…";
    Store.places().then(function (places) {
      if (!ok()) return;
      mapDone = true;
      map = L.map("mapCanvas", { scrollWheelZoom: true }).setView([33.5, 112.5], 4);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        { maxZoom: 10, attribution: "© OpenStreetMap" }).addTo(map);
      var spots = {};
      places.forEach(function (p) {
        var k = p.lat + "," + p.lng;
        (spots[k] = spots[k] || { n: p.n, m: p.m, lat: p.lat, lng: p.lng, ps: [] }).ps.push(p);
      });
      Object.keys(spots).forEach(function (k) {
        var s = spots[k];
        var icon = L.divIcon({
          className: "",
          html: '<div class="map-pin">' + s.ps.length + '</div>',
          iconSize: [26, 26], iconAnchor: [13, 13]
        });
        var html = '<div class="map-popup"><h4>' + esc(s.n) + '</h4>' +
          '<div class="mp-meta">' + esc(s.m) + '</div><div style="margin-top:6px">' +
          s.ps.slice(0, 30).map(function (p) {
            return '<div><span class="mp-open" data-id="' + esc(p.id) + '">《' + esc(p.t) + '》· ' + esc(p.a) + '</span></div>';
          }).join("") + '</div></div>';
        L.marker([s.lat, s.lng], { icon: icon }).addTo(map).bindPopup(html)
          .on("popupopen", function () {
            document.querySelectorAll(".mp-open").forEach(function (n) {
              n.onclick = function () { go("/poem/" + n.getAttribute("data-id")); };
            });
          });
      });
      $("#mapNote").textContent = "标记内数字为该地留存的诗文篇数；共 " + places.length + " 篇有据可考。";
    })["catch"](function (e) { if (ok()) failed(host, e); });
  }

  // ---------- 检索 ----------
  function viewSearch(q) {
    var host = $("#view-search"), ok = guard();
    loading(host, "检索中…");
    Store.search(q).then(function (rows) {
      if (!ok()) return;
      host.innerHTML = '<p class="view-intro">"<b>' + esc(q) + '</b>" 命中 <b>' + rows.length + '</b> 条' +
        '<br><small class="caveat">检索范围为标题与作者；正文暂未建索引。</small></p>' +
        '<div id="searchBody"></div>';
      var body = $("#searchBody");
      if (!rows.length) {
        body.innerHTML = '<p class="empty">没有匹配的标题或作者。</p>';
        return;
      }
      var list = el("div", "word-list");
      rows.slice(0, 300).forEach(function (r) {
        var row = el("div", "word-row",
          '<div class="wr-line">《' + esc(r.t) + '》</div>' +
          '<div class="wr-meta">' + esc(dyn(r.d)) + '·' + esc(r.a) + '</div>');
        row.addEventListener("click", function () { go("/poem/" + r.id); });
        list.appendChild(row);
      });
      body.appendChild(list);
      if (rows.length > 300) body.appendChild(el("p", "count", "仅显示前 300 条"));
    })["catch"](function (e) { if (ok()) failed(host, e); });
  }

  // ---------- 详情浮层 ----------
  function section(title, bodyHtml, en) {
    return '<div class="pd-sec"><div class="pd-sec-head"><h4>' + title +
      '</h4><span class="arrow">▸</span></div><div class="pd-sec-body' +
      (en ? " en" : "") + '">' + bodyHtml + '</div></div>';
  }
  function openPoem(id) {
    var ov = $("#overlay"), d = $("#poemDetail");
    ov.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    d.innerHTML = '<button class="close-btn" id="closeDetail">×</button><p class="loading">取书中…</p>';
    $("#closeDetail").addEventListener("click", closeDetail);

    Store.poemById(id).then(function (p) {
      if (!p) throw new Error("未找到 " + id);
      var lines = (p.text || "").split("\n");
      var pys = p.pinyin ? p.pinyin.split("\n") : [];
      var hasPy = pys.length === lines.length;
      var todo = '<span style="color:var(--gold)">— 待补充 —</span>';

      var sec = section("译　文", p.translation ? esc(p.translation) : todo);
      sec += section("注　释", (p.notes && p.notes.length)
        ? '<ul class="notes-list">' + p.notes.map(function (n) {
            return '<li><span class="term">' + esc(n.term) + '</span>' + esc(n.explain) + '</li>';
          }).join("") + '</ul>' : todo);
      sec += section("赏　析", p.appreciation ? esc(p.appreciation) : todo);
      sec += section("English", p.english
        ? esc(p.english).replace(/\n/g, "<br>") +
          (p.englishBy ? '<div class="en-by">— ' + esc(p.englishBy) + '</div>' : "")
        : todo, true);

      d.innerHTML =
        '<button class="close-btn" id="closeDetail">×</button>' +
        '<div class="pd-head"><h2>' + esc(p.title) + '</h2>' +
          '<div class="pd-meta">' +
            (p.author && p.author !== "佚名"
              ? '<span class="pd-author-link" id="pdAuthor">' + esc(p.author) + '</span>'
              : esc(p.author)) +
            '<span class="seal">' + esc(p.dynasty) + '</span>' +
            (p.form ? '<span class="seal jade">' + esc(p.form) + '</span>' : "") +
          '</div>' +
          (p.yearLabel ? '<div class="pd-meta pd-year">' + esc(p.yearLabel) + '</div>' : "") +
          (p.place && p.place.name ? '<div class="pd-place">✎ ' + esc(p.place.name) +
            (p.place.modern ? '（' + esc(p.place.modern) + '）' : "") + '</div>' : "") +
        '</div>' +
        '<div class="pd-poem' + (hasPy ? "" : " no-pinyin") + (p.genre === "文" ? " prose" : "") + '" id="pdPoem">' +
          lines.map(function (ln, i) {
            return '<div class="pd-line"><span class="py">' + (hasPy ? esc(pys[i]) : "") +
              '</span><span class="zh">' + esc(ln) + '</span></div>';
          }).join("") +
        '</div>' +
        (hasPy ? '<button class="pinyin-toggle" id="pyToggle">隐藏拼音</button>' : "") +
        (p.enrichedBy ? '<div class="ai-note">✦ 译文 / 注释 / 赏析 / 英译 由 AI（' +
          esc(p.enrichedBy) + '）生成，待校订</div>' : "") +
        '<div class="pd-sections">' + sec + '</div>';

      var secs = d.querySelectorAll(".pd-sec");
      if (secs[0]) secs[0].classList.add("open");
      d.querySelectorAll(".pd-sec-head").forEach(function (h) {
        h.addEventListener("click", function () { h.parentNode.classList.toggle("open"); });
      });
      $("#closeDetail").addEventListener("click", closeDetail);
      var a = $("#pdAuthor");
      if (a) a.addEventListener("click", function () { go("/author/" + encodeURIComponent(p.author)); });
      if (hasPy) $("#pyToggle").addEventListener("click", function () {
        var hidden = $("#pdPoem").classList.toggle("no-pinyin");
        this.textContent = hidden ? "显示拼音" : "隐藏拼音";
      });
    })["catch"](function (e) {
      d.innerHTML = '<button class="close-btn" id="closeDetail">×</button>' +
        '<p class="loadfail">没能取到这首作品。<br><small>' + esc(e.message) + '</small></p>';
      $("#closeDetail").addEventListener("click", closeDetail);
    });
  }
  // 浮层是叠在某个视图之上的：关掉就退回上一条地址
  var underlying = "/";
  function closeDetail() {
    $("#overlay").classList.add("hidden");
    document.body.style.overflow = "";
    if (location.hash.indexOf("#/poem/") === 0) go(underlying, true);
  }

  // ---------- 路由 ----------
  var VIEWS = ["home", "library", "authors", "author", "type", "theme",
               "word", "timeline", "map", "search"];
  function show(v) {
    VIEWS.forEach(function (n) { $("#view-" + n).classList.toggle("hidden", n !== v); });
    document.querySelectorAll("#viewTabs button").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-view") === v);
    });
  }
  function go(path, replace) {
    if (replace) location.replace("#" + path); else location.hash = path;
  }

  function route() {
    var raw = location.hash.replace(/^#/, "") || "/";
    var parts = raw.split("/").filter(Boolean).map(decodeURIComponent);
    var head = parts[0] || "home";

    if (head === "poem") {
      openPoem(parts[1]);
      return;
    }
    // 记住浮层底下是哪一页，关闭时好退回去
    underlying = raw;
    if (!$("#overlay").classList.contains("hidden")) {
      $("#overlay").classList.add("hidden");
      document.body.style.overflow = "";
    }
    window.scrollTo(0, 0);

    switch (head) {
      case "library":  show("library");  return viewLibrary(parts[1]);
      case "authors":  show("authors");  return viewAuthors();
      case "author":   show("author");   return viewAuthor(parts[1]);
      case "type":     show("type");     return viewType(parts[1]);
      case "theme":    show("theme");    return viewTheme(parts[1]);
      case "word":     show("word");     return viewWord(parts[1]);
      case "timeline": show("timeline"); return viewTimeline();
      case "map":      show("map");      return viewMap();
      case "search":   show("search");   return viewSearch(parts.slice(1).join("/"));
      default:         show("home");     return viewHome();
    }
  }

  // ---------- init ----------
  function init() {
    document.querySelectorAll("#viewTabs button").forEach(function (b) {
      b.addEventListener("click", function () {
        var v = b.getAttribute("data-view");
        go(v === "home" ? "/" : "/" + v);
      });
    });
    var brand = $(".brand");
    if (brand) brand.addEventListener("click", function () { go("/"); });

    var box = $("#search"), timer = null;
    box.addEventListener("input", function () {
      var v = this.value.trim();
      clearTimeout(timer);
      timer = setTimeout(function () {
        if (v) go("/search/" + encodeURIComponent(v));
      }, 260);
    });

    $("#overlay").addEventListener("click", function (e) { if (e.target === this) closeDetail(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDetail(); });
    window.addEventListener("hashchange", route);

    Store.boot().then(function (m) {
      $("#bootStat").textContent = "收录 " + m.total + " 篇";
      route();
    })["catch"](function (e) {
      $("#main").innerHTML = '<p class="loadfail">数据没能载入。<br><small>' +
        esc(e.message) + '</small><br><small>若是本地打开的文件，请改用 http 方式访问' +
        '（在项目目录执行 python3 -m http.server）。</small></p>';
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
