// Renders the link-preview image and the dark app icons into site/. Needs the local server (npm run serve).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.BASE || "http://127.0.0.1:8742/";
const site = (f) => path.join(root, "site", f);

const icon = (size, radius) => `<!doctype html><html><head><style>
@font-face { font-family: Geist; src: url("${base}fonts/geist-var.woff2") format("woff2"); font-weight: 100 900; }
html, body { margin: 0; width: ${size}px; height: ${size}px; background: transparent; }
.i { position: relative; display: grid; place-items: center; width: 100%; height: 100%; border-radius: ${radius}; background: #0b0c0e; box-shadow: ${radius === "0" ? "none" : `inset 0 0 0 1px rgba(255,255,255,0.14)`}; color: #f3f4f6; font: 700 ${size * 0.47}px/1 Geist, sans-serif; letter-spacing: -0.06em; padding-bottom: ${size * 0.06}px; box-sizing: border-box; }
.i::after { content: ""; position: absolute; right: ${size * 0.13}px; bottom: ${size * 0.13}px; width: ${size * 0.12}px; height: ${size * 0.12}px; border-radius: ${size * 0.025}px; background: #00d26a; }
</style></head><body><div class="i">gm</div></body></html>`;

const browser = await chromium.launch({ channel: "chrome" });
try {
  const og = await readFile(path.join(root, "scripts", "og.html"), "utf8");
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.route(base + "__og.html", (r) => r.fulfill({ contentType: "text/html", body: og }));
  await page.goto(base + "__og.html");
  await page.waitForSelector("body[data-ready]");
  await page.screenshot({ path: site("og.png") });
  await page.close();

  for (const [file, size, radius, omit] of [
    ["favicon-32.png", 32, "7px", true],
    ["apple-touch-icon.png", 180, "0", false],
    ["icon-512.png", 512, "0", false],
  ]) {
    const p = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await p.setContent(icon(size, radius));
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(150);
    await p.screenshot({ path: site(file), omitBackground: omit });
    await p.close();
  }
} finally {
  await browser.close();
}
console.log("Rendered og.png, favicon-32.png, apple-touch-icon.png, icon-512.png");
