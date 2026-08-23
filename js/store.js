/* 诗渊 — 数据层
 *
 * 网页不再持有全量语料。这里按视图所需，从 data/site/ 抓对应的分片，
 * 抓过的记在 cache 里。所有"扫全库"的统计都已在 tools/build_site_data.py
 * 算好，前端只做取用与拼装。
 */
window.Store = (function () {
  "use strict";

  var BASE = "data/site/";
  var M = null;            // manifest
  var cache = {};          // path -> Promise
  var slugOf = {};         // 朝代序 -> 文件名
  var nameOf = {};         // 朝代序 -> 朝代名

  // FNV-1a，与 tools/build_site_data.py 的 bucket() 必须给出同一个桶号
  function bucket(s, n) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h % n;
  }
  function p3(n) { return ("00" + n).slice(-3); }
  function p2(n) { return ("0" + n).slice(-2); }

  function get(path) {
    if (cache[path]) return cache[path];
    var url = BASE + path + (M ? "?v=" + M.build : "");
    cache[path] = fetch(url).then(function (r) {
      if (!r.ok) throw new Error(path + " → HTTP " + r.status);
      return r.json();
    })["catch"](function (err) {
      delete cache[path];         // 失败不留缓存，下次重试
      throw err;
    });
    return cache[path];
  }

  return {
    bucket: bucket,

    boot: function () {
      return get("manifest.json").then(function (m) {
        M = m;
        m.dynasties.forEach(function (d) { slugOf[d.o] = d.slug; nameOf[d.o] = d.k; });
        return m;
      });
    },
    manifest: function () { return M; },
    dynastyName: function (o) { return nameOf[o] || ""; },
    dynastySlug: function (o) { return slugOf[o] || ""; },

    // 首页只读这一个文件
    curated: function () { return get("curated.json"); },

    /* 配画清单。刻意不走 data/site/ 的产物：它是手写的，
       加一幅画只需添一行 + 放一张图，不必重跑构建。没有这个文件也不算错。 */
    art: function () {
      return fetch("assets/art/index.json")
        .then(function (r) { return r.ok ? r.json() : []; })
        ["catch"](function () { return []; });
    },

    indexShard: function (slug, k) { return get("index/" + slug + "-" + p3(k) + ".json"); },

    // 卡片 -> 全文。卡片自带朝代序 d 与分片号 b，一次抓取即可。
    poem: function (card) {
      var slug = slugOf[card.d];
      return get("body/" + slug + "-" + p3(card.b) + ".json").then(function (m) {
        return m[card.id];
      });
    },
    // 深链 #/poem/<id>：先查 id 落在哪一片，再抓那一片
    poemById: function (id) {
      return get("lookup/" + p2(bucket(id, M.lookupBuckets)) + ".json").then(function (m) {
        var loc = m[id];
        if (!loc) throw new Error("未找到该作品：" + id);
        return get("body/" + slugOf[loc[0]] + "-" + p3(loc[1]) + ".json");
      }).then(function (b) { return b[id]; });
    },

    authors: function () { return get("agg/authors.json"); },
    authorWorks: function (name) {
      return get("agg/author/" + p2(bucket(name, M.authorBuckets)) + ".json")
        .then(function (m) { return m[name] || []; });
    },

    themes: function () { return get("agg/themes.json"); },
    themeCards: function (meta, k) {
      if (meta.tail) {
        return get("agg/theme/_tail.json").then(function (m) { return m[meta.k] || []; });
      }
      return get("agg/theme/" + meta.k + "-" + p3(k || 0) + ".json");
    },

    forms: function () { return get("agg/forms.json"); },
    formCards: function (meta, k) { return get("agg/form/" + meta.k + "-" + p3(k || 0) + ".json"); },

    places: function () { return get("agg/places.json"); },
    timeline: function () { return get("agg/timeline.json"); },

    charSummary: function () { return get("chars/summary.json"); },
    charHits: function (ch) {
      return get("chars/" + p2(bucket(ch, M.charBuckets)) + ".json")
        .then(function (m) { return m[ch] || null; });
    },

    /* 与此篇相近。构建期算好的，前端只取一片。
       返回 {n: [[id, 分], …], d: [[id, 分], …]} —— d 是同篇异录（另一处著录）。 */
    near: function (id) {
      return get("near/" + p2(bucket(id, M.nearBuckets)) + ".json")
        .then(function (m) { return m[id] || null; })
        ["catch"](function () { return null; });
    },

    /* 检索 · BM25。
       正文已入索引，排序用构建期算好的 BM25 权重（见 tools/build_relevance.py）。
       前端要做的只是把查询切成二元组、取几个桶、把各词的分加起来。 */
    searchBM25: function (q) {
      q = (q || "").trim();
      if (!q) return Promise.resolve([]);
      var han = q.match(/[一-鿿]/g) || [];
      if (!han.length) return Promise.resolve([]);
      var terms = [];
      if (han.length === 1) terms.push(han[0]);
      for (var i = 0; i < han.length - 1; i++) terms.push(han[i] + han[i + 1]);

      var need = [];
      terms.forEach(function (t) {
        var k = bucket(t, M.bm25Buckets);
        if (need.indexOf(k) < 0) need.push(k);
      });
      return Promise.all(need.map(function (k) {
        return get("bm25/" + p2(k) + ".json")["catch"](function () { return null; });
      })).then(function (loaded) {
        var byBucket = {};
        need.forEach(function (k, i) { byBucket[k] = loaded[i]; });
        var score = {}, row = {}, hits = {};
        terms.forEach(function (t) {
          var B = byBucket[bucket(t, M.bm25Buckets)];
          if (!B || !B.g[t]) return;
          B.g[t].forEach(function (pair) {
            var c = B.c[pair[0]], id = c[0];
            score[id] = (score[id] || 0) + pair[1];
            hits[id] = (hits[id] || 0) + 1;
            row[id] = { id: id, t: c[1], a: c[2], d: c[3] };
          });
        });
        /* 命中的词越多越该靠前 —— 搜"明月光"时三个二元组全中的，
           要压过只中了一个"明月"的。乘一个温和的系数，别让它盖过 BM25 本身。 */
        return Object.keys(score)
          .map(function (id) {
            row[id].s = score[id] * (1 + 0.35 * (hits[id] - 1));
            return row[id];
          })
          .sort(function (a, b) { return b.s - a.s || a.d - b.d; });
      });
    },

    /* 检索：只覆盖标题与作者（正文不入索引）。
       把查询词切成二元组，各取所在的桶，按命中的二元组个数排序。
       BM25 那套上线后这条就不再被调用了，留着作后路。 */
    search: function (q) {
      q = (q || "").trim();
      if (!q) return Promise.resolve([]);
      var han = q.match(/[一-鿿]/g) || [];
      var grams = [];
      if (han.length === 1) grams.push(han[0]);
      for (var i = 0; i < han.length - 1; i++) grams.push(han[i] + han[i + 1]);
      if (!grams.length) return Promise.resolve([]);

      var need = [];
      grams.forEach(function (g) {
        var k = bucket(g, M.searchBuckets);
        if (need.indexOf(k) < 0) need.push(k);
      });
      return Promise.all(need.map(function (k) {
        return get("search/" + p2(k) + ".json")["catch"](function () { return null; });
      })).then(function (loaded) {
        var byBucket = {};
        need.forEach(function (k, i) { byBucket[k] = loaded[i]; });
        var byId = {}, score = {};
        grams.forEach(function (g) {
          var B = byBucket[bucket(g, M.searchBuckets)];
          if (!B || !B.g[g]) return;
          B.g[g].forEach(function (ix) {
            var row = B.c[ix];
            byId[row[0]] = { id: row[0], t: row[1], a: row[2], d: row[3], b: row[4] };
            score[row[0]] = (score[row[0]] || 0) + 1;
          });
        });
        return Object.keys(byId)
          .sort(function (a, b) {
            return score[b] - score[a] || byId[a].d - byId[b].d ||
                   byId[a].t.localeCompare(byId[b].t);
          })
          .map(function (id) { return byId[id]; });
      });
    }
  };
})();
