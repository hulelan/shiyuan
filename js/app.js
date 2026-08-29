/* 诗渊 — 应用逻辑
 *
 * 数据一律经 Store 按需取用（见 js/store.js）；本文件只管路由与呈现。
 * 每篇作品都有自己的地址 #/poem/<id>，可直接分享、可被收录。
 *
 * 界面文字一律过 T()（见 js/i18n.js）—— 只译界面，诗文与作者名不译。
 * 新加界面文案时记得包一层 T()，否则英文界面下会突然冒出一句中文。
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
  function dyn(o) { return T.dyn(Store.dynastyName(o)); }
  function loading(host, msg) {
    host.innerHTML = '<p class="loading">' + (msg || T("取书中…")) + '</p>';
  }
  function failed(host, err) {
    host.innerHTML = '<p class="loadfail">' + T("没能取到这部分数据。") + '<br><small>' +
      esc(err && err.message || err) + '</small></p>';
  }
  // 视图切换过程中可能有慢请求回来，用序号作废过期的渲染
  var epoch = 0;
  function guard() { var mine = ++epoch; return function () { return mine === epoch; }; }

  /* ---------- 配画投稿 ----------
     开一个填好了作品信息的 GitHub issue。作品那几行是预填的（省得来回问
     "你说的是哪首"），画的信息留空等人填。收到之后走 tools/add_art.py 落地。
     issue 正文里那行 id 是关键：它就是 assets/art/index.json 里的 poem 字段。 */
  var REPO = "https://github.com/hulelan/shiyuan";
  function artIssueUrl(p) {
    var head = "《" + p.title + "》" + (p.author && p.author !== "佚名" ? " " + p.author : "");
    var body = [
      "作品：" + head + "　（" + (p.dynasty || "") + "）",
      "id：`" + p.id + "`",
      "链接：" + location.origin + location.pathname + "#/poem/" + p.id,
      "",
      "以下请填 —",
      "",
      "画名：",
      "画家：",
      "画的年代：",
      "藏处 / 出处：",
      "图片链接（或直接把图拖进这个 issue）：",
      "版权状态：公有领域 / 已获授权 / 不确定",
      "",
      "为什么是这一幅："
    ].join("\n");
    return REPO + "/issues/new?labels=" + encodeURIComponent("配画") +
      "&title=" + encodeURIComponent("配画：" + head) +
      "&body=" + encodeURIComponent(body);
  }

  // ---------- 卡片 ----------
  function poemCard(c) {
    var card = el("div", "card");
    card.innerHTML =
      (c.ap ? '<span class="card-badge" title="' + T("已含赏析") + '">' +
        (T.isEn() ? "✦" : "赏") + '</span>' : "") +
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

  /* ---------- 两种读法：卡片 / 长卷 ----------
     卡片是查检用的 —— 一眼扫过去找那一首。
     长卷是通读用的 —— 顺着一列列往下看，像展开一卷手卷。
     任何一个列表都该能两种读法：某个朝代的、某位作者的、某个体裁的、某个主题的。
     选择记在 localStorage 里：一个人怎么读书，不该每换一页就重选一次。 */
  function readMode() {
    try { return localStorage.getItem("readMode") === "scroll" ? "scroll" : "cards"; }
    catch (e) { return "cards"; }
  }
  function setReadMode(m) {
    try { localStorage.setItem("readMode", m); } catch (e) {}
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
        btn = el("button", "more-btn", T("显示更多（还有 {n} 篇）", { n: rest }));
        btn.addEventListener("click", function () {
          if (shown < list.length) return draw();
          btn.textContent = T("取书中…");
          opts.more(list.length).then(function (next) {
            if (!next || !next.length) { btn.remove(); btn = null; return; }
            list = list.concat(next);
            draw();
          })["catch"](function () { btn.textContent = T("没取到，点此重试"); });
        });
        host.appendChild(btn);
      }
      countEl.textContent = T("共 {n} 篇", { n: opts.total || list.length });
    }
    draw();
    host.appendChild(countEl);
    if (!list.length) host.innerHTML = '<p class="empty">' + T("这里还没有作品。") + '</p>';
  }

  /* 列表的外壳：一条切换 + 内容区。
     渲染器（卡片或长卷）从同一份 cards 出发，切换时不必重新取数。 */
  function listBody(host, cards, opts) {
    opts = opts || {};
    host.innerHTML = '<div class="read-switch">' +
        '<button class="rs" data-m="cards">' + T("卡片") + '</button>' +
        '<button class="rs" data-m="scroll">' + T("长卷") + '</button>' +
      '</div><div class="list-body"></div>';
    var body = $(".list-body", host);

    function paint() {
      var m = readMode();
      host.querySelectorAll(".rs").forEach(function (b) {
        b.classList.toggle("on", b.getAttribute("data-m") === m);
      });
      if (m === "scroll") renderScroll(body, cards, opts);
      else renderCards(body, cards, opts);
    }
    host.querySelectorAll(".rs").forEach(function (b) {
      b.addEventListener("click", function () {
        setReadMode(b.getAttribute("data-m"));
        paint();
      });
    });
    paint();
  }

  /* 长卷：竖排成列，自右向左展开。
     卡片只带首句，通读要全文 —— 所以这里得按 id 去取正文。
     一次取 SCROLL_BATCH 首：全文分片是 200 首一片，连着的几首多半同片，
     Store 里又有缓存，实际请求数远小于首数。 */
  var SCROLL_BATCH = 24;
  function renderScroll(host, cards, opts) {
    opts = opts || {};
    host.innerHTML =
      '<div class="scroll-stage"><div class="scroll-case"><div class="scroll">' +
        '<div class="roller"></div>' +
        '<div class="scroll-paper" id="scrollPaper"></div>' +
        '<div class="roller"></div>' +
      '</div></div>' +
      '<div class="scroll-hint">' + T("自右向左展卷；点一列读全篇") + '</div></div>';
    var paper = $("#scrollPaper", host);
    var list = cards.slice(), at = 0, busy = false;

    function column(p, card) {
      var lines = (p.text || "").split("\n");
      var prose = isProse(p);
      var col = el("div", "scroll-col" + (prose ? " prose" : ""));
      col.innerHTML = '<h3>' + esc(p.title) + '</h3>' +
        '<div class="au">' + esc(T.dyn(p.dynasty)) + ' · ' + esc(p.author) + '</div>' +
        lines.map(function (l) { return '<p>' + esc(l) + '</p>'; }).join("");
      col.addEventListener("click", function () { go("/poem/" + p.id); });
      return col;
    }

    function loadMore() {
      if (busy) return Promise.resolve();
      busy = true;
      // 卡片不够了就再抓一片索引
      var need = at + SCROLL_BATCH - list.length;
      var pre = (need > 0 && opts.more)
        ? opts.more(list.length).then(function (next) {
            if (next && next.length) list = list.concat(next);
          })["catch"](function () {})
        : Promise.resolve();
      return pre.then(function () {
        var batch = list.slice(at, at + SCROLL_BATCH);
        at += batch.length;
        if (!batch.length) { busy = false; return; }
        return Promise.all(batch.map(function (c) {
          return Store.poem(c)["catch"](function () { return null; });
        })).then(function (poems) {
          poems.forEach(function (p, i) { if (p) paper.appendChild(column(p, batch[i])); });
          busy = false;
        });
      })["catch"](function () { busy = false; });
    }

    // 卷是从右往左看的（direction: rtl），所以"接近末尾"是 scrollLeft 趋近于负的宽度
    paper.addEventListener("scroll", function () {
      var left = paper.scrollWidth - Math.abs(paper.scrollLeft) - paper.clientWidth;
      if (left < 600) loadMore();
    });

    loading(paper);
    loadMore().then(function () {
      var l = $(".loading", paper);
      if (l) l.remove();
      if (!paper.children.length) {
        paper.innerHTML = '<p class="empty">' + T("这里还没有作品。") + '</p>';
      }
    });
  }

  // ---------- 首页：一日一篇 ----------
  /* 首页只有一首诗。留白是内容的一部分 ——
     不要往这里加统计、入口、模式切换或推荐。
     「长卷」现在是任何列表的第二种读法（见 renderScroll / listBody），
     「配画」是一个独立视角（见 viewArt），都不该挤在首页。 */
  var homeOffset = 0;

  function poemLines(p) { return (p.text || "").split("\n"); }
  function isProse(p) {
    var lines = poemLines(p);
    return p.genre === "文" || lines.some(function (l) { return l.length > 22; });
  }

  function viewHome() {
    var host = $("#view-home"), ok = guard();
    loading(host);
    Promise.all([Store.curated(), Store.art()]).then(function (res) {
      if (!ok()) return;
      var pool = res[0], art = res[1] || [];
      if (!pool.length) return failed(host, new Error("精编集为空"));
      var artMap = {};
      art.forEach(function (a) { artMap[a.poem] = a; });

      var day = Math.floor(Date.now() / 86400000);
      var p = pool[(day + homeOffset) % pool.length];
      var pic = artMap[p.id];

      var lines = poemLines(p);
      var prose = isProse(p);
      var chars = (p.text || "").replace(/\s/g, "").length;
      // 竖排只用在短篇上：长调竖排会溢出，横排反而稳当
      var vertical = !prose && chars <= 60;

      var verse = '<div class="daily-text' + (prose ? " prose" : "") +
        (vertical ? " vertical" : "") + '" id="dailyText">' +
        lines.map(function (l) { return '<p>' + esc(l) + '</p>'; }).join("") + '</div>';
      var attr = '<div class="daily-attr">' +
        '<span class="attr-dyn">' + esc(T.dyn(p.dynasty)) + '</span>　' + esc(p.author) +
        '　《' + esc(p.title) + '》</div>';
      var acts = '<div class="daily-acts">' +
        '<button class="quiet" id="dailyOpen">' + T("释　文") + '</button>' +
        '<span class="daily-sep">·</span>' +
        '<button class="quiet" id="dailyNext">' + T("换一篇") + '</button>' +
        (pic ? "" : '<span class="daily-sep">·</span>' +
          '<a class="quiet suggest-art" href="' + esc(artIssueUrl(p)) +
          '" target="_blank" rel="noopener" title="' +
          T("为这一篇推荐一幅画（会开一个 GitHub issue）") + '">' +
          T("推荐一幅画") + '</a>') +
        '</div>';

      host.className = "view";
      if (pic) {
        host.innerHTML = '<div class="daily paired">' + artFigure(pic) +
          '<div class="daily-words"><div class="daily-seal">詩淵</div>' +
          verse + attr + acts + '</div></div>';
      } else {
        host.innerHTML = '<div class="daily"><div class="daily-seal">詩淵</div>' +
          verse + attr + acts + '</div>';
      }

      function open() { go("/poem/" + p.id); }
      $("#dailyText").addEventListener("click", open);
      $("#dailyOpen").addEventListener("click", open);
      $("#dailyNext").addEventListener("click", function () { homeOffset++; viewHome(); });
    })["catch"](function (e) { if (ok()) failed(host, e); });
  }

  /* 画的那一半版式。首页与「配画」视角共用，免得两处各写一遍、日后各改各的。 */
  function artFigure(pic) {
    var cap = [pic.dynasty, pic.artist].filter(Boolean).join(" ") +
      (pic.title ? '《' + pic.title + '》' : "");
    var credit = pic.credit
      ? (pic.link ? '<a href="' + esc(pic.link) + '" target="_blank" rel="noopener">' +
          esc(pic.credit) + '</a>' : esc(pic.credit))
      : "";
    return '<figure class="daily-art">' +
      '<img src="assets/art/' + esc(pic.file) + '" alt="' + esc(cap) + '" loading="lazy"' +
        (pic.w && pic.h ? ' width="' + pic.w + '" height="' + pic.h + '"' : "") + '>' +
      '<figcaption>' + esc(cap) + (credit ? '<span>' + credit + '</span>' : "") +
      '</figcaption></figure>';
  }

  // ---------- 诗文库 ----------
  function viewLibrary(slug) {
    var host = $("#view-library"), ok = guard();
    var M = Store.manifest();
    var dyns = M.dynasties;
    var cur = slug && dyns.filter(function (d) { return d.slug === slug; })[0];

    host.innerHTML = '<div class="filters" id="libFilters"></div><div id="libBody"></div>';
    var f = $("#libFilters");
    var all = el("button", "chip" + (cur ? "" : " active"), T("全部"));
    all.addEventListener("click", function () { go("/library"); });
    f.appendChild(all);
    dyns.forEach(function (d) {
      var b = el("button", "chip" + (cur && cur.slug === d.slug ? " active" : ""),
        esc(T.dyn(d.k)) + ' <i>' + d.count + '</i>');
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
      listBody(body, first || [], { total: total, more: function () { return nextShard(); } });
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
        '<div class="author-search"><input type="search" id="authorInput" placeholder="' +
          T("搜索作者，如 李白、苏轼…") + '" autocomplete="off"></div>' +
        '<div class="filters" id="authorFilters"></div>' +
        '<div class="author-index" id="authorIndex"></div>' +
        '<p class="count" id="authorsCount"></p>';
      var input = $("#authorInput");
      input.value = authorQuery;
      input.addEventListener("input", function () { authorQuery = this.value; paint(); });

      var box = $("#authorFilters");
      var dyns = [];
      list.forEach(function (a) { if (dyns.indexOf(a.dy) < 0) dyns.push(a.dy); });
      var all = el("button", "chip" + (authorDyn ? "" : " active"), T("全部"));
      all.addEventListener("click", function () { authorDyn = null; viewAuthors(); });
      box.appendChild(all);
      dyns.forEach(function (k) {
        var b = el("button", "chip" + (authorDyn === k ? " active" : ""), esc(T.dyn(k)));
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
            '<span class="au-dyn">' + esc(T.dyn(a.dy)) + '</span>' +
            '<span class="au-n">' + a.c + '</span>');
          c.addEventListener("click", function () { go("/author/" + encodeURIComponent(a.n)); });
          grid.appendChild(c);
        });
        $("#authorsCount").textContent = T("共 {n} 位", { n: rows.length }) +
          (rows.length > 600 ? T("（显示前 600，可搜索缩小范围）") : "");
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
      if (!works.length) return failed(host, new Error(T("没有 {name} 的作品", { name: name })));
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
        '<button class="back-link" id="authorBack">' + T("‹ 作者索引") + '</button>' +
        '<div class="author-head">' +
          '<div class="author-seal">' + esc(name.slice(0, 1)) + '</div>' +
          '<h1 class="author-name">' + esc(name) + '</h1>' +
          '<div class="author-meta">' +
            '<span class="ap-dyn">' + esc(dyns.join(" · ")) + '</span>' +
            ' ｜ ' + T("共收录 <b>{n}</b> 篇", { n: works.length }) +
            (topForms.length ? ' ｜ ' + T("多作") + ' ' + topForms.map(function (f) {
              return '<em>' + esc(f) + '</em>'; }).join("、") : "") +
          '</div>' +
        '</div>' +
        (topThemes.length ? '<div class="ap-block"><h4>' + T("常写主题") + '</h4><div class="ap-chips">' +
          topThemes.map(function (t) {
            return '<button class="mini-chip" data-theme="' + esc(t) + '">' + esc(t) +
              '<i>' + themes[t] + '</i></button>';
          }).join("") + '</div></div>' : "") +
        '<h4 class="ap-works-h">' + T("作品") + '</h4><div id="authorWorks"></div>';

      listBody($("#authorWorks"), works, {});
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
      host.innerHTML = '<div class="facet-nav"></div><div class="facet-body"></div>';
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
            expanded ? T("收起") : T("更多主题（共 {n} 个）", { n: metas.length }));
          t.addEventListener("click", function () { expanded = !expanded; paintNav(); });
          nav.appendChild(t);
        }
      }
      paintNav();
      var body = $(".facet-body", host);
      var meta = metas.filter(function (m) { return keyOf(m) === current; })[0];
      if (!meta) {
        body.innerHTML = '<p class="empty">' + T("选一项，看归入其下的作品。") + '</p>';
        return;
      }
      loading(body);
      var k = 0;
      var fetchOne = function () { return meta._cards(k++); };
      fetchOne().then(function (first) {
        if (!ok()) return;
        listBody(body, first || [], {
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
      T("从《诗经》的四言，到楚辞、乐府、古体诗，再到唐人格律严整的近体诗，乃至宋词元曲——诗体的演进，就是一部文言文的呼吸史。体裁由每首作品的句式自动归类。"),
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
      T("按主题浏览——爱情、田园、送别、忧国……看古人如何在同一母题下各抒其怀。") +
      '<br><small class="caveat">' + T("主题词由模型逐篇标注，尚无统一词表，长尾较杂。") + '</small>',
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
        '<p class="view-intro">' +
        '<small class="caveat">' +
        T("已为最常见的 {a} 个字建立索引（全库共 {b} 个不同字）；每字最多列 {c} 例，且跨朝代抽样，不是只取最早的几篇。",
          { a: sum.indexed, b: sum.distinct, c: sum.maxHits }) + '</small></p>' +
        '<div class="word-search"><input type="search" id="wordInput" placeholder="' +
        T("输入一个字，如 月、风、江…") + '" autocomplete="off"></div>' +
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
        b.title = T("{n} 篇", { n: c.n });
        b.addEventListener("click", function () { go("/word/" + encodeURIComponent(c.c)); });
        cloud.appendChild(b);
      });

      var out = $("#wordResult");
      if (!term) {
        out.innerHTML = '<p class="empty">' + T("点一个字，看它在诗篇中的身影。") + '</p>';
        return;
      }
      loading(out);
      Store.charHits(term).then(function (hit) {
        if (!ok()) return;
        if (!hit) {
          out.innerHTML = '<p class="empty">' +
            T('"{c}" 不在索引内——它在全库中出现得较少。', { c: esc(term) }) + '</p>';
          return;
        }
        out.innerHTML = '<p class="word-count">' +
          T('"<b>{c}</b>" 现身于 <b>{n}</b> 篇', { c: esc(term), n: hit.n }) +
          (hit.shown < hit.n ? T("，以下列出其中 {n} 例（跨朝代抽样）", { n: hit.shown }) : "") + '</p>' +
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
      // 三种底子：逐篇断代、按作者生卒估算、只知朝代。
      var anyAuthor = bands.some(function (b) { return b.byAuthorOnly; });
      var anyLoose  = bands.some(function (b) { return !b.confident && !b.byAuthorOnly; });
      host.innerHTML =
        ((anyAuthor || anyLoose) ? '<p class="view-intro"><small class="caveat">' +
          (anyAuthor ? T("虚线的朝代按作者生卒估算 —— 画的是诗人活在什么时候，不是这首诗写于哪一年。") : "") +
          (anyAuthor && anyLoose ? '<br>' : "") +
          (anyLoose ? T("浅色的朝代尚未逐篇断代，只能按朝代整体定位。") : "") +
          '</small></p>' : "") +
        '<div class="tl-bands" id="tlBands"></div><div id="tlDrill"></div>';
      var wrap = $("#tlBands");
      var peak = 1;
      bands.forEach(function (b) { b.hist.forEach(function (h) { peak = Math.max(peak, h.n); }); });

      bands.forEach(function (b) {
        var band = el("div", "tl-band" + (b.confident ? "" : b.byAuthorOnly ? " byauthor" : " vague"));
        band.innerHTML =
          '<div class="tl-band-head"><b>' + esc(T.dyn(b.k)) + '</b><em>' + esc(b.span) + '</em>' +
          '<i>' + T("{n} 篇", { n: b.c }) + '</i></div>';
        var bars = el("div", "tl-hist");
        if ((b.confident || b.byAuthorOnly) && b.hist.length > 1) {
          b.hist.forEach(function (h) {
            var bar = el("button", "tl-bar");
            bar.style.height = Math.max(3, Math.round(46 * h.n / peak)) + "px";
            bar.title = T("{d} 年代 · {n} 篇", { d: T.year(h.d), n: h.n }) +
              (b.byAuthorOnly ? " · " + T("按作者生卒估算") : "");
            bar.addEventListener("click", function () { go("/library/" + b.slug); });
            bars.appendChild(bar);
          });
        } else {
          bars.appendChild(el("span", "tl-flat", T("尚未逐篇断代")));
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
  /* 两种看法并存：
       全览 —— 不分时间，就是原来那张图，默认；
       滑块 —— 五十年一档，看诗写在哪儿这件事怎么随时间挪动。
     滑块只认断得出确年的篇目。按朝代摊出来的占位年份一概不进滑块 ——
     否则一整个唐朝会齐刷刷堆在同一档上，看着像那五十年里人人写诗。
     这些篇目在全览里照样在。 */
  var BUCKET = 50;
  var map = null, mapLayer = null, mapDone = false;
  var leafletPromise = null;

  /* Leaflet 按需加载：地图只是众多视角之一，首页不为它拖整份 CDN 资源
     （它原本还是 <head> 里唯一的第三方渲染阻塞依赖）。
     首次打开地图才注入 CSS + JS；加载失败 = 离线，走降级提示。 */
  function loadLeaflet() {
    if (typeof L !== "undefined") return Promise.resolve();
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise(function (resolve, reject) {
      var css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(css);
      var s = document.createElement("script");
      s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      s.onload = function () { resolve(); };
      s.onerror = function () {
        leafletPromise = null;      // 失败不留缓存：下次打开地图会重试（跟 store.js 同一套做法）
        reject(new Error("Leaflet 未能加载"));
      };
      document.head.appendChild(s);
    });
    return leafletPromise;
  }

  function viewMap() {
    var host = $("#view-map"), ok = guard();
    if (mapDone) { setTimeout(function () { map && map.invalidateSize(); }, 60); return; }
    host.innerHTML = '<div id="mapCanvas"></div>' +
      '<div class="map-time" id="mapTime"></div>' +
      '<p class="map-note" id="mapNote"></p>';
    $("#mapNote").textContent = T("取书中…");
    loadLeaflet()["catch"](function () { return null; }).then(function () {
      if (!ok()) return;
      if (typeof L === "undefined") {
        // 离线或 CDN 不可达：降级为提示，不拦着其余功能
        $("#mapCanvas").innerHTML = '<div class="map-fallback">' +
          T("地图组件需要联网加载（Leaflet / OpenStreetMap）。") + '<br>' +
          T("连上网络后刷新页面即可查看诗文的地理分布。") + '<br>' +
          T("其余功能均可离线使用。") + '</div>';
        $("#mapNote").textContent = "";
        return;
      }
      return Store.places();
    }).then(function (places) {
      if (!ok() || !places) return;
      mapDone = true;
      map = L.map("mapCanvas", { scrollWheelZoom: true }).setView([33.5, 112.5], 4);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        { maxZoom: 10, attribution: "© OpenStreetMap" }).addTo(map);
      mapLayer = L.layerGroup().addTo(map);

      // ---- 分档 ----
      var dated = places.filter(function (p) { return p.y != null && !p.e; });
      var undated = places.length - dated.length;
      var slots = [], byslot = {}, peak = 1;
      if (dated.length) {
        var lo = Infinity, hi = -Infinity;
        dated.forEach(function (p) {
          var b = Math.floor(p.y / BUCKET) * BUCKET;
          (byslot[b] = byslot[b] || []).push(p);
          if (b < lo) lo = b;
          if (b > hi) hi = b;
        });
        // 空档也留着位置 —— 时间轴要是等距的，中间那几百年的空白本身就是信息
        for (var y = lo; y <= hi; y += BUCKET) {
          slots.push(y);
          peak = Math.max(peak, (byslot[y] || []).length);
        }
      }

      function drawPins(list) {
        mapLayer.clearLayers();
        var spots = {};
        list.forEach(function (p) {
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
              return '<div><span class="mp-open" data-id="' + esc(p.id) + '">《' +
                esc(p.t) + '》· ' + esc(p.a) + '</span></div>';
            }).join("") + '</div></div>';
          L.marker([s.lat, s.lng], { icon: icon }).addTo(mapLayer).bindPopup(html)
            .on("popupopen", function () {
              document.querySelectorAll(".mp-open").forEach(function (n) {
                n.onclick = function () { go("/poem/" + n.getAttribute("data-id")); };
              });
            });
        });
      }

      // ---- 滑块 ----
      var timeBox = $("#mapTime");
      if (!slots.length) { timeBox.remove(); drawPins(places); return; }

      timeBox.innerHTML =
        '<div class="mt-head">' +
          '<button class="mt-all active" id="mtAll">' + T("全览") + '</button>' +
          '<span class="mt-label" id="mtLabel"></span>' +
        '</div>' +
        '<div class="mt-hist" id="mtHist"></div>' +
        '<input type="range" class="mt-range" id="mtRange" min="0" max="' +
          (slots.length - 1) + '" value="0" step="1">' +
        '<div class="mt-ends"><span>' + esc(T.year(slots[0])) + '</span>' +
          '<span class="mt-hint">' + T("拖动滑块，每档五十年") + '</span>' +
          '<span>' + esc(T.year(slots[slots.length - 1] + BUCKET - 1)) + '</span></div>';

      var hist = $("#mtHist", host), range = $("#mtRange", host);
      var label = $("#mtLabel", host), allBtn = $("#mtAll", host);
      var bars = [];
      slots.forEach(function (y, i) {
        var c = (byslot[y] || []).length;
        var bar = el("button", "mt-bar" + (c ? "" : " zero"));
        bar.style.height = Math.max(2, Math.round(34 * c / peak)) + "px";
        bar.title = T("{a} – {b} 年", { a: T.year(y), b: T.year(y + BUCKET - 1) }) +
          " · " + (c ? T("此档 {n} 篇", { n: c }) : T("此档无诗"));
        bar.addEventListener("click", function () { range.value = i; pick(i); });
        hist.appendChild(bar);
        bars.push(bar);
      });

      function markBar(i) {
        bars.forEach(function (b, j) { b.classList.toggle("on", j === i); });
      }
      function pick(i) {
        var y = slots[i], list = byslot[y] || [];
        allBtn.classList.remove("active");
        markBar(i);
        label.innerHTML = '<b>' + esc(T("{a} – {b} 年",
          { a: T.year(y), b: T.year(y + BUCKET - 1) })) + '</b> · ' +
          (list.length ? T("此档 {n} 篇", { n: list.length }) : T("此档无诗"));
        drawPins(list);
      }
      function showAll() {
        allBtn.classList.add("active");
        markBar(-1);
        label.textContent = T("不分时间，{n} 篇", { n: places.length });
        drawPins(places);
      }
      range.addEventListener("input", function () { pick(+this.value); });
      allBtn.addEventListener("click", showAll);
      showAll();

      $("#mapNote").innerHTML =
        T("标记内数字为该地留存的诗文篇数；共 {n} 篇有据可考。", { n: places.length }) +
        (undated ? '<br><small class="caveat">' +
          T("另有 {n} 篇只知朝代、不知确年，按年筛选时不计入。", { n: undated }) +
          '</small>' : "");
    })["catch"](function (e) { if (ok()) failed(host, e); });
  }

  /* ---------- 配画 ----------
     不是又一种"切分诗的办法"（那是朝代、体裁、主题在做的事），
     而是一处收拢：凡是配过画的，都在这儿。
     配画永远只会是少数 —— 所以这一栏不该按"还差多少"来看，
     它本身就是一个小小的画诗合集。 */
  function viewArt() {
    var host = $("#view-art"), ok = guard();
    loading(host);
    Promise.all([Store.art(), Store.curated()]).then(function (res) {
      if (!ok()) return;
      var art = res[0] || [];
      if (!art.length) {
        host.innerHTML = '<p class="empty">' + T("还没有配过画的作品。") + '</p>';
        return;
      }
      host.innerHTML = '<p class="art-count"></p><div class="art-list" id="artList"></div>';
      return Promise.all(art.map(function (a) {
        return Store.poemById(a.poem)
          .then(function (p) { return p ? { a: a, p: p } : null; })
          ["catch"](function () { return null; });
      })).then(function (rows) {
        if (!ok()) return;
        rows = rows.filter(Boolean);
        $(".art-count", host).textContent = T("共 {n} 篇配了画", { n: rows.length });
        var list = $("#artList", host);
        rows.forEach(function (r) {
          var p = r.p, lines = (p.text || "").split("\n");
          var chars = (p.text || "").replace(/\s/g, "").length;
          var vertical = !isProse(p) && chars <= 60;
          var item = el("div", "art-item");
          item.innerHTML = artFigure(r.a) +
            '<div class="art-words">' +
              '<div class="daily-text' + (vertical ? " vertical" : " prose") + '">' +
              lines.map(function (l) { return '<p>' + esc(l) + '</p>'; }).join("") + '</div>' +
              '<div class="daily-attr">' +
              '<span class="attr-dyn">' + esc(T.dyn(p.dynasty)) + '</span>　' + esc(p.author) +
              '　《' + esc(p.title) + '》</div>' +
            '</div>';
          item.addEventListener("click", function (e) {
            if (e.target.closest("figcaption a")) return;   // 出处链接照常跳走
            go("/poem/" + p.id);
          });
          list.appendChild(item);
        });
      });
    })["catch"](function (e) { if (ok()) failed(host, e); });
  }

  // ---------- 检索 ----------
  function viewSearch(q) {
    var host = $("#view-search"), ok = guard();
    loading(host, T("检索中…"));
    // 有 BM25 分片就用它（正文入索引、按相关性排序），没有就退回旧的那套
    var M = Store.manifest();
    var run = M && M.bm25Buckets ? Store.searchBM25(q) : Store.search(q);
    run.then(function (rows) {
      if (!ok()) return;
      var ranked = M && M.bm25Buckets;
      host.innerHTML = '<p class="view-intro">' +
        T('"<b>{q}</b>" 命中 <b>{n}</b> 条', { q: esc(q), n: rows.length }) +
        '<br><small class="caveat">' +
        T(ranked ? "标题、作者与正文都在检索范围内，按相关度排序。"
                 : "检索范围为标题与作者；正文暂未建索引。") + '</small></p>' +
        '<div id="searchBody"></div>';
      var body = $("#searchBody");
      if (!rows.length) {
        body.innerHTML = '<p class="empty">' +
          T(ranked ? "没有匹配的作品。" : "没有匹配的标题或作者。") + '</p>';
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
      if (rows.length > 300) body.appendChild(el("p", "count", T("仅显示前 300 条")));
    })["catch"](function (e) { if (ok()) failed(host, e); });
  }

  /* ---------- 与此篇相近 ----------
     邻居是构建期算好的（tools/build_relevance.py）：字的二元组 TF-IDF
     加上句意的向量，两路合并。这里只负责把 id 换成看得懂的一行。

     邻居表里只有 id 和分数 —— 标题作者要现取。一次 Promise.all 抓齐，
     抓不到的那条就不显示，不让一条坏数据把整块拖垮。 */
  /* 只排名次，不印分数。
     排序用的是几套表的名次融合，展示分是余弦 —— 两者本来就不同调，
     并排放出来只会让人以为第三名比第一名更像。名次本身已经说完了要说的。 */
  function nearRow(card) {
    var row = el("div", "near-row",
      '<span class="nr-t">《' + esc(card.title) + '》</span>' +
      '<span class="nr-a">' + esc(T.dyn(card.dynasty)) + ' · ' + esc(card.author) + '</span>');
    row.addEventListener("click", function () { go("/poem/" + card.id); });
    return row;
  }
  function renderNear(p) {
    var host = $("#pdNear");
    if (!host) return;
    Store.near(p.id).then(function (rec) {
      if (!rec || !$("#pdNear")) return;
      host = $("#pdNear");
      var all = (rec.d || []).concat(rec.n || []);
      if (!all.length) return;
      return Promise.all(all.map(function (pair) {
        return Store.poemById(pair[0])["catch"](function () { return null; });
      })).then(function (poems) {
        var dn = (rec.d || []).length;
        var kin = [], dup = [];
        poems.forEach(function (q, i) {
          if (!q) return;
          (i < dn ? dup : kin).push([q, all[i][1]]);
        });
        if (!kin.length && !dup.length) return;
        var html = "";
        if (dup.length) {
          html += '<h4 class="near-h dup">' + T("同篇异录") + '</h4>' +
            '<p class="near-note">' + T("同一首作品在本库中的另一处著录，题名或归属或有出入。") +
            '</p><div class="near-list" id="nearDup"></div>';
        }
        if (kin.length) {
          html += '<h4 class="near-h">' + T("与此篇相近") + '</h4>' +
            '<div class="near-list" id="nearKin"></div>';
        }
        host.innerHTML = html;
        dup.forEach(function (x) { $("#nearDup", host).appendChild(nearRow(x[0])); });
        kin.forEach(function (x) { $("#nearKin", host).appendChild(nearRow(x[0])); });
      });
    })["catch"](function () { /* 没有邻居不是错，静默即可 */ });
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
      if (!p) throw new Error(T("未找到 {id}", { id: id }));
      var lines = (p.text || "").split("\n");
      var pys = p.pinyin ? p.pinyin.split("\n") : [];
      var hasPy = pys.length === lines.length;
      var todo = '<span style="color:var(--gold)">' + T("— 待补充 —") + '</span>';

      var sec = section(T("译　文"), p.translation ? esc(p.translation) : todo);
      sec += section(T("注　释"), (p.notes && p.notes.length)
        ? '<ul class="notes-list">' + p.notes.map(function (n) {
            return '<li><span class="term">' + esc(n.term) + '</span>' + esc(n.explain) + '</li>';
          }).join("") + '</ul>' : todo);
      sec += section(T("赏　析"), p.appreciation ? esc(p.appreciation) : todo);
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
            '<span class="seal">' + esc(T.dyn(p.dynasty)) + '</span>' +
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
        (hasPy ? '<button class="pinyin-toggle" id="pyToggle">' + T("隐藏拼音") + '</button>' : "") +
        (p.enrichedBy ? '<div class="ai-note">' +
          T("✦ 译文 / 注释 / 赏析 / 英译 由 AI（{by}）生成，待校订", { by: esc(p.enrichedBy) }) +
          '</div>' : "") +
        '<div class="pd-sections">' + sec + '</div>' +
        '<div class="pd-near" id="pdNear"></div>' +
        // 投稿口放在最下面：读完一篇，才谈得上想给它配什么画
        '<div class="pd-suggest"><a href="' + esc(artIssueUrl(p)) +
          '" target="_blank" rel="noopener" title="' +
          T("为这一篇推荐一幅画（会开一个 GitHub issue）") + '">✎ ' +
          T("推荐一幅画") + '</a></div>';

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
        this.textContent = hidden ? T("显示拼音") : T("隐藏拼音");
      });
      renderNear(p);
    })["catch"](function (e) {
      d.innerHTML = '<button class="close-btn" id="closeDetail">×</button>' +
        '<p class="loadfail">' + T("没能取到这首作品。") + '<br><small>' + esc(e.message) + '</small></p>';
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
               "word", "timeline", "map", "art", "search"];
  function show(v) {
    VIEWS.forEach(function (n) { $("#view-" + n).classList.toggle("hidden", n !== v); });
    document.querySelectorAll("#viewTabs > button[data-view]").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-view") === v);
    });
    /* 顶栏已经看不见那七栏了，得让下拉按钮自己说清楚当前在哪：
       在某个视角里，按钮就显示那个视角的名字。作者专页归到「作者」下。 */
    var lens = v === "author" ? "authors" : v;
    var hit = LENSES.filter(function (l) { return l.k === lens; })[0];
    var box = $("#lens"), lb = $("#lensBtn");
    if (box && lb) {
      box.classList.toggle("active", !!hit);
      lb.innerHTML = esc(hit ? T(hit.n) : T("更多视角")) +
        '<span class="lens-caret">\u25be</span>';
    }
    $("#lensMenu") && $("#lensMenu").querySelectorAll(".lens-item").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-view") === lens);
    });
    lensOpen(false);
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
      case "art":      show("art");      return viewArt();
      case "search":   show("search");   return viewSearch(parts.slice(1).join("/"));
      default:         show("home");     return viewHome();
    }
  }

  /* ---------- 更多视角 ----------
     首页留在顶栏，其余七种看法收进一个下拉。
     每一项带一句话说明 —— 菜单一展开就有地方交代"这一栏是干嘛的"，
     这是原先七个并排的标签给不了的。 */
  var LENSES = [
    { k: "library",  n: "诗文库",  d: "按朝代翻卡片" },
    { k: "authors",  n: "作者",    d: "一人一生的笔墨" },
    { k: "type",     n: "体裁",    d: "四言、律诗、词、曲" },
    { k: "theme",    n: "主题",    d: "送别、思乡、田园" },
    { k: "word",     n: "字词",    d: "循一个字走进诗篇" },
    { k: "timeline", n: "时间轴",  d: "沿年份看诗体流变" },
    { k: "map",      n: "地图",    d: "诗写在哪一片土地上" },
    { k: "art",      n: "配画",    d: "配过画的那些篇" }
  ];
  var TAB_LABEL = { home: "首页" };
  LENSES.forEach(function (l) { TAB_LABEL[l.k] = l.n; });

  function lensOpen(on) {
    var box = $("#lens"), btn = $("#lensBtn"), menu = $("#lensMenu");
    if (!box) return;
    box.classList.toggle("open", on);
    btn.setAttribute("aria-expanded", on ? "true" : "false");
    menu.hidden = !on;
  }
  function buildLens() {
    var menu = $("#lensMenu");
    if (!menu) return;
    menu.innerHTML = LENSES.map(function (l) {
      return '<button class="lens-item" role="menuitem" data-view="' + l.k + '">' +
        '<span class="li-n">' + esc(T(l.n)) + '</span>' +
        '<span class="li-d">' + esc(T(l.d)) + '</span></button>';
    }).join("");
    menu.querySelectorAll(".lens-item").forEach(function (b) {
      b.addEventListener("click", function () {
        lensOpen(false);
        go("/" + b.getAttribute("data-view"));
      });
    });
  }

  // ---------- 中 / EN ----------
  /* 只换界面。诗文、作者名、体裁名、主题词都不动 —— 那些是内容。
     切换后重走一遍 route()：所有视图都是现渲染的，不必刷新页面。 */
  function applyChrome() {
    document.querySelectorAll("#viewTabs button[data-view]").forEach(function (b) {
      var k = b.getAttribute("data-view");
      if (TAB_LABEL[k]) b.textContent = T(TAB_LABEL[k]);
    });
    var lb = $("#lensBtn");
    if (lb) lb.innerHTML = esc(T("更多视角")) + '<span class="lens-caret">\u25be</span>';
    buildLens();
    var box = $("#search");
    if (box) box.setAttribute("placeholder", T("搜索标题或作者…"));
    var foot = $(".site-footer");
    if (foot) foot.textContent = T("文本仅供学习研究之用");
    var stat = $("#bootStat"), m = Store.manifest();
    if (stat) stat.textContent = m ? T("收录 {n} 篇", { n: m.total })
                                   : T("古诗古文 · 溯源");
    var lt = $("#langToggle");
    if (lt) {
      lt.textContent = T.isEn() ? "中文" : "EN";
      lt.setAttribute("title", T.isEn() ? "切换为中文" : "Read the interface in English");
    }
  }

  // ---------- init ----------
  function init() {
    document.querySelectorAll("#viewTabs > button[data-view]").forEach(function (b) {
      b.addEventListener("click", function () {
        var v = b.getAttribute("data-view");
        go(v === "home" ? "/" : "/" + v);
      });
    });

    var lensBtn = $("#lensBtn");
    if (lensBtn) {
      lensBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        lensOpen(!$("#lens").classList.contains("open"));
      });
      // 点别处、按 Esc 都收起来
      document.addEventListener("click", function (e) {
        if (!$("#lens").contains(e.target)) lensOpen(false);
      });
      document.addEventListener("keydown", function (e) {
        if (e.key !== "Escape") return;
        if ($("#lens").classList.contains("open")) lensOpen(false);
      });
      // 键盘：下箭头展开并落到第一项
      lensBtn.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowDown") return;
        e.preventDefault();
        lensOpen(true);
        var first = $("#lensMenu .lens-item");
        if (first) first.focus();
      });
      $("#lensMenu").addEventListener("keydown", function (e) {
        var items = [].slice.call(this.querySelectorAll(".lens-item"));
        var i = items.indexOf(document.activeElement);
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          var j = (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
          items[j].focus();
        }
      });
    }

    var lt = $("#langToggle");
    if (lt) lt.addEventListener("click", function () {
      T.set(T.isEn() ? "zh" : "en");
      mapDone = false;              // 地图是一次性搭起来的，换语言要重搭
      themeMetaCache = null;
      applyChrome();
      route();
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

    applyChrome();
    Store.boot().then(function (m) {
      applyChrome();
      route();
    })["catch"](function (e) {
      $("#main").innerHTML = '<p class="loadfail">' + T("数据没能载入。") + '<br><small>' +
        esc(e.message) + '</small><br><small>若是本地打开的文件，请改用 http 方式访问' +
        '（在项目目录执行 python3 -m http.server）。</small></p>';
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
