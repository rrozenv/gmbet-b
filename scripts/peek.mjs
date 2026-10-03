// Quick look while building: screenshots at phone and desktop sizes, plus any console errors.
import { chromium } from "playwright-core";

const url = process.argv[2] || "http://127.0.0.1:8742/";
const out = process.argv[3] || "/tmp/gmbet-b";
const browser = await chromium.launch({ channel: "chrome" });
for (const [name, vp, mobile] of [
  ["desktop", { width: 1440, height: 900 }, false],
  ["phone", { width: 390, height: 844 }, true],
]) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
  page.on("console", (m) => m.type() === "error" && console.log(name, "console:", m.text()));
  page.on("pageerror", (e) => console.log(name, "pageerror:", e.message));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}-${name}.png` });
  await page.screenshot({ path: `${out}-${name}-full.png`, fullPage: true });
  await page.close();
}
await browser.close();
console.log("ok");
