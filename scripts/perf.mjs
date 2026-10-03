// Performance proof: a Chrome trace with 4x CPU throttling during a full-page scroll, frame and long-task counts,
// INP from real taps, and Lighthouse mobile and desktop scores.
// BASE=<url> OUT=<dir> node scripts/perf.mjs
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.BASE || "https://rrozenv.github.io/gmbet-b/";
const OUT = process.env.OUT || path.resolve("out");
await mkdir(OUT, { recursive: true });
const report = { base: BASE, at: new Date().toISOString(), cpuThrottle: 4 };

const PROFILES = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
};

function framesFromTrace(trace, t0, t1) {
  const events = trace.traceEvents || trace;
  const states = {};
  for (const e of events) {
    if (e.name !== "PipelineReporter" || e.ph !== "b") continue;
    if (e.ts < t0 || e.ts > t1) continue;
    const fr = e.args && (e.args.frame_reporter || e.args.chrome_frame_reporter);
    const s = fr && fr.state;
    if (s) states[s] = (states[s] || 0) + 1;
  }
  const presented = (states.STATE_PRESENTED_ALL || 0) + (states.STATE_PRESENTED_PARTIAL || 0);
  const dropped = states.STATE_DROPPED || 0;
  return { presented, dropped, partial: states.STATE_PRESENTED_PARTIAL || 0, droppedPct: presented + dropped ? +((100 * dropped) / (presented + dropped)).toFixed(2) : null, raw: states };
}

const browser = await chromium.launch({ channel: "chrome" });
try {
  for (const [name, opts] of Object.entries(PROFILES)) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.querySelectorAll(".tile").length > 0);
    await page.waitForTimeout(4500);

    // INP: chip taps, the swipe, and a lookup-field focus, measured with the Event Timing API
    await page.evaluate(() => {
      window.__ev = [];
      new PerformanceObserver((l) => l.getEntries().forEach((e) => e.interactionId && window.__ev.push({ name: e.name, d: e.duration }))).observe({ type: "event", durationThreshold: 16, buffered: true });
    });
    const tap = (sel) => (opts.hasTouch ? page.locator(sel).tap() : page.locator(sel).click());
    await tap('[data-stake="50"]');
    await page.waitForTimeout(400);
    await tap('[data-stake="10"]');
    await page.waitForTimeout(400);
    await tap('[data-stake="20"]');
    await page.waitForTimeout(400);
    await tap("[data-next]");
    await page.waitForTimeout(400);
    await tap("[data-thumb]");
    await page.waitForTimeout(6500);
    const ev = await page.evaluate(() => window.__ev);
    const byInteraction = ev.map((e) => e.d);
    report[name] = { inpMs: byInteraction.length ? Math.max(...byInteraction) : 0, interactions: byInteraction.length };

    // Full-page scroll under trace
    await page.evaluate(() => window.__lenis && window.__lenis.scrollTo(0, { immediate: true, force: true }));
    await page.waitForTimeout(800);
    await browser.startTracing(page, {
      categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.frame", "cc", "benchmark", "toplevel", "blink.user_timing"],
    });
    const t = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const d = [];
          const longs = [];
          const po = new PerformanceObserver((l) => l.getEntries().forEach((e) => longs.push(Math.round(e.duration))));
          po.observe({ type: "longtask" });
          const start = performance.now();
          let last = start;
          let done = false;
          const tick = (now) => {
            d.push(now - last);
            last = now;
            if (!done) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          const end = document.documentElement.scrollHeight - innerHeight;
          const finish = () => {
            done = true;
            po.disconnect();
            const sorted = [...d].sort((a, b) => a - b);
            resolve({
              seconds: +((performance.now() - start) / 1000).toFixed(1),
              scrolledPx: Math.round(scrollY),
              frames: d.length,
              avgFps: +(1000 / (d.reduce((a, b) => a + b, 0) / d.length)).toFixed(1),
              over25ms: d.filter((x) => x > 25).length,
              over50ms: d.filter((x) => x > 50).length,
              p95ms: +sorted[Math.floor(d.length * 0.95)].toFixed(1),
              maxMs: +sorted[sorted.length - 1].toFixed(1),
              longTasks: longs.length,
              longestTaskMs: longs.length ? Math.max(...longs) : 0,
            });
          };
          if (window.__lenis) window.__lenis.scrollTo(end, { duration: 14, easing: (x) => x, onComplete: () => setTimeout(finish, 300) });
          else {
            const t0 = performance.now();
            const step = (now) => {
              const k = Math.min(1, (now - t0) / 14000);
              window.scrollTo(0, end * k);
              if (k < 1) requestAnimationFrame(step);
              else setTimeout(finish, 300);
            };
            requestAnimationFrame(step);
          }
        })
    );
    const buf = await browser.stopTracing();
    const trace = JSON.parse(buf.toString());
    const tsList = (trace.traceEvents || []).filter((e) => e.name === "PipelineReporter").map((e) => e.ts);
    const frames = framesFromTrace(trace, Math.min(...tsList), Math.max(...tsList));
    const tracePath = path.join(OUT, `perf-trace-${name}-cpu4x.json.gz`);
    await writeFile(tracePath, gzipSync(buf));
    Object.assign(report[name], { scroll: t, traceFrames: frames, trace: tracePath });
    await ctx.close();
  }
} finally {
  await browser.close();
}

// Lighthouse (simulated mobile: 4x CPU, slow 4G; and desktop preset)
for (const [name, extra] of [["mobile", []], ["desktop", ["--preset=desktop"]]]) {
  const out = path.join(OUT, `lighthouse-${name}.json`);
  try {
    execFileSync("npx", ["-y", "lighthouse@12", BASE, "--only-categories=performance", "--output=json", `--output-path=${out}`, "--quiet", "--chrome-flags=--headless=new", ...extra], { stdio: "inherit", timeout: 240000 });
    const lh = JSON.parse(await readFile(out, "utf8"));
    const a = lh.audits;
    report["lighthouse_" + name] = {
      performance: Math.round(lh.categories.performance.score * 100),
      fcp: a["first-contentful-paint"].displayValue,
      lcp: a["largest-contentful-paint"].displayValue,
      tbt: a["total-blocking-time"].displayValue,
      cls: a["cumulative-layout-shift"].displayValue,
      si: a["speed-index"].displayValue,
      nonComposited: a["non-composited-animations"] ? a["non-composited-animations"].displayValue || "none" : "n/a",
    };
  } catch (e) {
    report["lighthouse_" + name] = { error: String(e).slice(0, 200) };
  }
}

await writeFile(path.join(OUT, "perf.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
