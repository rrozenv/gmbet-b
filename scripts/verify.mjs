// Screenshots, interaction recordings, and checks for layout shift, clipped text, contrast, and frame rate.
// BASE=<url> OUT=<dir> node scripts/verify.mjs [--quick]
import { mkdir, rm, writeFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.BASE || "https://rrozenv.github.io/gmbet-b/";
const OUT = process.env.OUT || path.resolve("out");
const QUICK = process.argv.includes("--quick");
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };
const report = { base: BASE, at: new Date().toISOString() };
await mkdir(OUT, { recursive: true });

const MOCK = { code: "demo234", position: 128, referrals: 0, already: false };
const mockJoin = (page) =>
  page.route("**/rest/v1/rpc/join_waitlist", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(MOCK) })
  );

const watchShifts = () => {
  window.__cls = 0;
  window.__shifts = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.hadRecentInput) continue;
      window.__cls += e.value;
      window.__shifts.push({ v: +e.value.toFixed(4), nodes: (e.sources || []).map((s) => s.node && (s.node.className || s.node.nodeName)) });
    }
  }).observe({ type: "layout-shift", buffered: true });
};

async function ready(page, settle = 3200) {
  await page.waitForFunction(() => document.querySelectorAll(".tile").length > 0);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(settle);
}

const scrollTo = (page, y, smooth = false) =>
  page.evaluate(
    ([y, smooth]) =>
      new Promise((res) => {
        const l = window.__lenis;
        if (l) l.scrollTo(y, smooth ? { duration: 1.8, onComplete: res } : { immediate: true, force: true });
        else window.scrollTo(0, y);
        if (!l || !smooth) setTimeout(res, 50);
      }),
    [y, smooth]
  );

const topOf = (page, sel) => page.evaluate((s) => document.querySelector(s).getBoundingClientRect().top + scrollY, sel);

async function swipeBet(page) {
  const t = await page.locator("[data-thumb]").boundingBox();
  const s = await page.locator("[data-swipe]").boundingBox();
  const y = t.y + t.height / 2;
  await page.mouse.move(t.x + t.width / 2, y);
  await page.mouse.down();
  const end = s.x + s.width - t.width / 2 - 4;
  for (let i = 1; i <= 24; i++) {
    const k = i / 24;
    await page.mouse.move(t.x + t.width / 2 + (end - t.x - t.width / 2) * (1 - Math.pow(1 - k, 2)), y);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
}

// Text that overflows its own box, outside the decorative wall (which truncates on purpose).
const clipped = () =>
  [...document.querySelectorAll("body *")]
    .filter((e) => !e.closest("[data-wall], .sr, .roll-sizer, .rd, .hp, [hidden], [aria-hidden='true']"))
    .filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
    .filter((e) => {
      const cs = getComputedStyle(e);
      if (cs.display === "inline" || cs.overflow === "visible") return false;
      return e.scrollWidth > e.clientWidth + 1;
    })
    .map((e) => e.className + ": " + e.textContent.trim().slice(0, 40));

const wallClipped = () =>
  [...document.querySelectorAll("[data-wall] .t-n, [data-wall] .t-c, [data-wall] .t-fmt")].filter((e) => e.scrollWidth > e.clientWidth + 1).length;

// WCAG contrast of each text node against the first opaque background behind it.
const contrast = () => {
  const parse = (c) => (c.match(/[\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const bgOf = (e) => {
    const layers = [];
    for (let n = e; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c.length === 4 && c[3] === 0) continue;
      layers.push(c);
      if (c.length === 3 || c[3] >= 1) break;
    }
    let base = [7, 8, 10];
    for (const c of layers.reverse()) {
      const a = c.length === 4 ? c[3] : 1;
      base = base.map((v, i) => v * (1 - a) + c[i] * a);
    }
    return base;
  };
  const out = [];
  for (const e of document.querySelectorAll("main *, footer *, header *")) {
    if (e.closest("[data-wall], .sr, .roll-sizer, .hp, [hidden], [aria-hidden='true']")) continue;
    if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const cs = getComputedStyle(e);
    if (cs.visibility === "hidden" || +cs.opacity === 0) continue;
    const fg = parse(cs.color);
    const bg = bgOf(e);
    const a = fg.length === 4 ? fg[3] : 1;
    const mix = fg.slice(0, 3).map((v, i) => v * a + bg[i] * (1 - a));
    const L1 = lum(mix);
    const L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (size >= 18.66 && +cs.fontWeight >= 700);
    out.push({ t: e.textContent.trim().slice(0, 32), ratio: +ratio.toFixed(2), need: large ? 3 : 4.5 });
  }
  return { checked: out.length, min: Math.min(...out.map((o) => o.ratio)), fails: out.filter((o) => o.ratio < o.need) };
};

async function record(name, opts, script, size) {
  const tmp = path.join(OUT, "_video-" + name);
  await rm(tmp, { recursive: true, force: true });
  const ctx = await browser.newContext({ ...opts, recordVideo: { dir: tmp, size } });
  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelectorAll(".tile").length > 0);
  const lead = (Date.now() - t0) / 1000;
  await script(page);
  await ctx.close();
  const [file] = await readdir(tmp);
  const mp4 = path.join(OUT, name + ".mp4");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", Math.max(0, lead - 0.1).toFixed(2), "-i", path.join(tmp, file), "-t", "15", "-r", "30", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-movflags", "+faststart", mp4]);
  await rm(tmp, { recursive: true, force: true });
  return mp4;
}

const browser = await chromium.launch({ channel: "chrome" });
try {
  // 1. Hero screenshots, sections, layout shift, clipping, contrast
  for (const [name, opts] of [["phone-390x844", PHONE], ["desktop-1440x900", DESK]]) {
    const ctx = await browser.newContext(opts);
    await ctx.addInitScript(watchShifts);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(BASE, { waitUntil: "networkidle" });
    await ready(page);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    await swipeBet(page);
    await page.waitForTimeout(7400);
    await page.screenshot({ path: path.join(OUT, `${name}-won.png`) });
    const shots = [];
    const hours = await topOf(page, ".hours");
    await scrollTo(page, hours - 40);
    await page.waitForTimeout(1600);
    shots.push(["hours", page.screenshot({ path: path.join(OUT, `${name}-clocks.png`) })]);
    await shots.at(-1)[1];
    const story = await topOf(page, ".story");
    const vh = opts.viewport.height;
    for (const [p, label] of [[0.24, "link"], [0.5, "bet"], [0.97, "win"]]) {
      await scrollTo(page, story + p * vh * 2.6);
      await page.waitForTimeout(1300);
      await page.screenshot({ path: path.join(OUT, `${name}-how-${label}.png`) });
    }
    for (const sel of [".sec-math", "#friends", "#join"]) {
      await scrollTo(page, (await topOf(page, sel)) - 32);
      await page.waitForTimeout(1800);
      await page.screenshot({ path: path.join(OUT, `${name}-${sel.replace(/[#.]/g, "").replace("sec-", "")}.png`) });
    }
    report[name] = {
      cls: await page.evaluate(() => +window.__cls.toFixed(4)),
      shifts: await page.evaluate(() => window.__shifts.slice(0, 5)),
      clipped: await page.evaluate(clipped),
      wallTruncated: await page.evaluate(wallClipped),
      contrast: await page.evaluate(contrast),
      horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      errors,
    };
    await ctx.close();
  }

  // 2. Frame rate on an emulated phone with the CPU slowed 4x, during the intro and while the wall runs
  {
    const ctx = await browser.newContext(PHONE);
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelectorAll(".tile").length > 0);
    report.fpsPhoneCpu4x = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const d = [];
          let last = performance.now();
          const end = last + 6000;
          const tick = (now) => {
            d.push(now - last);
            last = now;
            if (now < end) requestAnimationFrame(tick);
            else {
              const sorted = [...d].sort((a, b) => a - b);
              resolve({ frames: d.length, avgFps: +(1000 / (d.reduce((a, b) => a + b, 0) / d.length)).toFixed(1), over25ms: d.filter((x) => x > 25).length, p95ms: +sorted[Math.floor(d.length * 0.95)].toFixed(1) });
            }
          };
          requestAnimationFrame(tick);
        })
    );
    await ctx.close();
  }

  // 3. Reduced motion: wall holds still, content visible without the intro
  {
    const ctx = await browser.newContext({ ...PHONE, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "networkidle" });
    await ready(page, 800);
    const a = await page.evaluate(() => [...document.querySelectorAll(".wall-col")].map((c) => c.style.transform).join());
    await page.waitForTimeout(1500);
    const b = await page.evaluate(() => [...document.querySelectorAll(".wall-col")].map((c) => c.style.transform).join());
    report.reducedMotion = { wallStill: a === b, headlineVisible: await page.evaluate(() => getComputedStyle(document.querySelector("#hero-h")).opacity === "1") };
    await page.screenshot({ path: path.join(OUT, "phone-reduced-motion.png") });
    await ctx.close();
  }

  // 4. Waitlist: the real endpoint answers from this origin; the signup itself is mocked so no test row is written
  {
    const ctx = await browser.newContext(PHONE);
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "networkidle" });
    report.supabaseReachable = await page.evaluate(async () => {
      const r = await fetch("https://dxsptaffwzefavffhrfk.supabase.co/rest/v1/rpc/waitlist_place", {
        method: "POST",
        headers: { apikey: "sb_publishable_YRKJHEES6HwLRlD4vmr69g_V7c7P6Bx", "Content-Type": "application/json" },
        body: JSON.stringify({ p_code: "zzzzzzz" }),
      });
      return { status: r.status, body: await r.text() };
    });
    await mockJoin(page);
    await scrollTo(page, (await topOf(page, "#join")) - 32);
    await page.waitForTimeout(1600);
    await page.fill('input[name="email"]', "preview@example.com");
    await page.fill('input[name="chess_username"]', "rob_nyc");
    await page.locator("[data-form] button[type=submit]").click();
    await page.waitForSelector("[data-done]:not([hidden])");
    await page.waitForTimeout(1800);
    await page.locator(".join-card").screenshot({ path: path.join(OUT, "phone-waitlist-done.png") });
    report.waitlistUi = { invite: await page.inputValue("[data-invite]"), place: await page.textContent("[data-place] .sr") };
    await ctx.close();
  }

  // 4b. Live Chess.com lookup against the public API: a real account, then one that does not exist
  {
    const ctx = await browser.newContext(PHONE);
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "networkidle" });
    await scrollTo(page, (await topOf(page, "#link")) - 32);
    await page.waitForTimeout(1600);
    await page.fill("[data-lookup-input]", "hikaru");
    await page.locator("[data-lookup-btn]").tap();
    await page.waitForSelector('[data-me][data-state="found"]', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await page.locator(".link-card").screenshot({ path: path.join(OUT, "phone-chesscom-lookup.png") });
    const found = await page.evaluate(() => ({
      state: document.querySelector("[data-me]").dataset.state,
      name: document.querySelector("[data-me-name]").textContent,
      sub: document.querySelector("[data-me-sub]").textContent,
      blitz: document.querySelector('[data-me-r="chess_blitz"]').textContent,
      record: document.querySelector("[data-me-rec]").textContent,
      avatarShown: !document.querySelector("[data-me-ava]").hidden,
      heroYou: document.querySelector(".pl-you .pl-name").textContent + " " + document.querySelector(".pl-you .pl-r").textContent,
    }));
    await page.fill("[data-lookup-input]", "zzzz-no-such-user-zz");
    await page.locator("[data-lookup-btn]").tap();
    await page.waitForSelector('[data-me][data-state="missing"]', { timeout: 15000 }).catch(() => {});
    const missing = await page.evaluate(() => ({ state: document.querySelector("[data-me]").dataset.state, msg: document.querySelector("[data-me-msg]").textContent }));
    report.chesscomLookup = { found, missing };
    await ctx.close();
  }

  if (!QUICK) {
    // 5. Recordings
    report.videoPhone = await record("interaction-phone-15s", { ...PHONE, deviceScaleFactor: 2 }, async (page) => {
      await page.waitForTimeout(2700);
      await page.locator('[data-stake="50"]').tap();
      await page.waitForTimeout(1100);
      await page.locator('[data-stake="20"]').tap();
      await page.waitForTimeout(700);
      await swipeBet(page);
      await page.waitForTimeout(7300);
      await scrollTo(page, (await topOf(page, ".hours")) - 24, true);
      await page.waitForTimeout(1500);
    }, { width: 780, height: 1688 });

    report.videoDesktop = await record("interaction-desktop-15s", DESK, async (page) => {
      await page.mouse.move(900, 300);
      await page.waitForTimeout(1600);
      for (let i = 0; i <= 20; i++) {
        await page.mouse.move(900 - i * 30, 300 + i * 18);
        await page.waitForTimeout(30);
      }
      await page.locator('[data-stake="50"]').click();
      await page.waitForTimeout(1000);
      await page.locator('[data-stake="20"]').click();
      await page.waitForTimeout(600);
      await swipeBet(page);
      await page.waitForTimeout(8200);
      await scrollTo(page, (await topOf(page, ".hours")) + 80, true);
      await page.waitForTimeout(800);
    }, { width: 1440, height: 900 });

    report.videoScroll = await record("scroll-tour-desktop-15s", DESK, async (page) => {
      await page.waitForTimeout(2600);
      const story = await topOf(page, ".story");
      await scrollTo(page, (await topOf(page, ".hours")) - 40, true);
      await page.waitForTimeout(600);
      await page.evaluate((y) => new Promise((r) => window.__lenis.scrollTo(y, { duration: 5.5, easing: (t) => t, onComplete: r })), story + 900 * 2.6);
      await page.waitForTimeout(400);
      await scrollTo(page, (await topOf(page, ".sec-math")) - 32, true);
      await page.waitForTimeout(1500);
    }, { width: 1440, height: 900 });
  }
} finally {
  await browser.close();
}
await writeFile(path.join(OUT, "verify.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
