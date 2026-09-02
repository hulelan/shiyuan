#!/usr/bin/env node
"use strict";
/**
 * Playwright driver for 诗渊. Selectors are from index.html / js/app.js.
 * Poem text is always compared to data/site/curated.json from the live origin —
 * never invented, never substituted from memory.
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");

const SKILL_DIR = process.env.SHIYUAN_SKILL_DIR || path.resolve(__dirname, "..");
const RUN_ID = process.argv[2];
const FEATURE = process.argv[3];
const RUN_DIR = path.join(SKILL_DIR, ".run", RUN_ID);
const EVIDENCE = path.join(SKILL_DIR, "evidence", RUN_ID);

const CANON_ID = "aec36ff73546"; // 《关雎》 in data/site/curated.json
const JINGYE_ID = "6c1f9747d167"; // 《静夜思》 李白, also curated

function readField(name) {
  return fs.readFileSync(path.join(RUN_DIR, name), "utf8").trim();
}

function die(msg) {
  console.error("drive-shiyuan: " + msg);
  process.exit(1);
}

function write(name, body) {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  const p = path.join(EVIDENCE, name);
  fs.writeFileSync(p, body);
  return p;
}

function chromePath() {
  const candidates = [
    process.env.SHIYUAN_CHROME,
    "/usr/local/bin/google-chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

async function fetchJson(origin, p) {
  const res = await fetch(origin.replace(/\/$/, "") + p);
  if (!res.ok) throw new Error(`GET ${p} -> ${res.status}`);
  return res.json();
}

function curatedById(curated, id) {
  const rec = curated.find((p) => p && p.id === id);
  if (!rec) throw new Error(`curated.json has no id ${id} — do not invent a stand-in`);
  return rec;
}

async function launchBrowser() {
  const executablePath = chromePath();
  const opts = {
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  };
  if (executablePath) opts.executablePath = executablePath;
  return chromium.launch(opts);
}

function attachNetwork(page, bucket) {
  page.on("response", (res) => {
    const url = res.url();
    if (url.includes("/data/site/") || url.includes("/assets/art/")) {
      bucket.push({ url, status: res.status(), ok: res.ok() });
    }
  });
}

async function waitBoot(page) {
  // Store.boot() then applyChrome() rewrites #bootStat to 收录 {n} 篇.
  await page.waitForFunction(() => {
    const el = document.querySelector("#bootStat");
    const fail = document.querySelector("#main > p.loadfail");
    if (fail) return "LOADFAIL";
    if (el && /收录\s*\d+\s*篇|\d+\s*works/.test(el.textContent || "")) return "OK";
    return false;
  }, null, { timeout: 15000 });
  const boot = await page.evaluate(() => {
    const fail = document.querySelector("#main > p.loadfail");
    return {
      loadfail: !!(fail && /数据没能载入/.test(fail.textContent || "")),
      bootStat: (document.querySelector("#bootStat") || {}).textContent || "",
      lang: document.documentElement.getAttribute("lang"),
    };
  });
  if (boot.loadfail) die("UI showed 数据没能载入 — instance is not bootable");
  return boot;
}

async function dumpOverlay(page) {
  return page.evaluate(() => {
    const ov = document.querySelector("#overlay");
    const poem = document.querySelector("#pdPoem");
    const h2 = document.querySelector("#poemDetail .pd-head h2");
    const zh = [...document.querySelectorAll("#pdPoem .pd-line .zh")].map((n) => n.textContent);
    const py = [...document.querySelectorAll("#pdPoem .pd-line .py")].map((n) => n.textContent);
    const secs = [...document.querySelectorAll("#poemDetail .pd-sec-head h4")].map((n) => n.textContent);
    const fail = document.querySelector("#poemDetail p.loadfail");
    return {
      overlayHidden: !ov || ov.classList.contains("hidden"),
      overlayClass: ov ? ov.className : null,
      title: h2 ? h2.textContent : null,
      zh,
      py,
      pdPoemText: poem ? poem.innerText : null,
      sections: secs,
      loadfail: fail ? fail.textContent : null,
      pyToggle: (document.querySelector("#pyToggle") || {}).textContent || null,
      hash: location.hash,
    };
  });
}

function assertPoemAgainstCurated(dump, rec) {
  const errors = [];
  if (dump.overlayHidden) errors.push("#overlay still has .hidden");
  if (dump.loadfail) errors.push("overlay loadfail: " + dump.loadfail);
  if (dump.title !== rec.title) {
    errors.push(`title DOM ${JSON.stringify(dump.title)} != curated ${JSON.stringify(rec.title)}`);
  }
  const expectedLines = String(rec.text || "").split("\n");
  if (dump.zh.join("\n") !== expectedLines.join("\n")) {
    errors.push("原文 (#pdPoem .zh) does not match curated.json text — refusing to invent a substitute");
  }
  if (rec.pinyin) {
    const expectedPy = String(rec.pinyin).split("\n");
    if (dump.py.join("\n") !== expectedPy.join("\n")) {
      errors.push("拼音 (#pdPoem .py) does not match curated.json pinyin");
    }
  }
  for (const label of ["译　文", "注　释", "赏　析", "English"]) {
    if (!dump.sections.includes(label)) errors.push("missing section " + JSON.stringify(label));
  }
  if (!dump.zh[0]) errors.push("no first .zh line");
  return errors;
}

async function drivePoemDetail(page, origin, curated) {
  const rec = curatedById(curated, CANON_ID);
  const url = origin.replace(/\/$/, "") + "/#/poem/" + CANON_ID;
  const network = [];
  attachNetwork(page, network);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const boot = await waitBoot(page);
  await page.waitForSelector("#pdPoem .pd-line .zh", { timeout: 15000 });
  await page.waitForFunction(() => {
    const ov = document.querySelector("#overlay");
    return ov && !ov.classList.contains("hidden") && document.querySelector("#pdPoem .pd-line .zh");
  }, null, { timeout: 15000 });
  // Overlay does not show() a view — #/poem/<id> leaves the underlying view in place.
  const views = await page.evaluate(() => {
    const ids = [
      "view-home", "view-library", "view-authors", "view-author", "view-type",
      "view-theme", "view-word", "view-timeline", "view-map", "view-art", "view-search",
    ];
    const hidden = {};
    for (const id of ids) {
      const el = document.getElementById(id);
      hidden[id] = !el || el.classList.contains("hidden");
    }
    return hidden;
  });
  const dump = await dumpOverlay(page);
  const errors = assertPoemAgainstCurated(dump, rec);
  const shot = path.join(EVIDENCE, "overlay-guanju.png");
  fs.mkdirSync(EVIDENCE, { recursive: true });
  await page.locator("#poemDetail").screenshot({ path: shot });
  await page.screenshot({ path: path.join(EVIDENCE, "page-poem-detail.png"), fullPage: true });

  write("pdPoem.txt", dump.pdPoemText || "");
  write("overlay-dump.json", JSON.stringify({ boot, dump, views, recId: rec.id, recTitle: rec.title, recFirstLine: (rec.text || "").split("\n")[0] }, null, 2));
  write("network.json", JSON.stringify(network, null, 2));
  write("curated-aec36ff73546.json", JSON.stringify({
    id: rec.id, title: rec.title, author: rec.author, dynasty: rec.dynasty,
    text: rec.text, pinyin: rec.pinyin,
  }, null, 2));

  // Store.get() appends ?v=<manifest.build> after boot; do not require $ end.
  const lookedUp = network.some((n) => /\/data\/site\/lookup\/\d+\.json/.test(n.url) && n.ok);
  const bodyHit = network.some((n) => /\/data\/site\/body\/[^?]+\.json/.test(n.url) && n.ok);
  const manHit = network.some((n) => n.url.includes("/data/site/manifest.json") && n.ok);
  if (!lookedUp) errors.push("no successful fetch of data/site/lookup/*.json");
  if (!bodyHit) errors.push("no successful fetch of data/site/body/*.json");
  if (!manHit) errors.push("no successful fetch of data/site/manifest.json");

  if (errors.length) {
    write("COMPARE_FAIL.txt", errors.join("\n") + "\n");
    die("poem-detail assertions failed:\n  " + errors.join("\n  "));
  }
  const failNote = path.join(EVIDENCE, "COMPARE_FAIL.txt");
  if (fs.existsSync(failNote)) fs.unlinkSync(failNote);
  const notes = [
    `feature: poem-detail`,
    `url: ${url}`,
    `overlay screenshot: ${shot}`,
    `title in overlay: ${dump.title}`,
    `first .zh line: ${dump.zh[0]}`,
    `matched curated.json id ${rec.id} title ${rec.title} author ${rec.author}`,
    `bootStat: ${boot.bootStat}`,
    `hash: ${dump.hash}`,
    `#/poem/<id> does not show() a view; view-home hidden=${views["view-home"]}`,
    `network: lookup=${lookedUp} body=${bodyHit} manifest=${manHit}`,
    `sections: ${dump.sections.join(" | ")}`,
  ].join("\n") + "\n";
  write("NOTES.txt", notes);
  write("COMPARE_OK.txt", "pdPoem .zh/.py matched curated.json for " + CANON_ID + " 《" + rec.title + "》\n");
  console.log(notes);
}

async function driveHome(page, origin, curated) {
  const network = [];
  attachNetwork(page, network);
  await page.goto(origin.replace(/\/$/, "") + "/#/", { waitUntil: "domcontentloaded" });
  const boot = await waitBoot(page);
  await page.waitForSelector("#dailyText", { timeout: 15000 });
  await page.waitForSelector("#view-home:not(.hidden)", { timeout: 5000 });
  const before = await page.evaluate(() => ({
    hash: location.hash,
    daily: (document.querySelector("#dailyText") || {}).innerText || "",
    attr: (document.querySelector(".daily-attr") || {}).innerText || "",
    open: (document.querySelector("#dailyOpen") || {}).textContent || "",
    next: (document.querySelector("#dailyNext") || {}).textContent || "",
    brand: (document.querySelector(".brand h1") || {}).textContent || "",
    bootStat: (document.querySelector("#bootStat") || {}).textContent || "",
    overlayHidden: document.querySelector("#overlay").classList.contains("hidden"),
  }));
  await page.locator("#dailyOpen").click();
  await page.waitForSelector("#pdPoem .pd-line .zh", { timeout: 15000 });
  const dump = await dumpOverlay(page);
  const rec = curated.find((p) => p.title === dump.title && (p.text || "").split("\n")[0] === dump.zh[0]);
  if (!rec) {
    die("home overlay title/first line not in curated.json — will not invent a poem. dump=" + JSON.stringify({ title: dump.title, first: dump.zh[0] }));
  }
  fs.mkdirSync(EVIDENCE, { recursive: true });
  await page.locator("#poemDetail").screenshot({ path: path.join(EVIDENCE, "overlay-home-open.png") });
  write("home-dump.json", JSON.stringify({ boot, before, dump, matchedId: rec.id }, null, 2));
  write("network.json", JSON.stringify(network, null, 2));
  write("NOTES.txt", `feature: home\nbrand: ${before.brand}\nbootStat: ${before.bootStat}\ndailyOpen opened overlay for curated id ${rec.id} 《${rec.title}》\nfirst line: ${dump.zh[0]}\n`);
  console.log("home: overlay opened for", rec.id, rec.title);
}

async function driveLibrary(page, origin) {
  const network = [];
  attachNetwork(page, network);
  await page.goto(origin.replace(/\/$/, "") + "/#/", { waitUntil: "domcontentloaded" });
  await waitBoot(page);
  await page.locator("#lensBtn").click();
  await page.waitForSelector("#lensMenu button.lens-item[data-view=library]", { timeout: 5000 });
  const expanded = await page.getAttribute("#lensBtn", "aria-expanded");
  if (expanded !== "true") die("#lensBtn aria-expanded is not true after click");
  await page.locator("#lensMenu button.lens-item[data-view=library]").click();
  await page.waitForFunction(() => location.hash.replace(/^#/, "") === "/library", null, { timeout: 8000 });
  await page.waitForSelector("#view-library:not(.hidden)", { timeout: 8000 });
  await page.waitForSelector("#libFilters button.chip", { timeout: 8000 });
  await page.waitForSelector("#libBody .card, #libBody .scroll-col, #libBody p.loadfail, #libBody p.empty", { timeout: 15000 });
  const state = await page.evaluate(() => {
    const chips = [...document.querySelectorAll("#libFilters button.chip")].map((b) => b.innerText.replace(/\s+/g, " ").trim());
    const rs = [...document.querySelectorAll("#libBody .rs")].map((b) => ({ m: b.getAttribute("data-m"), on: b.classList.contains("on"), t: b.textContent }));
    return {
      hash: location.hash,
      chips,
      cards: document.querySelectorAll("#libBody .card").length,
      rs,
      viewHidden: document.querySelector("#view-library").classList.contains("hidden"),
    };
  });
  if (state.viewHidden) die("#view-library still hidden");
  if (state.cards < 1 && !state.rs.length) die("library rendered no cards and no read-switch");
  fs.mkdirSync(EVIDENCE, { recursive: true });
  await page.screenshot({ path: path.join(EVIDENCE, "library.png"), fullPage: true });
  write("library-dump.json", JSON.stringify(state, null, 2));
  write("network.json", JSON.stringify(network, null, 2));
  write("NOTES.txt", `feature: library\nhash: ${state.hash}\nchips: ${state.chips.join(" | ")}\ncards: ${state.cards}\n`);
  console.log("library:", state.hash, "cards", state.cards);
}

async function driveSearch(page, origin, curated) {
  const jingye = curatedById(curated, JINGYE_ID);
  const network = [];
  attachNetwork(page, network);
  await page.goto(origin.replace(/\/$/, "") + "/#/", { waitUntil: "domcontentloaded" });
  await waitBoot(page);
  await page.fill("#search", "hello");
  await page.waitForTimeout(400);
  await page.waitForFunction(() => location.hash.indexOf("#/search/") === 0, null, { timeout: 5000 });
  await page.waitForSelector("#view-search:not(.hidden)", { timeout: 8000 });
  await page.waitForFunction(() => {
    const b = document.querySelector("#searchBody");
    return b && (b.querySelector(".empty") || b.querySelector(".word-row"));
  }, null, { timeout: 15000 });
  const latin = await page.evaluate(() => ({
    hash: location.hash,
    empty: !!(document.querySelector("#searchBody .empty")),
    rows: document.querySelectorAll("#searchBody .word-row").length,
    intro: (document.querySelector("#view-search .view-intro") || {}).innerText || "",
  }));
  if (!latin.empty && latin.rows > 0) {
    die("Latin query should be empty (BM25 requires Han); got rows=" + latin.rows);
  }
  await page.fill("#search", "");
  await page.fill("#search", "明月");
  const t0 = Date.now();
  await page.waitForFunction(() => decodeURIComponent(location.hash) === "#/search/明月", null, { timeout: 5000 });
  const debounceMs = Date.now() - t0;
  await page.waitForFunction(() => {
    const b = document.querySelector("#searchBody");
    return b && (b.querySelector(".empty") || b.querySelector(".word-row"));
  }, null, { timeout: 20000 });
  const han = await page.evaluate((wantId) => {
    const rows = [...document.querySelectorAll("#searchBody .word-row")].map((r) => r.innerText);
    // rows do not include id; click handler uses r.id. Inspect by title.
    return {
      hash: location.hash,
      intro: (document.querySelector("#view-search .view-intro") || {}).innerText || "",
      n: rows.length,
      titles: rows.slice(0, 40),
      hasJingye: rows.some((t) => t.includes("静夜思")),
      wantId,
    };
  }, JINGYE_ID);
  fs.mkdirSync(EVIDENCE, { recursive: true });
  await page.screenshot({ path: path.join(EVIDENCE, "search-mingyue.png"), fullPage: true });
  write("search-dump.json", JSON.stringify({ latin, han, debounceMs, jingyeTitle: jingye.title }, null, 2));
  write("network.json", JSON.stringify(network, null, 2));
  write("NOTES.txt", `feature: search\nlatin empty: ${latin.empty} rows=${latin.rows}\nhan hash: ${han.hash}\nhits: ${han.n}\n静夜思 among first rows: ${han.hasJingye}\ndebounce wait ms (lower bound): ${debounceMs}\n`);
  if (han.n < 1) die("Han query 明月 returned no hits");
  console.log("search: 明月 hits", han.n, "静夜思 visible", han.hasJingye);
}

async function driveAuthors(page, origin) {
  const network = [];
  attachNetwork(page, network);
  await page.goto(origin.replace(/\/$/, "") + "/#/authors", { waitUntil: "domcontentloaded" });
  await waitBoot(page);
  await page.waitForSelector("#view-authors:not(.hidden)", { timeout: 8000 });
  await page.waitForSelector("#authorIndex .au-cell", { timeout: 15000 });
  await page.evaluate(() => { location.hash = "/author/" + encodeURIComponent("李白"); });
  await page.waitForSelector("#view-author:not(.hidden)", { timeout: 8000 });
  await page.waitForSelector("h1.author-name", { timeout: 15000 });
  const state = await page.evaluate(() => ({
    hash: location.hash,
    name: (document.querySelector("h1.author-name") || {}).textContent || "",
    back: (document.querySelector("#authorBack") || {}).textContent || "",
    works: document.querySelectorAll("#authorWorks .card, #authorWorks .scroll-col").length,
    loadfail: (document.querySelector("#view-author p.loadfail") || {}).textContent || null,
  }));
  if (state.name !== "李白") die("author page name is " + JSON.stringify(state.name) + " not 李白");
  if (state.loadfail) die(state.loadfail);
  fs.mkdirSync(EVIDENCE, { recursive: true });
  await page.screenshot({ path: path.join(EVIDENCE, "author-libai.png"), fullPage: true });
  write("authors-dump.json", JSON.stringify(state, null, 2));
  write("network.json", JSON.stringify(network, null, 2));
  write("NOTES.txt", `feature: authors\nhash: ${state.hash}\nname: ${state.name}\nworks on page: ${state.works}\n`);
  console.log("authors:", state.hash, state.name, "works", state.works);
}

async function main() {
  if (!RUN_ID || !FEATURE) die("usage: drive-shiyuan RUN_ID FEATURE");
  if (!fs.existsSync(path.join(RUN_DIR, "origin"))) {
    die("no origin file in " + RUN_DIR + " — launch with control-shiyuan first");
  }
  const origin = readField("origin");
  if (origin.startsWith("file:")) die("refusing to drive file:// (doctor would fail closed)");
  const curated = await fetchJson(origin, "/data/site/curated.json");
  const manifest = await fetchJson(origin, "/data/site/manifest.json");
  fs.mkdirSync(EVIDENCE, { recursive: true });
  write("manifest-total.txt", String(manifest.total) + "\n");
  write("manifest.json", JSON.stringify({ total: manifest.total, build: manifest.build, curated: manifest.curated }, null, 2) + "\n");

  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    switch (FEATURE) {
      case "poem-detail":
        await drivePoemDetail(page, origin, curated);
        break;
      case "home":
        await driveHome(page, origin, curated);
        break;
      case "library":
        await driveLibrary(page, origin);
        break;
      case "search":
        await driveSearch(page, origin, curated);
        break;
      case "authors":
        await driveAuthors(page, origin);
        break;
      default:
        die("unknown feature " + FEATURE + " (poem-detail|home|library|search|authors)");
    }
  } finally {
    await browser.close();
  }
  console.log("evidence=" + EVIDENCE);
}

main().catch((err) => {
  console.error(err && err.stack || err);
  process.exit(1);
});
