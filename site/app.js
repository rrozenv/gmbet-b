import { Board, loadPieces } from "./board.js";
import { HERO_GAME, WALL_GAMES } from "./games.js";

// Publishable key: it can only call the two waitlist functions (join_waitlist, waitlist_place).
const CFG = {
  brand: "GM Bet",
  siteUrl: "https://rrozenv.github.io/gmbet-b/",
  supabaseUrl: "https://dxsptaffwzefavffhrfk.supabase.co",
  supabaseKey: "sb_publishable_YRKJHEES6HwLRlD4vmr69g_V7c7P6Bx",
  source: "concept-b",
};

document.documentElement.classList.add("js");
const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;

// Every move on the page lands on a 120 BPM grid. Eighth notes for the wall, beats for the hero game and the win.
const BEAT = 500;
const EIGHTH = BEAT / 2;
const GRID0 = performance.now();
const onGrid = (t, unit = EIGHTH) => GRID0 + Math.ceil((t - GRID0) / unit) * unit;
const untilGrid = (ms, unit = BEAT) => onGrid(performance.now() + ms, unit) - performance.now();

// Closed-form damped spring, normalized to settle by t = 1. zeta 0.8 overshoots about 1.5%.
const spring = (zeta = 0.8) => {
  const w = 7 / zeta;
  const wd = w * Math.sqrt(1 - zeta * zeta);
  return (t) => (t >= 1 ? 1 : 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + ((zeta * w) / wd) * Math.sin(wd * t)));
};
const SPRING = spring(0.8);
const SPRING_SOFT = spring(0.9);
if (window.CSS && CSS.supports("transition-timing-function", "linear(0, 1)")) {
  const roll = spring(0.75);
  const pts = Array.from({ length: 41 }, (_, i) => +roll(i / 40).toFixed(4));
  document.documentElement.style.setProperty("--spring", `linear(${pts.join(", ")})`);
}
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const money = (n) => "$" + n.toFixed(2);
const dollars = (n) => "$" + (Number.isInteger(n) ? n : n.toFixed(2));
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const clock = (s) => {
  s = Math.max(0, Math.ceil(s));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
};
const fmts = {};
const timeIn = (tz) => {
  const f = fmts[tz] || (fmts[tz] = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }));
  return f.format(new Date()).replace(/\u202f/g, " ");
};
const localTz = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch (_) {
    return "UTC";
  }
})();

/* Rolling digits: each digit is a 0–9 strip that slides, so numbers count and settle without changing width. */
class Roll {
  constructor(node) {
    this.node = node;
    const start = node.textContent.trim();
    node.textContent = "";
    this.sizer = el("span", "roll-sizer", node.dataset.max || start);
    this.live = el("span", "roll-live");
    this.sizer.setAttribute("aria-hidden", "true");
    this.live.setAttribute("aria-hidden", "true");
    this.sr = el("span", "sr");
    node.append(this.sizer, this.live, this.sr);
    this.set(start, { instant: true });
  }
  set(text, { from0 = false, instant = false, delay = 0 } = {}) {
    this.sr.textContent = text;
    const pattern = text.replace(/\d/g, "0");
    let rebuilt = false;
    if (pattern !== this.pattern) {
      this.live.textContent = "";
      this.strips = [];
      for (const ch of text) {
        if (/\d/.test(ch)) {
          const wrap = el("span", "rd");
          const strip = el("span", "rd-s");
          for (let i = 0; i < 10; i++) strip.append(el("span", null, String(i)));
          wrap.append(strip);
          this.live.append(wrap);
          this.strips.push(strip);
        } else this.live.append(document.createTextNode(ch));
      }
      this.pattern = pattern;
      rebuilt = true;
    }
    const digits = [...text].filter((c) => /\d/.test(c)).map(Number);
    const token = (this.token = (this.token || 0) + 1);
    const apply = (vals, timed) =>
      this.strips.forEach((s, i) => {
        if (timed) s.style.setProperty("--dl", delay + i * (EIGHTH / 4) + "ms");
        s.style.setProperty("--d", vals[i]);
      });
    // Restarting a transition waits two frames instead of forcing a synchronous layout.
    const later2 = (fn) => requestAnimationFrame(() => requestAnimationFrame(() => token === this.token && fn()));
    if (RM || instant) {
      this.node.classList.add("no-anim");
      apply(digits, false);
      later2(() => this.node.classList.remove("no-anim"));
      return;
    }
    if (from0 || rebuilt) {
      this.node.classList.add("no-anim");
      apply(digits.map(() => 0), false);
      later2(() => {
        this.node.classList.remove("no-anim");
        apply(digits, true);
      });
      return;
    }
    this.node.classList.remove("no-anim");
    apply(digits, true);
  }
}

/* ---------- The wall ---------- */
const PEOPLE = [
  ["Anna", "Lisbon", "Europe/Lisbon"], ["Kenji", "Osaka", "Asia/Tokyo"], ["Lucas", "Toronto", "America/Toronto"],
  ["Sofia", "Madrid", "Europe/Madrid"], ["Mateo", "Bogotá", "America/Bogota"], ["Amara", "Lagos", "Africa/Lagos"],
  ["Jonas", "Berlin", "Europe/Berlin"], ["Elif", "Istanbul", "Europe/Istanbul"], ["Diego", "Lima", "America/Lima"],
  ["Hana", "Seoul", "Asia/Seoul"], ["Tom", "Sydney", "Australia/Sydney"], ["Ola", "Oslo", "Europe/Oslo"],
  ["Kai", "Taipei", "Asia/Taipei"], ["Marta", "Warsaw", "Europe/Warsaw"], ["Chloe", "Montreal", "America/Toronto"],
  ["Ivan", "Prague", "Europe/Prague"], ["Zoe", "Auckland", "Pacific/Auckland"], ["Noah", "Chicago", "America/Chicago"],
  ["Lena", "Vienna", "Europe/Vienna"], ["Theo", "Dublin", "Europe/Dublin"], ["Yuki", "Tokyo", "Asia/Tokyo"],
  ["Ana", "Santiago", "America/Santiago"], ["Ben", "Denver", "America/Denver"], ["Grace", "Nairobi", "Africa/Nairobi"],
  ["Rafael", "Manila", "Asia/Manila"], ["Emma", "Zurich", "Europe/Zurich"], ["Leo", "Miami", "America/New_York"],
  ["Mia", "Austin", "America/Chicago"], ["Aiko", "Osaka", "Asia/Tokyo"], ["Felipe", "Bogotá", "America/Bogota"],
  ["Sara", "Athens", "Europe/Athens"], ["Nico", "Buenos Aires", "America/Argentina/Buenos_Aires"],
];
const FORMATS = [
  { name: "Bullet 1+0", secs: 60, think: [0.9, 1.9] },
  { name: "Blitz 3+0", secs: 180, think: [1.5, 3.2] },
  { name: "Blitz 3+0", secs: 180, think: [1.5, 3.2] },
  { name: "Blitz 5+0", secs: 300, think: [1.9, 3.8] },
  { name: "Blitz 5+0", secs: 300, think: [1.9, 3.8] },
  { name: "Rapid 10+0", secs: 600, think: [2.6, 4.8] },
];
const STAKES = [5, 10, 20, 20, 20, 50];

const hero = $(".hero");
const wallEl = $("[data-wall]");
const feedEl = $("[data-feed]");
let cols = [];
let tiles = [];
let geo = null;
let lastFeedAt = 0;

function person() {
  const [n, c, tz] = pick(PEOPLE);
  return { n, c, tz };
}

function buildTile() {
  const t = { el: el("div", "tile") };
  t.el.innerHTML =
    '<div class="t-top"><span class="t-st"><span class="dot-live t-dot"></span><span class="t-stt">Live</span></span><span class="t-fmt"></span><span class="t-clk"></span></div>' +
    '<canvas class="t-board"></canvas>' +
    '<div class="t-ps"><div class="t-p b"><span class="t-n"></span><span class="t-r"></span><span class="t-c"></span></div>' +
    '<div class="t-p w"><span class="t-n"></span><span class="t-r"></span><span class="t-c"></span></div></div>' +
    '<div class="t-foot"><span class="t-stake"></span><span class="t-win"></span></div>';
  const q = (s) => t.el.querySelector(s);
  t.n = {
    stt: q(".t-stt"), fmt: q(".t-fmt"), clk: q(".t-clk"), stake: q(".t-stake"), win: q(".t-win"),
    pb: q(".t-p.b"), pw: q(".t-p.w"),
  };
  t.board = new Board(q("canvas"));
  return t;
}

function setPlayer(node, p, showTime) {
  node.children[0].textContent = p.n;
  node.children[1].textContent = p.r;
  node.children[2].textContent = showTime ? p.c + " · " + timeIn(p.tz) : p.c;
}

function startGame(t, now, fresh) {
  const g = pick(WALL_GAMES);
  t.moves = g.m.split(",");
  t.end = g.end;
  t.winner = g.w;
  t.fmt = pick(FORMATS);
  t.stake = pick(STAKES);
  const base = Math.round(rand(1150, 2150));
  const a = person();
  let b = person();
  while (b.n === a.n) b = person();
  t.white = { ...a, r: base + Math.round(rand(-40, 40)) };
  t.black = { ...b, r: base + Math.round(rand(-40, 40)) };
  t.board.reset();
  const startPly = fresh ? 0 : Math.floor(Math.random() * Math.max(1, t.moves.length - 3));
  for (let i = 0; i < startPly; i++) t.board.play(t.moves[i], 0);
  t.ply = startPly;
  const used = (startPly / 2) * (t.fmt.think[0] + t.fmt.think[1]) * 0.5;
  t.clocks = [t.fmt.secs - used * rand(0.8, 1.2), t.fmt.secs - used * rand(0.8, 1.2)];
  t.turnAt = now;
  t.nextAt = onGrid(now + rand(t.fmt.think[0], t.fmt.think[1]) * 1000 * (fresh ? 1.4 : rand(0.2, 1)));
  t.state = "live";
  t.shown = -1;
  t.el.classList.remove("is-won");
  t.n.stt.textContent = "Live";
  t.n.fmt.textContent = t.fmt.name;
  setPlayer(t.n.pw, t.white, geo && geo.time);
  setPlayer(t.n.pb, t.black, geo && geo.time);
  t.n.stake.textContent = "Stake " + dollars(t.stake);
  t.n.win.textContent = "Win " + dollars(t.stake * 2);
  turnUi(t);
  paintClock(t, now);
}

function turnUi(t) {
  const white = t.ply % 2 === 0;
  t.n.pw.classList.toggle("turn", white);
  t.n.pb.classList.toggle("turn", !white);
}

function paintClock(t, now) {
  if (t.state !== "live") return;
  const side = t.ply % 2;
  const left = t.clocks[side] - (now - t.turnAt) / 1000;
  const s = Math.ceil(left);
  if (s !== t.shown) {
    t.shown = s;
    t.n.clk.textContent = clock(left);
  }
}

function finish(t, now) {
  t.state = "done";
  t.doneUntil = onGrid(now + 4200, BEAT);
  const win = t.winner === "w" ? t.white : t.black;
  if (t.end === "mate") t.board.markMate(t.winner === "w" ? "b" : "w");
  t.n.stt.textContent = t.end === "mate" ? "Checkmate" : "Resigned";
  t.n.clk.textContent = "";
  t.n.pw.classList.remove("turn");
  t.n.pb.classList.remove("turn");
  t.n.stake.textContent = win.n + " won";
  t.n.win.textContent = "+" + dollars(t.stake * 2);
  t.el.classList.add("is-won");
  if (t.vis && t.cx > geo.feedMinX && now - lastFeedAt > 2400) {
    lastFeedAt = now;
    pushFeed(`<b>${win.n}</b> won <em>${dollars(t.stake * 2)}</em> · ${t.fmt.name} · ${win.c}`);
  }
}

function stepTile(t, now) {
  if (t.state === "live") {
    if (now >= t.nextAt) {
      const side = t.ply % 2;
      t.clocks[side] -= (now - t.turnAt) / 1000;
      const animate = t.vis && animating < ANIM_CAP;
      if (animate) animating++;
      t.board.play(t.moves[t.ply], animate ? 260 : 0);
      t.ply++;
      t.turnAt = now;
      if (t.ply >= t.moves.length) return finish(t, now);
      t.nextAt = onGrid(now + rand(t.fmt.think[0], t.fmt.think[1]) * 1000);
      turnUi(t);
      t.shown = -1;
    }
    if (t.vis) paintClock(t, now);
  } else if (now >= t.doneUntil) {
    startGame(t, now, true);
  }
}

function layoutWall() {
  const w = wallEl.clientWidth;
  const h = wallEl.clientHeight;
  if (!w || !h) return;
  const desk = innerWidth >= 1024;
  const tab = innerWidth >= 720;
  const g = {
    w, h,
    tw: desk ? 248 : tab ? 224 : 200,
    tb: desk ? 88 : tab ? 80 : 64,
    gap: desk ? 16 : tab ? 16 : 8,
    time: desk || tab,
  };
  g.th = g.tb + 72;
  g.feedMinX = desk ? w * 0.42 : 0;
  const key = [w, Math.round(h / 200), g.tw].join("|");
  if (geo && geo.key === key) return;
  g.key = key;
  geo = g;
  const pitchX = g.tw + g.gap;
  const pitchY = g.th + g.gap;
  const n = Math.ceil((w + g.gap) / pitchX);
  const x0 = Math.round((w - (n * pitchX - g.gap)) / 2);
  const rows = Math.ceil(h / pitchY) + 2;
  tileIO.disconnect();
  wallEl.textContent = "";
  wallEl.classList.toggle("compact", !g.time);
  wallEl.style.setProperty("--tw", g.tw + "px");
  wallEl.style.setProperty("--th", g.th + "px");
  cols = [];
  tiles = [];
  const now = performance.now();
  const speeds = [13, 9, 16, 11, 14, 10, 15, 12];
  for (let c = 0; c < n; c++) {
    const colEl = el("div", "wall-col");
    const col = { el: colEl, x: x0 + c * pitchX, offset: Math.round(rand(0, pitchY)), speed: speeds[c % speeds.length], pitchY, rows, tiles: [] };
    for (let r = 0; r < rows; r++) {
      const t = buildTile();
      t.el.style.setProperty("--tb", g.tb + "px");
      t.col = col;
      t.y = r * pitchY - pitchY;
      t.el.style.transform = `translate3d(0,${t.y}px,0)`;
      colEl.append(t.el);
      tileOf.set(t.el, t);
      tileIO.observe(t.el);
      col.tiles.push(t);
      tiles.push(t);
    }
    colEl.style.transform = `translate3d(${col.x}px,${-col.offset}px,0)`;
    wallEl.append(colEl);
    cols.push(col);
  }
  for (const t of tiles) {
    t.board.size();
    startGame(t, now, false);
  }
}

function moveWall(dt) {
  for (const col of cols) {
    col.offset += col.speed * dt;
    col.el.style.transform = `translate3d(${col.x}px,${-col.offset.toFixed(2)}px,0)`;
    const top = col.offset - col.pitchY * 1.5;
    for (const t of col.tiles) {
      if (t.y < top) {
        t.y += col.rows * col.pitchY;
        t.el.style.transform = `translate3d(0,${t.y}px,0)`;
        startGame(t, performance.now(), false);
      }
    }
  }
}

/* ---------- Payout feed ---------- */
let feed = [];
function pushFeed(html, cls = "", instant = false) {
  const item = el("span", "fi is-new " + cls);
  item.innerHTML = html;
  item.style.transition = "none";
  item.style.setProperty("--fx", "-2000px");
  feedEl.prepend(item);
  const w = item.offsetWidth;
  item.style.setProperty("--fx", -w + "px");
  void item.offsetWidth;
  item.style.transition = "";
  feed.unshift({ item, w });
  const apply = () => {
    let x = 0;
    for (const f of feed) {
      f.x = x;
      f.item.style.setProperty("--fx", x + "px");
      x += f.w;
    }
    const limit = feedEl.clientWidth + 400;
    feed = feed.filter((f) => {
      if (f.x > limit) {
        setTimeout(() => f.item.remove(), 800);
        return false;
      }
      return true;
    });
  };
  if (instant || RM) {
    feed.forEach((f) => (f.item.style.transition = "none"));
    apply();
    void feedEl.offsetWidth;
    feed.forEach((f) => (f.item.style.transition = ""));
    item.classList.remove("is-new");
  } else {
    requestAnimationFrame(apply);
    setTimeout(() => item.classList.remove("is-new"), 1800);
  }
}

function seedFeed() {
  for (let i = 0; i < 8; i++) {
    const p = person();
    const s = pick(STAKES);
    pushFeed(`<b>${p.n}</b> won <em>${dollars(s * 2)}</em> · ${pick(FORMATS).name} · ${p.c}`, "", true);
  }
}

/* ---------- Bet slip ---------- */
const OPPONENTS = [
  { n: "Min", c: "Seoul", tz: "Asia/Seoul", r: 1541 },
  { n: "Ana", c: "Lisbon", tz: "Europe/Lisbon", r: 1528 },
  { n: "Kenji", c: "Osaka", tz: "Asia/Tokyo", r: 1556 },
  { n: "Amara", c: "Lagos", tz: "Africa/Lagos", r: 1547 },
  { n: "Jonas", c: "Berlin", tz: "Europe/Berlin", r: 1519 },
  { n: "Tom", c: "Sydney", tz: "Australia/Sydney", r: 1538 },
];
const slip = $("[data-slip]");
const swipe = $("[data-swipe]");
const thumb = $("[data-thumb]");
const chips = $$("[data-stake]");
const winRoll = new Roll($("[data-roll-win]"));
const slipBoard = new Board($("[data-slip-board]"));
const S = { state: "idle", stake: 20, opp: OPPONENTS[0], oi: 0, timers: [] };
const clkW = $("[data-clk-w]");
const clkB = $("[data-clk-b]");
const statusEl = $("[data-status]");
const IDLE_STATUS = "Blitz 5+0 · Rated on Chess.com";

function renderOpp() {
  const o = S.opp;
  $("[data-opp-ava]").textContent = o.n[0];
  $("[data-opp-name]").textContent = o.n;
  $("[data-opp-r]").textContent = o.r;
  $("[data-opp-sub]").textContent = o.c + " · " + timeIn(o.tz);
  $("[data-you-sub]").textContent = "Here · " + timeIn(localTz);
}

function renderStake(animate = true) {
  const s = S.stake;
  chips.forEach((c) => c.setAttribute("aria-checked", String(Number(c.dataset.stake) === s)));
  $("[data-math]").textContent = `Stake ${dollars(s)} · ${dollars(s * 0.05)} fee`;
  $("[data-swipe-label]").textContent = `Swipe to bet ${dollars(s)}`;
  $("[data-pot]").textContent = dollars(s * 2);
  thumb.setAttribute("aria-label", `Bet ${dollars(s)} to win ${dollars(s * 2)}, plus a ${dollars(s * 0.05)} fee. Tap, or drag to the right.`);
  winRoll.set(money(s * 2), { instant: !animate });
}

const thumbMax = () => swipe.clientWidth - thumb.offsetWidth - 8;
function setThumb(x) {
  const max = thumbMax();
  thumb.style.setProperty("--x", x + "px");
  swipe.style.setProperty("--p", ((x + thumb.offsetWidth + 4) / swipe.clientWidth).toFixed(4));
  swipe.style.setProperty("--q", (x / max).toFixed(4));
}

let drag = null;
function onDown(e) {
  if (S.state !== "idle" || e.button > 0) return;
  drag = { id: e.pointerId, x0: e.clientX, start: e.target === thumb || thumb.contains(e.target) ? 0 : null, moved: 0 };
  swipe.setPointerCapture(e.pointerId);
  swipe.classList.remove("is-idle");
}
function onMove(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x0;
  drag.moved = Math.max(drag.moved, Math.abs(dx));
  if (drag.moved < 4) return;
  swipe.classList.add("is-drag");
  const x = Math.max(0, Math.min(thumbMax(), (drag.start ?? 0) + dx));
  drag.x = x;
  setThumb(x);
}
function onUp(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag;
  drag = null;
  swipe.classList.remove("is-drag");
  const onThumb = d.start === 0;
  if ((d.x || 0) > thumbMax() * 0.72 || (onThumb && d.moved < 6)) commit();
  else {
    setThumb(0);
    swipe.classList.add("is-idle");
  }
}
swipe.addEventListener("pointerdown", onDown);
swipe.addEventListener("pointermove", onMove);
swipe.addEventListener("pointerup", onUp);
swipe.addEventListener("pointercancel", onUp);
thumb.addEventListener("click", (e) => {
  if (e.detail === 0) commit();
});

const later = (fn, ms) => S.timers.push(setTimeout(fn, RM ? Math.min(ms, 300) : ms));

function commit() {
  if (S.state !== "idle") return;
  S.state = "live";
  slip.dataset.state = "live";
  swipe.classList.remove("is-idle");
  swipe.classList.add("is-done");
  setThumb(thumbMax());
  if (navigator.vibrate) navigator.vibrate(12);
  sweep();
  if (MOTION) G.to(wallEl, { scale: 1.06, duration: 1.5, ease: SPRING_SOFT });
  chips.forEach((c) => (c.disabled = true));
  $("[data-next]").disabled = true;
  $("[data-slip-title]").textContent = `Matched with ${S.opp.n}`;
  $("[data-win-label]").textContent = "Pot locked in escrow";
  statusEl.innerHTML = "<b>Live</b> · Move 1 · You";
  const pot = S.stake * 2;
  const clocks = [300, 300];
  const moves = HERO_GAME.m.split(",");
  clkW.classList.add("on");
  let ply = 0;
  const step = () => {
    const side = ply % 2;
    clocks[side] -= Math.round(rand(2, 9));
    (side ? clkB : clkW).textContent = clock(clocks[side]);
    slipBoard.play(moves[ply], RM ? 0 : 220);
    ply++;
    clkW.classList.toggle("on", ply % 2 === 0 && ply < moves.length);
    clkB.classList.toggle("on", ply % 2 === 1 && ply < moves.length);
    if (ply < moves.length) {
      statusEl.innerHTML = `<b>Live</b> · Move ${Math.ceil((ply + 1) / 2)} · ${ply % 2 ? S.opp.n : "You"}`;
      later(step, ply % 2 ? untilGrid(EIGHTH * 0.6, EIGHTH) : untilGrid(BEAT * 0.8, EIGHTH));
    } else later(() => won(pot), untilGrid(EIGHTH * 0.6, EIGHTH));
  };
  if (RM) {
    moves.forEach((m) => slipBoard.play(m, 0));
    later(() => won(pot), 200);
  } else later(step, untilGrid(BEAT * 1.5));
}

function won(pot) {
  S.state = "won";
  slip.dataset.state = "won";
  slipBoard.markMate("b");
  clkW.classList.remove("on");
  clkB.classList.remove("on");
  $("[data-slip-title]").textContent = "You won";
  $("[data-win-label]").textContent = "Paid in USDC";
  statusEl.innerHTML = "<b>Checkmate</b> · Nd6#";
  winRoll.set("+" + money(pot), { from0: true });
  sweep();
  ripple();
  if (MOTION) G.fromTo(glow, { opacity: 1 }, { opacity: 0.55, duration: 0.25, yoyo: true, repeat: 3, ease: "power1.inOut" });
  const msg = `<b>You</b> won <em>${money(pot)}</em> · vs ${S.opp.n} · ${S.opp.c}`;
  later(() => fly("+" + money(pot), $("[data-roll-win]")).then(() => pushFeed(msg, "is-you")), untilGrid(BEAT * 0.8));
  later(resetSlip, 9000);
}

let sweepAlt = false;
function sweep() {
  sweepAlt = !sweepAlt;
  slip.classList.remove(sweepAlt ? "is-sweep" : "is-sweep2");
  slip.classList.add(sweepAlt ? "is-sweep2" : "is-sweep");
}

function resetSlip() {
  if (!heroVisible && S.state === "won") return later(resetSlip, 2000);
  if (MOTION) G.to(wallEl, { scale: 1, duration: 1.5, ease: SPRING_SOFT });
  S.timers.forEach(clearTimeout);
  S.timers = [];
  S.state = "idle";
  slip.dataset.state = "idle";
  slipBoard.reset();
  clkW.textContent = clkB.textContent = "5:00";
  clkW.classList.remove("on");
  clkB.classList.remove("on");
  swipe.classList.remove("is-done");
  swipe.classList.add("is-idle");
  setThumb(0);
  chips.forEach((c) => (c.disabled = false));
  $("[data-next]").disabled = false;
  $("[data-slip-title]").textContent = "Open challenge";
  $("[data-win-label]").textContent = "Win";
  statusEl.textContent = IDLE_STATUS;
  renderStake(true);
}

function swapOpp(o, stake) {
  if (S.state !== "idle") return;
  S.opp = o;
  if (stake) S.stake = stake;
  renderOpp();
  renderStake(true);
  if (MOTION) G.fromTo(slip, { scale: 0.985 }, { scale: 1, duration: 0.5, ease: SPRING, clearProps: "transform" });
}

chips.forEach((c) =>
  c.addEventListener("click", () => {
    if (S.state !== "idle") return;
    S.stake = Number(c.dataset.stake);
    renderStake(true);
  })
);
$(".chips").addEventListener("keydown", (e) => {
  const i = chips.indexOf(document.activeElement);
  if (i < 0 || !["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
  e.preventDefault();
  const next = chips[(i + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : chips.length - 1)) % chips.length];
  next.focus();
  next.click();
});
$("[data-next]").addEventListener("click", () => {
  S.oi = (S.oi + 1) % OPPONENTS.length;
  swapOpp(OPPONENTS[S.oi]);
});
$("[data-again]").addEventListener("click", () => {
  resetSlip();
  thumb.focus({ preventScroll: true });
});
wallEl.addEventListener("click", (e) => {
  const tileEl = e.target.closest(".tile");
  const t = tileEl && tiles.find((x) => x.el === tileEl);
  if (!t) return;
  const p = t.state === "done" ? (t.winner === "w" ? t.white : t.black) : t.white;
  swapOpp({ n: p.n, c: p.c, tz: p.tz, r: p.r }, t.stake);
});

/* ---------- World clocks ---------- */
function paintTimes() {
  const far = /Seoul|Tokyo/.test(localTz) ? ["America/New_York", "in New York"] : ["Asia/Seoul", "in Seoul"];
  $("[data-here]").textContent = timeIn(localTz);
  $("[data-there]").textContent = timeIn(far[0]);
  $("[data-there-city]").textContent = far[1];
  if (S.state === "idle") renderOpp();
}

/* ---------- Loop ---------- */
// One loop for everything: GSAP's ticker drives Lenis, the wall, and the boards in the same requestAnimationFrame.
const PHONE = matchMedia("(max-width: 719px)").matches;
const ANIM_CAP = PHONE ? 4 : 8;
const DRAW_CAP = PHONE ? 6 : 10;
let animating = 0;
let running = false;
let last = 0;
let heroVisible = true;

// Visibility comes from the browser's own intersection pass, so the loop never forces a layout read.
const tileOf = new WeakMap();
const tileIO = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const t = tileOf.get(e.target);
    if (!t) continue;
    if (e.isIntersecting && !t.vis) t.board.dirty = true;
    t.vis = e.isIntersecting;
    const r = e.boundingClientRect;
    t.cx = r.left + r.width / 2;
    t.cy = r.top + r.height / 2;
  }
});

function frame() {
  if (!running) return;
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (heroVisible && !RM && tiles.length) {
    animating = 0;
    for (const t of tiles) if (t.board.anim) animating++;
    moveWall(dt);
    for (const t of tiles) stepTile(t, now);
    let draws = 0;
    for (const t of tiles) if (t.vis && t.board.anim && draws < DRAW_CAP) (t.board.frame(now), draws++);
    for (const t of tiles) if (t.vis && t.board.dirty && !t.board.anim && draws < DRAW_CAP) (t.board.frame(now), draws++);
  }
  slipBoard.frame(now);
  storyBoard.frame(now);
}
function run() {
  if (running) return;
  running = true;
  last = performance.now();
  if (G) G.ticker.add(frame);
  else {
    const loop = () => (frame(), requestAnimationFrame(loop));
    requestAnimationFrame(loop);
  }
}

/* ---------- Motion: smooth scroll, intro, scroll choreography ---------- */
const G = window.gsap;
const ST = window.ScrollTrigger;
const MOTION = !!(G && ST) && !RM;
if (G && ST) G.registerPlugin(ST);
const cam = $("[data-cam]");
const glow = $("[data-glow]");
let lenis = null;

function setUpScroll() {
  if (MOTION && window.Lenis) {
    lenis = new window.Lenis({ lerp: 0.085, wheelMultiplier: 0.95 });
    lenis.on("scroll", ST.update);
    G.ticker.add((t) => lenis.raf(t * 1000));
    G.ticker.lagSmoothing(0);
    window.__lenis = lenis;
  }
  $$('a[href^="#"]').forEach((a) =>
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      const target = id === "#top" ? 0 : $(id);
      if (target == null) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(target, { offset: target === 0 ? 0 : -64, duration: 1.6 });
      else if (target === 0) scrollTo({ top: 0 });
      else target.scrollIntoView({ behavior: RM ? "auto" : "smooth" });
    })
  );
}

function placeGlow() {
  const h = glow.parentElement.getBoundingClientRect();
  const s = slip.getBoundingClientRect();
  glow.style.transform = `translate3d(${s.left - h.left + s.width / 2}px,${s.top - h.top + s.height / 2}px,0)`;
}

function intro() {
  const root = document.documentElement;
  if (!MOTION) {
    root.classList.remove("intro");
    return;
  }
  const plane = wallEl;
  const slipC = { x: 0, y: 0 };
  const sr = slip.getBoundingClientRect();
  slipC.x = sr.left + sr.width / 2;
  slipC.y = sr.top + sr.height / 2;
  const tileEls = tiles.map((t) => t.el);
  const delays = new Map(
    tileEls.map((t) => {
      const r = t.getBoundingClientRect();
      return [t, Math.hypot(r.left + r.width / 2 - slipC.x, r.top + r.height / 2 - slipC.y)];
    })
  );
  // Positions are in beats at 120 BPM; the tile wave steps in sixteenth notes.
  const b = (n) => (n * BEAT) / 1000;
  const sixteenth = b(0.25);
  const tl = G.timeline({ defaults: { ease: SPRING }, onComplete: () => root.classList.remove("intro") });
  tl.set([".wall", ".slip-glow"], { opacity: 1 }, 0)
    .fromTo(plane, { rotationX: 62, rotationZ: -20, scale: 1.3, yPercent: 6 }, { rotationX: 30, rotationZ: -9, scale: 1, yPercent: 0, duration: b(6), ease: spring(0.95) }, 0)
    .fromTo(tileEls, { opacity: 0 }, { opacity: 1, duration: b(1.5), ease: "power2.out", stagger: (i, t) => Math.round(delays.get(t) / 1500 / sixteenth) * sixteenth }, 0)
    .fromTo(".eyebrow", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: b(1.5) }, b(0.5))
    .fromTo(slip, { opacity: 0, y: 72, rotationX: 16, scale: 0.94, transformPerspective: 1200, transformOrigin: "50% 100%" }, { opacity: 1, y: 0, rotationX: 0, scale: 1, duration: b(3), clearProps: "transform" }, b(2))
    .fromTo(glow, { opacity: 0 }, { opacity: 1, duration: b(4), ease: "power2.out" }, b(2))
    .add(() => {
      winRoll.set(money(S.stake * 2), { from0: true });
      sweep();
    }, b(3))
    .fromTo([".lede", ".ctas", ".beta"], { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: b(2), stagger: b(0.5) }, b(3))
    .fromTo(".feed", { opacity: 0, yPercent: 100 }, { opacity: 1, yPercent: 0, duration: b(2) }, b(4));
}

function setUpChoreography() {
  if (!MOTION) return;
  if (matchMedia("(pointer: fine)").matches) {
    const rx = G.quickTo(cam, "rotationX", { duration: 1.4, ease: "power3.out" });
    const ry = G.quickTo(cam, "rotationY", { duration: 1.4, ease: "power3.out" });
    hero.addEventListener("pointermove", (e) => {
      ry((e.clientX / innerWidth - 0.5) * 7);
      rx(-(e.clientY / innerHeight - 0.5) * 5);
    });
  }
  const exit = { trigger: hero, start: "top top", end: "bottom top", scrub: true };
  G.to(cam, { z: -360, yPercent: -8, ease: "none", scrollTrigger: exit });
  G.to(".hero-in", { y: -96, ease: "none", scrollTrigger: { ...exit } });
  G.to(".wall-shade", { opacity: 0.4, ease: "none", scrollTrigger: { ...exit } });

  G.fromTo(
    ".ticket",
    { rotationX: 26, y: 96, scale: 0.88, transformPerspective: 1400, transformOrigin: "50% 100%" },
    { rotationX: 0, y: 0, scale: 1, ease: "none", scrollTrigger: { trigger: ".story", start: "top bottom", end: "top top", scrub: true } }
  );
  G.from(".hours-head > *", { opacity: 0, y: 40, duration: 1.2, ease: SPRING, stagger: 0.1, scrollTrigger: { trigger: ".hours", start: "top 75%" } });
  G.from(".link-copy > *, .link-card", { opacity: 0, y: 48, duration: 1.25, ease: SPRING, stagger: 0.125, scrollTrigger: { trigger: "#link", start: "top 75%" } });
  G.from(".sec-math .h2", { opacity: 0, y: 40, duration: 1.2, ease: SPRING, scrollTrigger: { trigger: ".sec-math", start: "top 75%" } });
  G.from(".m-cell", { opacity: 0, y: 64, duration: 1.3, ease: SPRING, stagger: 0.12, scrollTrigger: { trigger: ".math", start: "top 80%" } });
  G.from([".math-note", ".token-line"], { opacity: 0, y: 24, duration: 1, ease: SPRING, stagger: 0.1, scrollTrigger: { trigger: ".math-note", start: "top 90%" } });
  G.from("#friends .h2, #friends .sub", { opacity: 0, y: 40, duration: 1.2, ease: SPRING, stagger: 0.1, scrollTrigger: { trigger: "#friends", start: "top 75%" } });
  G.from(".fr", { opacity: 0, y: 80, rotationX: 14, transformPerspective: 1200, transformOrigin: "50% 0%", duration: 1.4, ease: SPRING, stagger: 0.12, scrollTrigger: { trigger: ".friends", start: "top 82%" } });
  G.from(".share-card", { rotation: -14, y: 24, scale: 0.9, duration: 1.6, ease: "elastic.out(1, 0.6)", scrollTrigger: { trigger: ".friends", start: "top 70%" } });
  G.from(".follow li", { opacity: 0, x: 32, duration: 1, ease: SPRING, stagger: 0.1, scrollTrigger: { trigger: ".friends", start: "top 70%" } });
  G.from(".join-copy > *, .join-card", { opacity: 0, y: 48, duration: 1.3, ease: SPRING, stagger: 0.1, scrollTrigger: { trigger: "#join", start: "top 75%" } });
}

function setUpMathRolls() {
  const rolls = $$("[data-roll-math]").map((n) => new Roll(n));
  const row = $("[data-math-row]");
  new IntersectionObserver(
    (entries, io) => {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      rolls.forEach((r, i) => r.set("$" + r.node.dataset.rollMath, { from0: true, delay: 250 + i * 200 }));
    },
    { threshold: 0.4 }
  ).observe(row);
}

/* ---------- World clocks ---------- */
const CITIES = [
  ["New York", "America/New_York"], ["São Paulo", "America/Sao_Paulo"], ["Lisbon", "Europe/Lisbon"], ["Berlin", "Europe/Berlin"],
  ["Istanbul", "Europe/Istanbul"], ["Bangkok", "Asia/Bangkok"], ["Singapore", "Asia/Singapore"], ["Seoul", "Asia/Seoul"],
  ["Sydney", "Australia/Sydney"], ["Auckland", "Pacific/Auckland"], ["Honolulu", "Pacific/Honolulu"], ["Los Angeles", "America/Los_Angeles"],
  ["Mexico City", "America/Mexico_City"],
];
function setUpHours() {
  const track = $("[data-hours]");
  const items = CITIES.map(([name, tz]) => {
    const node = el("div", "hr");
    node.innerHTML = `<div class="hr-time"><span class="hr-t roll num" data-max="12:00">0:00</span><span class="hr-ap"></span></div><div class="hr-c"><span>${name}</span></div>`;
    track.append(node);
    const fmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hourCycle: "h12", timeZone: tz });
    const h24 = new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: tz });
    return { node, roll: new Roll(node.querySelector(".hr-t")), ap: node.querySelector(".hr-ap"), city: node.querySelector(".hr-c"), fmt, h24, tag: null };
  });
  let shown = false;
  const paint = (animate) => {
    const now = new Date();
    for (const it of items) {
      const parts = Object.fromEntries(it.fmt.formatToParts(now).map((p) => [p.type, p.value]));
      const h = Number(it.h24.format(now)) % 24;
      const t = `${parts.hour}:${parts.minute}`;
      if (t !== it.t) {
        it.t = t;
        it.roll.set(t, animate ? { from0: !shown } : { instant: true });
      }
      it.ap.textContent = (parts.dayPeriod || "").toUpperCase();
      const morning = h >= 5 && h < 12;
      it.node.classList.toggle("night", h < 6 || h >= 21);
      if (morning && !it.tag) {
        it.tag = el("i", "gm", "gm");
        it.city.append(it.tag);
      } else if (!morning && it.tag) {
        it.tag.remove();
        it.tag = null;
      }
    }
  };
  paint(false);
  new IntersectionObserver(
    (entries, io) => {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      items.forEach((it) => (it.t = null));
      paint(true);
      shown = true;
    },
    { threshold: 0.3 }
  ).observe(track);
  setInterval(() => paint(true), 10000);
  if (MOTION)
    G.fromTo(
      track,
      { x: () => innerWidth * 0.15 },
      { x: () => -(track.scrollWidth - innerWidth * 0.85), ease: "none", scrollTrigger: { trigger: ".hours", start: "top bottom", end: "bottom top", scrub: 0.6, invalidateOnRefresh: true } }
    );
}

/* ---------- How it works: one ticket, scrubbed by scroll ---------- */
const storyBoard = new Board($("[data-story-board]"));
function setUpStory() {
  const pin = $("[data-story]");
  const steps = $$(".story-steps li");
  const screens = $$(".tk-s");
  const typeEl = $("[data-story-type]");
  const rows = $$(".tk-row");
  const sw = $("[data-tk-swipe]");
  const bar = $("[data-story-bar]");
  const prog = $$("[data-tk-prog] i");
  const roll = new Roll($("[data-story-roll]"));
  const pay = $("[data-story-roll]");
  const stateEl = $("[data-tk-state]");
  const subEl = $("[data-tk-sub]");
  const moves = HERO_GAME.m.split(",");
  const word = "rob_nyc";
  const titles = ["Link your Chess.com account", "Bet in one swipe", "Play and get paid"];
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const cache = new WeakMap();
  const set = (node, prop, value) => {
    const c = cache.get(node) || {};
    if (c[prop] === value) return;
    c[prop] = value;
    cache.set(node, c);
    node.style.setProperty(prop, value);
  };
  let step = 0;
  let ply = 0;
  let paid = false;

  const show = (n) => {
    if (n === step) return;
    const prev = step;
    step = n;
    steps.forEach((li, i) => li.classList.toggle("is-on", i === n));
    $("[data-tk-title]").textContent = titles[n];
    screens.forEach((s, i) => {
      s.classList.toggle("is-on", i === n);
      if (!G) return;
      const dir = n > prev ? 1 : -1;
      if (i === n) G.fromTo(s, { autoAlpha: 0, y: 32 * dir }, { autoAlpha: 1, y: 0, duration: RM ? 0 : 0.75, ease: SPRING, overwrite: true });
      else if (i === prev) G.to(s, { autoAlpha: 0, y: -32 * dir, duration: RM ? 0 : 0.25, ease: "power2.in", overwrite: true });
      else G.set(s, { autoAlpha: 0 });
    });
  };

  const playTo = (t) => {
    if (t === ply) return;
    if (t === ply + 1) storyBoard.play(moves[ply], RM ? 0 : 280);
    else {
      storyBoard.reset();
      for (let i = 0; i < t; i++) storyBoard.play(moves[i], 0);
    }
    ply = t;
    const done = ply === moves.length;
    stateEl.textContent = done ? "Checkmate · Nd6#" : ply ? `Live · Move ${Math.ceil((ply + 1) / 2)}` : "Matched with Min";
    if (done && !paid) {
      paid = true;
      storyBoard.markMate("b");
      pay.classList.add("is-paid");
      roll.set("+$40.00", { from0: true });
      subEl.textContent = "Paid in USDC";
    } else if (!done && paid) {
      paid = false;
      pay.classList.remove("is-paid");
      roll.set("$0.00", { instant: true });
      subEl.textContent = "Pot $40 in escrow";
    }
  };

  const update = (p) => {
    const n = p < 0.32 ? 0 : p < 0.64 ? 1 : 2;
    show(n);
    const local = clamp(n === 0 ? p / 0.32 : n === 1 ? (p - 0.32) / 0.32 : (p - 0.64) / 0.36);
    set(bar, "transform", `scaleY(${p.toFixed(3)})`);
    prog.forEach((seg, i) => set(seg, "--f", clamp((p - i * 0.32) / 0.32).toFixed(3)));
    const typed = word.slice(0, n > 0 ? word.length : Math.floor(clamp(local / 0.45) * word.length));
    if (typed !== typeEl.textContent) typeEl.textContent = typed;
    rows.forEach((r, i) => r.classList.toggle("on", n > 0 || local > 0.5 + i * 0.11));
    const q = n > 1 ? 1 : n < 1 ? 0 : clamp((local - 0.15) / 0.6);
    set(sw, "--q", q.toFixed(3));
    sw.classList.toggle("is-done", q >= 1);
    playTo(n < 2 ? 0 : Math.round(clamp(local / 0.72) * moves.length));
  };

  storyBoard.size();
  update(0);
  if (ST && G) {
    ST.create({
      trigger: pin,
      start: "top top",
      end: () => "+=" + Math.round(innerHeight * 2.6),
      pin: true,
      anticipatePin: 1,
      onUpdate: (self) => update(self.progress),
    });
  }
}

/* ---------- The win ripples across the wall ---------- */
function ripple() {
  if (!MOTION) return;
  const h = hero.getBoundingClientRect();
  const s = slip.getBoundingClientRect();
  const cx = s.left + s.width / 2;
  const cy = s.top + s.height * 0.4;
  const ring = el("span", "shock");
  ring.style.left = cx - h.left + "px";
  ring.style.top = cy - h.top + "px";
  hero.insertBefore(ring, $(".wall-tag"));
  G.fromTo(ring, { scale: 0.4, opacity: 1 }, { scale: 9, opacity: 0, duration: 2.2, ease: "power2.out", onComplete: () => ring.remove() });
  for (const t of tiles) {
    if (!t.vis) continue;
    const d = Math.hypot(t.cx - cx, t.cy - cy) / 1100;
    G.delayedCall(d, () => t.el.classList.add("ripple"));
    G.delayedCall(d + 0.32, () => t.el.classList.remove("ripple"));
  }
}

/* ---------- Payout flight ---------- */
function fly(text, from) {
  const f = feedEl.getBoundingClientRect();
  if (!MOTION || f.top > innerHeight || f.bottom < 0) return Promise.resolve();
  const a = from.getBoundingClientRect();
  const chip = el("span", "fly", text);
  document.body.append(chip);
  const x1 = f.left + 16;
  const y1 = f.top + 10;
  G.set(chip, { x: a.left, y: a.top - 44, scale: 0.6, opacity: 0, transformOrigin: "0% 50%" });
  return new Promise((done) => {
    G.timeline({ onComplete: () => (chip.remove(), done()) })
      .to(chip, { opacity: 1, scale: 1, duration: 0.25, ease: SPRING })
      .to(chip, { x: x1, duration: 0.75, ease: "power3.inOut" }, 0.25)
      .to(chip, { y: y1, duration: 0.75, ease: "back.in(1.2)" }, 0.25)
      .to(chip, { scale: 0.8, opacity: 0, duration: 0.125, ease: "power2.in" }, 0.875);
  });
}

/* ---------- Link your Chess.com account: live lookup on the public API ---------- */
function setUpLookup() {
  const form = $("[data-lookup]");
  const input = $("[data-lookup-input]");
  const btn = $("[data-lookup-btn]");
  const box = $("[data-me]");
  const msg = $("[data-me-msg]");
  const live = $("[data-me-live]");
  const ava = $("[data-me-ava]");
  const FORMATS = [["chess_blitz", "Blitz"], ["chess_rapid", "Rapid"], ["chess_bullet", "Bullet"]];
  let ctrl = null;

  const state = (s, text = "") => {
    box.dataset.state = s;
    msg.textContent = text;
    live.textContent = text;
  };
  const getJSON = async (url, signal) => {
    const r = await fetch(url, { signal });
    if (r.status === 404) throw Object.assign(new Error("missing"), { missing: true });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  };
  const prefill = (u) => {
    const f = $('input[name="chess_username"]');
    if (f && !f.value) f.value = u;
  };

  const render = (p, s, u) => {
    const shown = (p.url || "").split("/").pop() || p.username || u;
    $("[data-me-name]").textContent = shown;
    const country = (p.country || "").split("/").pop();
    $("[data-me-sub]").textContent = [p.title, p.name, country].filter(Boolean).join(" · ") || "Chess.com member";
    $("[data-me-ini]").textContent = shown[0].toUpperCase();
    ava.hidden = true;
    if (p.avatar) {
      ava.onload = () => (ava.hidden = false);
      ava.onerror = () => (ava.hidden = true);
      ava.src = p.avatar;
    }
    let best = null;
    for (const [key, label] of FORMATS) {
      const f = s[key];
      $(`[data-me-r="${key}"]`).textContent = f && f.last ? f.last.rating : "–";
      const rec = f && f.record;
      const games = rec ? rec.win + rec.loss + rec.draw : 0;
      if (games && (!best || games > best.games)) best = { label, rec, games };
    }
    const n = (v) => Number(v).toLocaleString("en-US");
    $("[data-me-rec]").textContent = best
      ? `${best.label} record: ${n(best.rec.win)} wins · ${n(best.rec.loss)} losses · ${n(best.rec.draw)} draws`
      : "No rated live games yet.";
    const rating = (s.chess_blitz && s.chess_blitz.last) || (s.chess_rapid && s.chess_rapid.last) || (s.chess_bullet && s.chess_bullet.last);
    const you = $(".pl-you");
    you.querySelector(".pl-name").textContent = shown.length > 12 ? shown.slice(0, 11) + "…" : shown;
    you.querySelector(".ava").textContent = shown[0].toUpperCase();
    if (rating) you.querySelector(".pl-r").textContent = rating.rating;
    prefill(shown);
    box.dataset.state = "found";
    msg.textContent = "";
    live.textContent = `Found ${shown}. This is you? You’re ready to play.`;
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const u = input.value.trim().toLowerCase();
    if (!/^[a-z0-9_-]{3,25}$/.test(u)) {
      state("missing", "Chess.com usernames are 3 to 25 letters, numbers, dashes, or underscores.");
      input.focus();
      return;
    }
    if (ctrl) ctrl.abort();
    const mine = (ctrl = new AbortController());
    const timer = setTimeout(() => mine.abort(), 7000);
    state("loading");
    live.textContent = `Looking up ${u} on Chess.com…`;
    btn.disabled = true;
    try {
      const [p, s] = await Promise.all([
        getJSON(`https://api.chess.com/pub/player/${u}`, mine.signal),
        getJSON(`https://api.chess.com/pub/player/${u}/stats`, mine.signal).catch((err) => {
          if (err.name === "AbortError") throw err;
          return {};
        }),
      ]);
      if (mine === ctrl) render(p, s, u);
    } catch (err) {
      if (mine !== ctrl) return;
      if (err.missing) state("missing", `No Chess.com account found for “${u}”. Check the spelling and try again.`);
      else {
        state("error", "We couldn’t reach Chess.com just now. You can still save your spot with your username.");
        prefill(u);
      }
    } finally {
      clearTimeout(timer);
      if (mine === ctrl) btn.disabled = false;
    }
  });
}

/* ---------- Waitlist ---------- */
function setUpWaitlist() {
  const form = $("[data-form]");
  const store = {
    get: (k) => {
      try {
        return localStorage.getItem(k);
      } catch (_) {
        return null;
      }
    },
    set: (k, v) => {
      try {
        localStorage.setItem(k, v);
      } catch (_) {}
    },
  };
  const team = $("[data-team]");
  const teamBox = form.querySelector('input[name="roles"][value="team"]');
  const status = $("[data-status-form]");
  const button = form.querySelector('button[type="submit"]');
  const done = $("[data-done]");
  const placeRoll = new Roll($("[data-place]"));
  const refs = $("[data-refs]");
  const invite = $("[data-invite]");
  const copy = $("[data-copy]");
  const share = $("[data-share]");
  const CODE = /^[a-z2-9]{7}$/;

  const rpc = (fn, body) =>
    fetch(CFG.supabaseUrl + "/rest/v1/rpc/" + fn, {
      method: "POST",
      headers: { apikey: CFG.supabaseKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  const incoming = (new URLSearchParams(location.search).get("ref") || "").toLowerCase();
  if (CODE.test(incoming)) store.set("gm_ref", incoming);
  const ref = store.get("gm_ref");
  if (ref && ref !== store.get("gm_code")) $("[data-invited]").hidden = false;

  const show = (info, already) => {
    store.set("gm_code", info.code);
    if (already) $("[data-done-msg]").textContent = "You were already on it. We’ll email you when the beta opens in October.";
    const r = Number(info.referrals) || 0;
    refs.textContent = r + (r === 1 ? " friend" : " friends") + " joined with your link";
    invite.value = CFG.siteUrl + "?ref=" + info.code;
    if (navigator.share) share.hidden = false;
    form.hidden = true;
    done.hidden = false;
    placeRoll.set("#" + Number(info.position), { from0: true, delay: 200 });
  };

  const saved = store.get("gm_code");
  if (saved && CODE.test(saved)) {
    rpc("waitlist_place", { p_code: saved })
      .then((r) => (r.ok ? r.json() : null))
      .then((info) => info && info.code && show(info, false))
      .catch(() => {});
  }

  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(invite.value);
    } catch (_) {
      invite.select();
      document.execCommand("copy");
    }
    copy.textContent = "Copied";
    setTimeout(() => (copy.textContent = "Copy"), 1600);
  });
  share.addEventListener("click", () => {
    navigator.share({ title: CFG.brand, text: "Play anyone in the world at chess, for real money. Join the GM Bet beta:", url: invite.value }).catch(() => {});
  });
  form.addEventListener("change", () => {
    team.hidden = !teamBox.checked;
  });

  const say = (text, isError) => {
    status.textContent = text;
    status.classList.toggle("err", !!isError);
  };
  const clean = (v, max) => String(v || "").trim().slice(0, max) || null;
  const sourceTag = () => {
    const q = new URLSearchParams(location.search);
    const parts = [CFG.source].concat(["utm_source", "utm_medium", "utm_campaign"].filter((k) => q.get(k)).map((k) => k + "=" + q.get(k)));
    try {
      const r = document.referrer && new URL(document.referrer);
      if (r && r.host !== location.host) parts.push("referrer=" + r.host);
    } catch (_) {}
    return parts.join(" ").slice(0, 300);
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const email = String(data.get("email") || "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
      say("Enter a valid email address.", true);
      form.querySelector('input[name="email"]').focus();
      return;
    }
    if (data.get("company")) return;
    const roles = data.getAll("roles");
    button.disabled = true;
    say("Sending…");
    try {
      const res = await rpc("join_waitlist", {
        p_email: email,
        p_roles: roles,
        p_chess_username: clean(data.get("chess_username"), 50),
        p_team_note: roles.includes("team") ? clean(data.get("team_note"), 500) : null,
        p_source: sourceTag(),
        p_ref: store.get("gm_ref"),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const info = await res.json();
      show(info, info.already);
      done.focus();
    } catch (_) {
      say("That didn’t go through. Check your connection and try again.", true);
      button.disabled = false;
    }
  });
}

/* ---------- Boot ---------- */
const top = $("[data-top]");
let ticking = false;
addEventListener(
  "scroll",
  () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      top.classList.toggle("is-scrolled", scrollY > 8);
      ticking = false;
    });
  },
  { passive: true }
);

function staticMate(canvas) {
  const b = new Board(canvas);
  b.size();
  HERO_GAME.m.split(",").forEach((m) => b.play(m, 0));
  b.markMate("b");
  b.frame(performance.now());
  return b;
}

renderOpp();
renderStake(false);
if (MOTION) winRoll.set("$0.00", { instant: true });
paintTimes();
setInterval(paintTimes, 15000);
swipe.classList.add("is-idle");
setThumb(0);
setUpScroll();
setUpWaitlist();
setUpLookup();
setUpMathRolls();
setUpHours();
seedFeed();

Promise.all([loadPieces(), document.fonts ? document.fonts.ready : null]).then(() => {
  layoutWall();
  slipBoard.size();
  staticMate($("[data-share-board]"));
  setUpStory();
  placeGlow();
  const now = performance.now();
  slipBoard.frame(now);
  storyBoard.frame(now);
  // Off screen, the wall leaves the render tree entirely, so scrolling the rest of the page never pays for it.
  const wallBox = $(".wall");
  new IntersectionObserver(
    (e) => {
      heroVisible = e[0].isIntersecting;
      wallBox.style.contentVisibility = heroVisible ? "" : "hidden";
    },
    { rootMargin: "200px 0px" }
  ).observe(hero);
  run();
  intro();
  setUpChoreography();
  if (ST) ST.refresh();
});

let lastW = innerWidth;
let rz;
addEventListener("resize", () => {
  clearTimeout(rz);
  rz = setTimeout(() => {
    slipBoard.size();
    storyBoard.size();
    setThumb(S.state === "idle" ? 0 : thumbMax());
    if (innerWidth !== lastW || !geo || Math.abs(wallEl.clientHeight - geo.h) > 160) {
      lastW = innerWidth;
      layoutWall();
    }
    placeGlow();
  }, 150);
});
