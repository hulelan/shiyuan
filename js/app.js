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
      e.stopPropagation(); go("/explore?a=" + encodeURIComponent(c.a));
    });
    return card;
  }

  function poemLines(p) { return (p.text || "").split("\n"); }
  function isProse(p) {
    var lines = poemLines(p);
    // 赋与文一样是散体：整段成篇，不是一行一句。
    // 站上原先没有赋，这个分支从没走过；不算进来的话，
    // 六百多字的《前赤壁赋》会按诗行那样居中、还带 3px 字距。
    return p.genre === "文" || p.genre === "赋" ||
      lines.some(function (l) { return l.length > 22; });
  }

  /* ---------- 首页 ----------
     每次打开随机抽一篇，按名气加权（data/site/home.json，tools/build_home.py）。
     抽过的记在 homeHist 里：右边的竖条换下一篇，左边的回上一篇，
     回到头了左边就不出现。刷新页面重抽。 */
  var homeHist = [], homeAt = -1, homePool = null, authorPy = {};
  function drawHome(pool) {
    var total = 0, i;
    for (i = 0; i < pool.length; i++) total += pool[i][1];
    var r = Math.random() * total;
    for (i = 0; i < pool.length; i++) { r -= pool[i][1]; if (r <= 0) break; }
    var id = pool[Math.min(i, pool.length - 1)][0];
    if (homeHist.indexOf(id) >= 0 && pool.length > homeHist.length) return drawHome(pool);
    return id;
  }
  function authorName(name) {
    return (T.isEn() && authorPy[name]) ? authorPy[name] : name;
  }
  function viewHome() {
    var host = $("#view-home"), ok = guard();
    loading(host);
    Promise.all([homePool ? Promise.resolve(homePool) : Store.home(), Store.art(), Store.authorPy()])
    .then(function (res) {
      if (!ok()) return;
      var art = res[1] || []; authorPy = res[2] || {};
      var artMap = {};
      art.forEach(function (a) { artMap[a.poem] = a; });
      // 配了画的那几篇抽中的机会放大六倍：画是特意配的，不该一年才碰上一回
      homePool = res[0].map(function (r) { return artMap[r[0]] ? [r[0], r[1] * 6] : r; });
      if (!homePool.length) return failed(host, new Error("首页候选为空"));
      if (homeAt < 0) { homeHist.push(drawHome(homePool)); homeAt = 0; }
      return Store.poemById(homeHist[homeAt]).then(function (p) {
        if (!ok()) return;
        if (!p) return failed(host, new Error("找不到 " + homeHist[homeAt]));
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
          '<span class="attr-dyn">' + esc(T.dyn(p.dynasty)) + '</span>　' + esc(authorName(p.author)) +
          '　《' + esc(p.title) + '》</div>';
        var stage = '<div class="daily-stage">' +
          '<button class="daily-side prev' + (homeAt > 0 ? "" : " none") + '" id="dailyPrev" aria-label="' +
            T("上一篇") + '" title="' + T("上一篇") + '"><span>‹</span></button>' +
          '<div class="daily-main" id="dailyMain" role="link" tabindex="0" title="' + T("释　文") + '">' +
            verse + attr + '</div>' +
          '<button class="daily-side next" id="dailyNext" aria-label="' + T("换一篇") + '" title="' +
            T("换一篇") + '"><span>›</span></button>' +
          '</div>';

        host.className = "view";
        if (pic) {
          host.innerHTML = '<div class="daily paired">' + artFigure(pic) +
            '<div class="daily-words">' + stage + '</div></div>';
        } else {
          host.innerHTML = '<div class="daily">' + stage + '</div>';
        }

        function open() { go("/poem/" + p.id); }
        var main = $("#dailyMain");
        main.addEventListener("click", open);
        main.addEventListener("keydown", function (e) { if (e.key === "Enter") open(); });
        $("#dailyNext").addEventListener("click", function () {
          homeHist = homeHist.slice(0, homeAt + 1);
          homeHist.push(drawHome(homePool)); homeAt++;
          viewHome();
        });
        $("#dailyPrev").addEventListener("click", function () {
          if (homeAt > 0) { homeAt--; viewHome(); }
        });
      });
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

  /* ---------- 探索 ----------
     诗文库、作者、体裁、时间轴、地图、配画，原先六页，现在一页。
     上面一条时间轴，按朝代拖一段；左边地图，右边一列；体裁、诗人、
     有画无画是几枚筛子。整张表（data/site/explore.json）取一次放在内存里，
     换筛子只是重画，不再取数。地址里带着筛子（#/explore?d=6-8&f=七绝&a=李白），
     所以一个筛好的列表可以直接分享。 */
  var EX = null, exBuilt = false, exMap = null, exLayer = null, exRows = [], exShown = 0;
  var exState = { d: null, y: null, f: null, a: null, p: null, art: false };
  var EX_PAGE = 90;

  function exParse(q) {
    var s = { d: null, y: null, f: null, a: null, p: null, art: false };
    (q || "").split("&").forEach(function (kv) {
      var i = kv.indexOf("="); if (i < 0) return;
      var k = kv.slice(0, i), v = decodeURIComponent(kv.slice(i + 1));
      if (k === "d") { var m = /^(-?\d+)(?:-(-?\d+))?$/.exec(v); if (m) s.d = [+m[1], +(m[2] || m[1])]; }
      else if (k === "y") { var my = /^(-?\d+)~(-?\d+)$/.exec(v); if (my) s.y = [+my[1], +my[2]]; }
      else if (k === "f") s.f = v;
      else if (k === "a") s.a = v;
      else if (k === "p") s.p = +v;
      else if (k === "art") s.art = v === "1";
    });
    return s;
  }
  function exQuery(s) {
    var q = [];
    if (s.d) q.push("d=" + (s.d[0] === s.d[1] ? s.d[0] : s.d[0] + "-" + s.d[1]));
    if (s.y) q.push("y=" + s.y[0] + "~" + s.y[1]);
    if (s.f) q.push("f=" + encodeURIComponent(s.f));
    if (s.a) q.push("a=" + encodeURIComponent(s.a));
    if (s.p != null) q.push("p=" + s.p);
    if (s.art) q.push("art=1");
    return q.length ? "?" + q.join("&") : "";
  }
  function exSet(patch) {
    var s = {}; Object.keys(exState).forEach(function (k) { s[k] = exState[k]; });
    Object.keys(patch).forEach(function (k) { s[k] = patch[k]; });
    go("/explore" + exQuery(s));
  }
  function exDynName(o) {
    var d = EX.dyn.filter(function (x) { return x.o === o; })[0];
    return d ? T.dyn(d.k) : "";
  }
  function exMatch(r, skipPlace) {
    var s = exState;
    if (s.d && (r[3] < s.d[0] || r[3] > s.d[1])) return false;
    if (s.y && (r[5] == null || r[5] < s.y[0] || r[5] > s.y[1])) return false;
    if (s.f && r[4] !== s.f) return false;
    if (s.a && r[2] !== s.a) return false;
    if (s.art && !EX.art[r[0]]) return false;
    if (!skipPlace && s.p != null && r[7] !== s.p) return false;
    return true;
  }

  function viewExplore(q) {
    var host = $("#view-explore"), ok = guard();
    exState = exParse(q);
    if (EX && exBuilt) return exPaint();
    if (!exBuilt) loading(host);
    Promise.all([EX ? Promise.resolve(EX) : Store.explore(), Store.art(), Store.authorPy(),
                 loadLeaflet()["catch"](function () { return null; })])
    .then(function (res) {
      if (!ok()) return;
      EX = res[0]; authorPy = res[2] || {};
      EX.art = {}; (res[1] || []).forEach(function (a) { EX.art[a.poem] = a; });
      exBuild(host);
      exPaint();
    })["catch"](function (e) { if (ok()) failed(host, e); });
  }

  /* 骨架搭一次：时间轴、筛子、地图、列表。换语言时拆了重搭。 */
  function exBuild(host) {
    if (exMap) { exMap.remove(); exMap = null; exLayer = null; }
    host.innerHTML =
      '<div class="ex-time" id="exTime"></div>' +
      '<div class="ex-chips" id="exChips"></div>' +
      '<div class="ex-body">' +
        '<div class="ex-map"><div id="exMapCanvas"></div></div>' +
        '<div class="ex-list">' +
          '<div class="ex-now" id="exNow"></div>' +
          '<div class="grid" id="exGrid"></div>' +
          '<div id="exMore"></div>' +
        '</div>' +
      '</div>';
    exBuildTime();
    exBuildChips();
    if (typeof L !== "undefined") {
      exMap = L.map("exMapCanvas", { scrollWheelZoom: false, zoomControl: true }).setView([33.5, 112.5], 4);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        { maxZoom: 10, attribution: "© OpenStreetMap" }).addTo(exMap);
      exLayer = L.layerGroup().addTo(exMap);
      exMap.on("zoomend", exPaintMap);
    } else {
      $("#exMapCanvas").innerHTML = '<div class="map-fallback">' +
        T("地图组件需要联网加载（Leaflet / OpenStreetMap）。") + '</div>';
    }
    // 拖动列表时，上面那行说你现在在哪个朝代、哪个年代
    window.addEventListener("scroll", exNowLine, { passive: true });
    // 列表到底了就再铺一批
    var more = $("#exMore");
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) {
        if (es.some(function (e) { return e.isIntersecting; })) exDrawMore();
      }, { rootMargin: "600px" }).observe(more);
    }
    exBuilt = true;
  }

  /* 时间轴：每个朝代一格，宽度随篇数开方。按下拖到另一格，选一段；
     点已选的单格，取消。 */
  /* ---------- 时间轴 ----------
     一条年尺是主角，朝代格子贴在它上面，同一把尺。尺上拖一个几十年的窗，
     列表就是窗里那些年的诗；点朝代格子则是整个朝代。朝代之间的空白
     （秦汉、南北朝隋、明）库里没有诗，格子点了去维基百科，格子角上的 ↗
     也是。有诗的地方点了筛，没诗的地方点了读。
     尺不是均匀的：先秦一千年、唐三百年，按篇数开方分宽度，空白给一小段。
     格子的像素位置排好之后量回来，年份和像素之间就是分段线性的对应。 */
  var EX_SPAN = { xianqin: [-1100, -221], weijin: [220, 420], tang: [618, 907], wudai: [907, 960],
                  song: [960, 1279], yuan: [1279, 1368], qing: [1644, 1912] };
  var EX_WIKI = {
    xianqin: ["先秦", "Zhou_dynasty"], weijin: ["魏晋", "Jin_dynasty_(266–420)"], tang: ["唐朝", "Tang_dynasty"],
    wudai: ["五代十国", "Five_Dynasties_and_Ten_Kingdoms_period"], song: ["宋朝", "Song_dynasty"],
    yuan: ["元朝", "Yuan_dynasty"], qing: ["清朝", "Qing_dynasty"],
    qinhan: ["汉朝", "Han_dynasty"], nanbei: ["南北朝", "Northern_and_Southern_dynasties"], ming: ["明朝", "Ming_dynasty"]
  };
  var EX_GAP_NAME = { qinhan: { zh: "秦汉", en: "Qin · Han" }, nanbei: { zh: "南北朝 · 隋", en: "Southern & Northern · Sui" }, ming: { zh: "明", en: "Ming" } };
  var exSegs = [], exWin = 50, exDrag = null;
  function wikiUrl(key) {
    var w = EX_WIKI[key]; if (!w) return "";
    return T.isEn() ? "https://en.wikipedia.org/wiki/" + w[1] : "https://zh.wikipedia.org/wiki/" + encodeURIComponent(w[0]);
  }
  function exBuildTime() {
    var box = $("#exTime"); box.innerHTML = '<div class="ex-dyn" id="exDyn"></div>' +
      '<canvas class="ex-ruler" id="exRuler"></canvas>' +
      '<div class="ex-win"><span>' + esc(T("窗宽")) + '</span>' +
        [10, 50, 100].map(function (w) { return '<button class="chip ex-w" data-w="' + w + '">' + w + '</button>'; }).join("") +
      '</div>';
    try { exWin = +localStorage.getItem("exWin") || 50; } catch (e) {}
    var row = $("#exDyn"), peak = Math.max.apply(null, EX.dyn.map(function (d) { return d.c; }));
    var gapNames = ["qinhan", "nanbei", "ming"], gi = 0, prev = null;
    exSegs = [];
    EX.dyn.forEach(function (d) {
      var sp = EX_SPAN[d.slug]; if (!sp) return;
      if (prev && sp[0] > prev[1] + 1) {
        var g = gapNames[gi++] || "gap", seg = el("a", "ex-seg gap");
        seg.href = wikiUrl(g) || "#"; seg.target = "_blank"; seg.rel = "noopener";
        seg.style.flexGrow = "0.3";
        var nm = EX_GAP_NAME[g] || { zh: "", en: "" };
        seg.innerHTML = '<b>' + esc(T.isEn() ? nm.en : nm.zh) + ' ↗</b><i>' + esc(T.year(prev[1]) + " – " + T.year(sp[0])) + '</i>';
        seg.title = T("库中无此时期作品，点开维基百科");
        row.appendChild(seg);
        exSegs.push({ el: seg, y0: prev[1], y1: sp[0], gap: true });
      }
      var s = el("div", "ex-seg");
      s.style.flexGrow = (0.35 + Math.sqrt(d.c / peak)).toFixed(3);
      s.innerHTML = '<b>' + esc(T.dyn(d.k)) + '</b><i>' + esc(d.span) + '</i>' +
        '<a class="ex-wiki" href="' + esc(wikiUrl(d.slug)) + '" target="_blank" rel="noopener" title="' +
          esc(T("维基百科")) + '">↗</a>';
      s.addEventListener("click", function (e) {
        if (e.target.closest(".ex-wiki")) return;
        if (exState.d && exState.d[0] === d.o && exState.d[1] === d.o && !exState.y) exSet({ d: null });
        else exSet({ d: [d.o, d.o], y: null });
      });
      row.appendChild(s);
      exSegs.push({ el: s, y0: sp[0], y1: sp[1], o: d.o });
      prev = sp;
    });
    box.querySelectorAll(".ex-w").forEach(function (b) {
      b.addEventListener("click", function () {
        exWin = +b.getAttribute("data-w");
        try { localStorage.setItem("exWin", exWin); } catch (e) {}
        if (exState.y) { var mid = (exState.y[0] + exState.y[1]) / 2; exSet({ y: exWinAt(mid) }); }
        else exPaintTime();
      });
    });
    var ruler = $("#exRuler");
    ruler.addEventListener("pointerdown", function (e) {
      exDrag = true; ruler.setPointerCapture(e.pointerId); e.preventDefault();
      exDragTo(e);
    });
    ruler.addEventListener("pointermove", function (e) { if (exDrag) exDragTo(e); });
    function up(e) {
      if (!exDrag) return; exDrag = null;
      var y = exYearAt(e.clientX); if (y == null) return;
      exSet({ y: exWinAt(y), d: null });
    }
    ruler.addEventListener("pointerup", up);
    ruler.addEventListener("pointercancel", function () { exDrag = null; exPaintTime(); });
    window.addEventListener("resize", exPaintTime);
  }
  function exWinAt(mid) {
    var a = Math.round(mid - exWin / 2), b = a + exWin;
    return [a, b];
  }
  function exDragTo(e) {
    var y = exYearAt(e.clientX); if (y == null) return;
    exDrawRuler(exWinAt(y));
  }
  // measure the boxes, then year <-> x is linear inside each box
  function exScale() {
    var box = $("#exRuler").getBoundingClientRect();
    return exSegs.map(function (s) {
      var r = s.el.getBoundingClientRect();
      return { x0: r.left - box.left, x1: r.right - box.left, y0: s.y0, y1: s.y1, gap: s.gap, o: s.o };
    });
  }
  function exXOf(y, sc) {
    for (var i = 0; i < sc.length; i++) {
      var s = sc[i];
      if (y >= s.y0 && y <= s.y1) return s.x0 + (s.x1 - s.x0) * (y - s.y0) / (s.y1 - s.y0);
    }
    if (y < sc[0].y0) return sc[0].x0;
    return sc[sc.length - 1].x1;
  }
  function exYearAt(clientX) {
    var sc = exScale(), box = $("#exRuler").getBoundingClientRect(), x = clientX - box.left;
    for (var i = 0; i < sc.length; i++) {
      var s = sc[i];
      if (x >= s.x0 && x <= s.x1) return Math.round(s.y0 + (s.y1 - s.y0) * (x - s.x0) / (s.x1 - s.x0));
    }
    if (x < sc[0].x0) return sc[0].y0;
    return sc[sc.length - 1].y1;
  }
  function exDrawRuler(win) {
    var cv = $("#exRuler"); if (!cv || !exSegs.length) return;
    var W = cv.clientWidth, H = 46, dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr;
    var c = cv.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    var sc = exScale();
    var css = getComputedStyle(document.documentElement);
    var ink = css.getPropertyValue("--ink-soft").trim() || "#8a8375", red = css.getPropertyValue("--cinnabar").trim() || "#a8322d";
    var line = css.getPropertyValue("--line").trim() || "#ddd";
    // density per decade, only where the other filters let through
    var bins = {}, peak = 1;
    EX.poems.forEach(function (r) {
      if (r[5] == null) return;
      if (exState.f && r[4] !== exState.f) return;
      if (exState.a && r[2] !== exState.a) return;
      if (exState.art && !EX.art[r[0]]) return;
      var b = Math.floor(r[5] / 10) * 10; bins[b] = (bins[b] || 0) + 1; if (bins[b] > peak) peak = bins[b];
    });
    c.fillStyle = ink; c.globalAlpha = 0.55;
    Object.keys(bins).forEach(function (b) {
      var x0 = exXOf(+b, sc), x1 = exXOf(+b + 10, sc), h = Math.max(1, 30 * Math.sqrt(bins[b] / peak));
      c.fillRect(x0, 34 - h, Math.max(1, x1 - x0 - 0.5), h);
    });
    c.globalAlpha = 1;
    // gaps hatched faintly, so the eye reads them as "nothing here"
    sc.forEach(function (s) { if (s.gap) { c.fillStyle = line; c.fillRect(s.x0, 33, s.x1 - s.x0, 1); } });
    c.fillStyle = line; c.fillRect(0, 34, W, 1);
    // ticks every century inside the boxes
    c.fillStyle = ink; c.font = "9px " + (css.getPropertyValue("--serif-en").trim() || "serif"); c.textAlign = "center";
    sc.forEach(function (s) {
      if (s.gap) return;
      var step = (s.y1 - s.y0) > 400 ? 200 : 100;
      for (var y = Math.ceil(s.y0 / step) * step; y <= s.y1; y += step) {
        var x = exXOf(y, sc); c.fillRect(x, 34, 1, 4);
        if ((s.x1 - s.x0) / ((s.y1 - s.y0) / step) > 34) c.fillText(T.year(y), x, 45);
      }
    });
    // the window
    if (win) {
      var a = exXOf(win[0], sc), b = exXOf(win[1], sc);
      c.fillStyle = red; c.globalAlpha = 0.16; c.fillRect(a, 0, Math.max(2, b - a), 34);
      c.globalAlpha = 1; c.fillRect(a, 0, 1, 34); c.fillRect(Math.max(a + 1, b - 1), 0, 1, 34);
    }
  }
  function exPaintTime() {
    exSegs.forEach(function (s) {
      if (s.gap) return;
      s.el.classList.toggle("on", !!exState.d && s.o >= exState.d[0] && s.o <= exState.d[1]);
    });
    document.querySelectorAll("#exTime .ex-w").forEach(function (b) {
      b.classList.toggle("active", +b.getAttribute("data-w") === exWin);
    });
    exDrawRuler(exState.y);
  }

  /* 筛子：体裁一排，诗人一个输入框（带候选），配画一枚，地点选了才出现。 */
  function exBuildChips() {
    var box = $("#exChips"); box.innerHTML = "";
    var forms = {}; EX.poems.forEach(function (r) { if (r[4]) forms[r[4]] = (forms[r[4]] || 0) + 1; });
    var fl = Object.keys(forms).sort(function (a, b) { return forms[b] - forms[a]; });
    var row = el("div", "ex-forms");
    var all = el("button", "chip", esc(T("全部")));
    all.setAttribute("data-f", "");
    all.addEventListener("click", function () { exSet({ f: null }); });
    row.appendChild(all);
    fl.forEach(function (f) {
      var b = el("button", "chip", esc(f));
      b.setAttribute("data-f", f);
      b.addEventListener("click", function () { exSet({ f: exState.f === f ? null : f }); });
      row.appendChild(b);
    });
    box.appendChild(row);

    var row2 = el("div", "ex-more");
    var authors = {}; EX.poems.forEach(function (r) { if (r[2] && r[2] !== "佚名") authors[r[2]] = 1; });
    var wrap = el("span", "ex-poet");
    wrap.innerHTML = '<input list="exPoets" id="exPoet" placeholder="' + esc(T("诗人…")) + '" autocomplete="off">' +
      '<datalist id="exPoets">' + Object.keys(authors).sort().map(function (a) {
        return '<option value="' + esc(a) + '">' + (T.isEn() && authorPy[a] ? esc(authorPy[a]) : "") + '</option>';
      }).join("") + '</datalist>';
    row2.appendChild(wrap);
    var poet = $("#exPoet", wrap);
    poet.addEventListener("change", function () {
      var v = this.value.trim();
      if (!v) return exSet({ a: null });
      if (authors[v]) exSet({ a: v });
    });
    var art = el("button", "chip ex-art", esc(T("配图")));
    art.addEventListener("click", function () { exSet({ art: !exState.art }); });
    row2.appendChild(art);
    var place = el("button", "chip ex-place");
    place.addEventListener("click", function () { exSet({ p: null }); });
    row2.appendChild(place);
    var clear = el("button", "chip ex-clear", "×");
    clear.title = T("清除筛选");
    clear.addEventListener("click", function () { go("/explore"); });
    row2.appendChild(clear);
    box.appendChild(row2);
  }
  function exPaintChips() {
    document.querySelectorAll("#exChips .ex-forms .chip").forEach(function (b) {
      b.classList.toggle("active", (b.getAttribute("data-f") || null) === exState.f);
    });
    var poet = $("#exPoet"); if (poet && document.activeElement !== poet) poet.value = exState.a || "";
    $("#exChips .ex-art").classList.toggle("active", exState.art);
    var pl = $("#exChips .ex-place"), p = exState.p != null && EX.places[exState.p];
    pl.hidden = !p;
    if (p) pl.textContent = p.n + " ×";
    $("#exChips .ex-clear").hidden = !(exState.d || exState.y || exState.f || exState.a || exState.p != null || exState.art);
  }

  /* 地图上的点是除地点外其余筛子筛过的，所以换地点不必先清掉地点。
     拉远了一千多个地名叠成一团，于是按缩放级别并格：一格里只有一地就是
     那一地，点它筛列表；一格里有好几地，点它放大过去。 */
  function exCell() {
    var z = exMap.getZoom();
    return z >= 8 ? 0 : z >= 6 ? 0.5 : z >= 5 ? 1 : 2;
  }
  function exPaintMap() {
    if (!exLayer) return;
    exLayer.clearLayers();
    var cell = exCell(), by = {};
    EX.poems.forEach(function (r) {
      if (r[7] < 0 || !exMatch(r, true)) return;
      var p = EX.places[r[7]];
      var k = cell ? Math.round(p.lat / cell) + "," + Math.round(p.lng / cell) : "p" + r[7];
      var g = by[k] || (by[k] = { n: 0, lat: 0, lng: 0, places: {} });
      g.n++; g.lat += p.lat; g.lng += p.lng; g.places[r[7]] = 1;
    });
    Object.keys(by).forEach(function (k) {
      var g = by[k], ids = Object.keys(g.places), one = ids.length === 1 ? +ids[0] : null;
      var on = one != null && exState.p === one;
      var size = g.n > 60 ? 32 : g.n > 15 ? 27 : 22;
      var icon = L.divIcon({ className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2],
        html: '<div class="map-pin' + (on ? " on" : "") + (one == null ? " many" : "") +
          '" style="width:' + size + 'px;height:' + size + 'px">' + g.n + '</div>' });
      var title = one != null ? EX.places[one].n + (EX.places[one].m ? "（" + EX.places[one].m + "）" : "")
                              : T("{n} 处", { n: ids.length });
      var at = [g.lat / g.n, g.lng / g.n];
      L.marker(at, { icon: icon, title: title }).addTo(exLayer).on("click", function () {
        if (one != null) exSet({ p: on ? null : one });
        else exMap.setView(at, Math.min(exMap.getZoom() + 2, 10));
      });
    });
  }

  function exPaint() {
    exPaintTime(); exPaintChips(); exPaintMap();
    exRows = EX.poems.filter(function (r) { return exMatch(r); });
    var grid = $("#exGrid"); grid.innerHTML = ""; exShown = 0;
    if (!exRows.length) grid.innerHTML = '<p class="empty">' + T("这里还没有作品。") + '</p>';
    exDrawMore();
    exNowLine();
  }
  function exCard(r) {
    var card = el("div", "card" + (EX.art[r[0]] ? " with-img" : ""));
    card.setAttribute("data-d", r[3]); if (r[5] != null) card.setAttribute("data-y", r[5]);
    var yr = r[5] != null ? '<span class="yr">' + esc(T.year(r[5])) + '</span>' : "";
    var pic = EX.art[r[0]];
    card.innerHTML =
      (pic ? '<img class="card-img" src="assets/art/' + esc(pic.file) + '" alt="" loading="lazy">' : "") +
      '<span class="dyn">' + esc(exDynName(r[3])) + (r[4] ? ' · ' + esc(r[4]) : "") + yr + '</span>' +
      '<h3>' + esc(r[1]) + '</h3>' +
      '<span class="' + (r[2] && r[2] !== "佚名" ? "author author-link" : "author") + '">' + esc(authorName(r[2])) + '</span>' +
      (r[6] ? '<div class="excerpt">' + esc(r[6]) + '</div>' : "") +
      "";
    card.addEventListener("click", function () { go("/poem/" + r[0]); });
    var al = card.querySelector(".author-link");
    if (al) al.addEventListener("click", function (e) { e.stopPropagation(); exSet({ a: r[2] }); });
    return card;
  }
  function exDrawMore() {
    if (!exRows.length || exShown >= exRows.length) return;
    var grid = $("#exGrid"), end = Math.min(exShown + EX_PAGE, exRows.length);
    for (var i = exShown; i < end; i++) grid.appendChild(exCard(exRows[i]));
    exShown = end;
  }
  /* 列表顶上那一行：第一张还露着的卡片属于哪个朝代、哪个十年。 */
  function exNowLine() {
    var now = $("#exNow"); if (!now || !EX) return;
    var cards = $("#exGrid").children, top = now.getBoundingClientRect().bottom + 4;
    var lo = 0, hi = cards.length - 1, hit = null;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1, r = cards[mid].getBoundingClientRect();
      if (r.bottom < top) lo = mid + 1; else { hit = cards[mid]; hi = mid - 1; }
    }
    if (!hit || !hit.getAttribute) { now.textContent = ""; return; }
    var o = +hit.getAttribute("data-d"), y = hit.getAttribute("data-y");
    var dec = y != null ? Math.floor(+y / 10) * 10 : null;
    var when = dec == null ? "" : T.isEn() ? (dec >= 0 ? dec + "s" : T.year(dec)) : T.year(dec) + " 年代";
    now.textContent = exDynName(o) + (when ? "　" + when : "");
  }

  // ---------- 检索 ----------
  function viewSearch(q) {
    var host = $("#view-search"), ok = guard();
    loading(host, T("检索中…"));
    // 有 BM25 分片就用它（正文入索引、按相关性排序），没有就退回旧的那套
    var M = Store.manifest();
    var run = M && M.bm25Buckets ? Store.searchBM25(q) : Store.search(q);
    run.then(function (rows) {
      var ranked = M && M.bm25Buckets;
      if (!ok()) return;
      host.innerHTML = '<p class="view-intro">' +
        T('"<b>{q}</b>" 命中 <b>{n}</b> 条', { q: esc(q), n: rows.length }) + '</p>' +
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

  /* ---------- 行内笺注 ----------
     编辑层里的 notes 是 [{term, explain}]，term 多半是原文里一字不差的一段。
     从前它们只堆在「注　释」那一栏里 —— 读到"冯虚御风"想知道是什么意思，
     得先记住这四个字，再滚到下面去翻。莎剧的笺注本不是这么做的：
     难字就在字底下标一道线，看一眼就走。

     这里把 term 在正文里定位，包成可点的 span。规则三条：
       · 长的先匹配 —— 有"明月之诗"就不该只标出"明月"
       · 每条注只标第一次出现的地方 —— 通篇每个"之"都画线，等于没画
       · 已经标过的字不再重叠标注
     定不了位的（约 5%：并列词条、篇名之类）照旧留在下面那一栏，不丢。 */
  function buildGlossIndex(notes) {
    var list = (notes || []).filter(function (n) {
      return n && n.term && String(n.term).trim() && n.explain;
    }).map(function (n, i) {
      return { i: i, term: String(n.term).trim(), explain: String(n.explain) };
    });
    // 长的排前面：匹配时先来先得，长词才不会被短词抢走
    list.sort(function (a, b) { return b.term.length - a.term.length; });
    return list;
  }

  /* 一行原文 → 带注音、带笺注的 HTML。

     注音用 <ruby>，不再把一整行拼音堆在汉字上面那一块。
     从前是「一块拼音 + 一块汉字」，两块各自折行：绝句只有五七个字，
     两行刚好对得上；可《前赤壁赋》一段一百二十四字，两块一折，
     拼音与汉字就彻底错开 —— 上面十行罗马字，下面十行汉字，
     谁也不知道哪个音配哪个字。
     ruby 是浏览器专为这件事做的：注音焊在字上，怎么折行都跟着走。

     生成拼音时用的是 errors=lambda x: list(x)，所以标点也各占一个位置，
     拼音与汉字严格一一对应（已在全库核对）。标点头上不注音 —— 
     在「。」上面再印一个「。」没有意义。 */
  function annotate(line, pys, index, used) {
    var marks = [];
    index.forEach(function (g) {
      if (used[g.i]) return;
      var at = line.indexOf(g.term);
      if (at < 0) return;
      for (var k = 0; k < marks.length; k++) {
        if (at < marks[k].end && at + g.term.length > marks[k].start) return;
      }
      marks.push({ start: at, end: at + g.term.length, g: g });
      used[g.i] = true;
    });
    marks.sort(function (a, b) { return a.start - b.start; });

    function chars(from, to) {
      var out = "";
      for (var i = from; i < to; i++) {
        var ch = line[i], py = pys ? pys[i] : null;
        // 标点、空白、以及拼音与字面相同的（转不出音的字），都不注
        if (!py || py === ch || !/[一-鿿]/.test(ch)) { out += esc(ch); continue; }
        out += "<ruby>" + esc(ch) + "<rt>" + esc(py) + "</rt></ruby>";
      }
      return out;
    }

    if (!marks.length) return chars(0, line.length);
    var out = "", at = 0;
    marks.forEach(function (m) {
      out += chars(at, m.start);
      out += '<span class="gl" tabindex="0" role="button" data-g="' + m.g.i +
             '" aria-label="' + esc(m.g.term + "：" + m.g.explain) + '">' +
             chars(m.start, m.end) + '</span>';
      at = m.end;
    });
    return out + chars(at, line.length);
  }

  /* 一个浮标，随点随移。不给每条注各做一个，是为了省 DOM ——
     《前赤壁赋》有四十三条注。 */
  /* 文档级的监听只挂一次。attachGloss 每开一篇就会调一次，
     每次都 addEventListener 的话，开过二十篇就有二十个监听在跑。 */
  var glossEsc = null, glossAway = null;

  function attachGloss(host, index) {
    var tip = el("div", "gl-tip");
    tip.hidden = true;
    host.appendChild(tip);
    var open = null;

    function hide() {
      tip.hidden = true;
      if (open) open.classList.remove("on");
      open = null;
    }
    function show(span) {
      var g = index.filter(function (x) { return x.i === +span.getAttribute("data-g"); })[0];
      if (!g) return;
      if (open === span) return hide();
      if (open) open.classList.remove("on");
      open = span;
      span.classList.add("on");
      tip.innerHTML = '<b>' + esc(g.term) + '</b>' + esc(g.explain);
      tip.hidden = false;

      // 贴着被点的词放：左右不越出浮层，上下不越出视窗。
      // 先放词下面；下面塞不下就翻到上面；两边都塞不下就往视窗里挤。
      var hb = host.getBoundingClientRect(), sb = span.getBoundingClientRect();
      tip.style.left = "0px";
      tip.style.top = "0px";
      var w = tip.offsetWidth, h = tip.offsetHeight, PAD = 10;

      var left = sb.left - hb.left + sb.width / 2 - w / 2;
      left = Math.max(PAD, Math.min(left, hb.width - w - PAD));
      tip.style.left = Math.round(left) + "px";

      var topVp = sb.bottom + 7;                       // 视窗坐标
      if (topVp + h + PAD > window.innerHeight) {
        topVp = sb.top - h - 7;                        // 翻到上面
      }
      topVp = Math.max(PAD, Math.min(topVp, window.innerHeight - h - PAD));
      tip.style.top = Math.round(topVp - hb.top) + "px";
    }

    host.querySelectorAll(".gl").forEach(function (sp) {
      sp.addEventListener("click", function (e) { e.stopPropagation(); show(sp); });
      sp.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); show(sp); }
      });
    });

    if (glossEsc) document.removeEventListener("keydown", glossEsc, true);
    if (glossAway) document.removeEventListener("click", glossAway, true);

    /* Esc 用捕获阶段，并且开着注的时候要拦下来。
       否则同一下 Esc 会先被浮层的关闭键接走 —— 想收起一条注，
       整首诗跟着关掉了。 */
    glossEsc = function (e) {
      if (e.key !== "Escape" || tip.hidden) return;
      e.stopPropagation();
      hide();
    };
    glossAway = function (e) {
      if (tip.hidden) return;
      if (!e.target.closest || (!e.target.closest(".gl") && !e.target.closest(".gl-tip"))) hide();
    };
    document.addEventListener("keydown", glossEsc, true);
    document.addEventListener("click", glossAway, true);
    return hide;
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

    Promise.all([Store.poemById(id), Store.art()]).then(function (res) {
      var p = res[0];
      if (!p) throw new Error(T("未找到 {id}", { id: id }));
      var pic = (res[1] || []).filter(function (a) { return a.poem === p.id; })[0];
      var lines = (p.text || "").split("\n");
      var pys = p.pinyin ? p.pinyin.split("\n") : [];
      var hasPy = pys.length === lines.length;
      /* 散体默认收起拼音。诗是一行五七个字，注音在上面正好；
         《前赤壁赋》一段一百三十字，整段注音铺在上面，篇幅翻倍，
         想读文章的人反而先被挡住。要看的人点一下就有。 */
      var prosePoem = p.genre === "文" || p.genre === "赋";
      var glossIdx = buildGlossIndex(p.notes), glossUsed = {};
      /* 正文得先排 —— annotate 一边排一边把用掉的注记进 glossUsed，
         下面那一栏要靠它标出"哪几条已经在正文里点得到了"。
         顺序反了不会报错，只是全都标不上，最难查的那种。 */
      var bodyHtml = lines.map(function (ln, i) {
        var py = hasPy ? (pys[i] || "").split(" ") : null;
        // 拼音的个数得跟字数对上，对不上就整行不注 —— 错位的注音比没有还坏
        if (py && py.length !== ln.length) py = null;
        return '<div class="pd-line"><span class="zh">' +
          annotate(ln, py, glossIdx, glossUsed) + '</span></div>';
      }).join("");
      var todo = '<span style="color:var(--gold)">' + T("— 待补充 —") + '</span>';

      var sec = section(T("译　文"), p.translation ? esc(p.translation) : todo);
      // 这一栏留着当全表：正文里点得到的，和定不了位的，都在这儿。
      // 已经落进正文的那些标一个点，省得读者以为漏了。
      sec += section(T("注　释"), (p.notes && p.notes.length)
        ? '<p class="notes-hint">' + T("正文里带虚线的字词可以直接点开；下面是全部注释。") + '</p>' +
          '<ul class="notes-list">' + p.notes.map(function (n, i) {
            var inline = glossUsed[glossIdx.filter(function (g) {
              return g.term === String(n.term || "").trim();
            }).map(function (g) { return g.i; })[0]];
            return '<li' + (inline ? ' class="inlined"' : "") + '><span class="term">' +
              esc(n.term) + '</span>' + esc(n.explain) + '</li>';
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
              ? '<span class="pd-author-link" id="pdAuthor">' + esc(authorName(p.author)) + '</span>'
              : esc(authorName(p.author))) +
            '<span class="seal">' + esc(T.dyn(p.dynasty)) + '</span>' +
            (p.form ? '<span class="seal jade">' + esc(p.form) + '</span>' : "") +
          '</div>' +
          (p.yearLabel ? '<div class="pd-meta pd-year">' + esc(p.yearLabel) + '</div>' : "") +
          (p.place && p.place.name ? '<div class="pd-place">✎ ' + esc(p.place.name) +
            (p.place.modern ? '（' + esc(p.place.modern) + '）' : "") + '</div>' : "") +
        '</div>' +
        '<div class="pd-poem' + (hasPy && !prosePoem ? "" : " no-pinyin") +
          (prosePoem ? " prose" : "") + '" id="pdPoem">' +
          bodyHtml +
        '</div>' +
        (hasPy ? '<button class="pinyin-toggle" id="pyToggle">' +
          T(prosePoem ? "显示拼音" : "隐藏拼音") + '</button>' : "") +
        (pic ? '<div class="pd-art">' + artFigure(pic) + '</div>' : "") +
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
      if (a) a.addEventListener("click", function () { go("/explore?a=" + encodeURIComponent(p.author)); });
      if (hasPy) $("#pyToggle").addEventListener("click", function () {
        var hidden = $("#pdPoem").classList.toggle("no-pinyin");
        this.textContent = hidden ? T("显示拼音") : T("隐藏拼音");
      });
      if (glossIdx.length) attachGloss(d, glossIdx);
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
  var VIEWS = ["home", "explore", "search"];
  function show(v) {
    VIEWS.forEach(function (n) { $("#view-" + n).classList.toggle("hidden", n !== v); });
    document.querySelectorAll("#viewTabs > button[data-view]").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-view") === v);
    });
  }
  function go(path, replace) {
    if (replace) location.replace("#" + path); else location.hash = path;
  }

  function route() {
    var raw = location.hash.replace(/^#/, "") || "/";
    var parts = raw.split("?")[0].split("/").filter(Boolean).map(decodeURIComponent);
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

    // 旧地址各归其位：都是探索页上的某个筛法
    var dynOf = function (slug) {
      var d = (Store.manifest().dynasties || []).filter(function (x) { return x.slug === slug; })[0];
      return d ? "?d=" + d.o : "";
    };
    switch (head) {
      case "explore":  show("explore");  return viewExplore((raw.split("?")[1] || ""));
      case "library":  return go("/explore" + (parts[1] ? dynOf(parts[1].split("?")[0]) : ""), true);
      case "author":   return go("/explore?a=" + encodeURIComponent(parts[1] || ""), true);
      case "type":     return go("/explore" + (parts[1] ? "?f=" + encodeURIComponent(parts[1]) : ""), true);
      case "art":      return go("/explore?art=1", true);
      case "authors": case "theme": case "word": case "timeline": case "map":
                       return go("/explore", true);
      case "search":   show("search");   return viewSearch(parts.slice(1).join("/"));
      default:         show("home");     return viewHome();
    }
  }

  var TAB_LABEL = { home: "首页", explore: "探索" };

  // ---------- 中 / EN ----------
  /* 只换界面。诗文、作者名、体裁名、主题词都不动 —— 那些是内容。
     切换后重走一遍 route()：所有视图都是现渲染的，不必刷新页面。 */
  function applyChrome() {
    document.querySelectorAll("#viewTabs button[data-view]").forEach(function (b) {
      var k = b.getAttribute("data-view");
      if (TAB_LABEL[k]) b.textContent = T(TAB_LABEL[k]);
    });
    var box = $("#search");
    if (box) box.setAttribute("placeholder", T("搜索标题或作者…"));
    var foot = $(".site-footer");
    if (foot) foot.textContent = T("文本仅供学习研究之用");
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

    var lt = $("#langToggle");
    if (lt) lt.addEventListener("click", function () {
      T.set(T.isEn() ? "zh" : "en");
      exBuilt = false;              // 探索页是一次性搭起来的，换语言要重搭
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
