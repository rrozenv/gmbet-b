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
    const jump = (vals) => {
      this.node.classList.add("no-anim");
      this.strips.forEach((s, i) => s.style.setProperty("--d", vals[i]));
      void this.node.offsetWidth;
      this.node.classList.remove("no-anim");
    };
    if (RM || instant) return jump(digits);
    if (from0 || rebuilt) jump(digits.map(() => 0));
    this.strips.forEach((s, i) => {
      s.style.setProperty("--dl", delay + i * 60 + "ms");
      s.style.setProperty("--d", digits[i]);
    });
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
  t.nextAt = now + rand(t.fmt.think[0], t.fmt.think[1]) * 1000 * (fresh ? 1.4 : rand(0.2, 1));
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
  t.doneUntil = now + 4200;
  const win = t.winner === "w" ? t.white : t.black;
  if (t.end === "mate") t.board.markMate(t.winner === "w" ? "b" : "w");
  t.n.stt.textContent = t.end === "mate" ? "Checkmate" : "Resigned";
  t.n.clk.textContent = "";
  t.n.pw.classList.remove("turn");
  t.n.pb.classList.remove("turn");
  t.n.stake.textContent = win.n + " won";
  t.n.win.textContent = "+" + dollars(t.stake * 2);
  t.el.classList.add("is-won");
  const y = t.y - t.col.offset;
  const visible = y > 0 && y < geo.h - geo.th && t.col.x + geo.tw > geo.feedMinX;
  if (visible && now - lastFeedAt > 2400) {
    lastFeedAt = now;
    pushFeed(`<b>${win.n}</b> won <em>${dollars(t.stake * 2)}</em> · ${t.fmt.name} · ${win.c}`);
  }
}

function stepTile(t, now) {
  if (t.state === "live") {
    if (now >= t.nextAt) {
      const side = t.ply % 2;
      t.clocks[side] -= (now - t.turnAt) / 1000;
      t.board.play(t.moves[t.ply], 260);
      t.ply++;
      t.turnAt = now;
      if (t.ply >= t.moves.length) return finish(t, now);
      t.nextAt = now + rand(t.fmt.think[0], t.fmt.think[1]) * 1000;
      turnUi(t);
      t.shown = -1;
    }
    paintClock(t, now);
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
    tw: desk ? 248 : tab ? 224 : 184,
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
  wallEl.textContent = "";
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
  chips.forEach((c) => (c.disabled = true));
  $("[data-next]").disabled = true;
  $("[data-slip-title]").textContent = `Matched with ${S.opp.n}`;
  $("[data-win-label]").textContent = "Pot locked in escrow";
  statusEl.innerHTML = "<b>Live</b> · your move";
  const pot = S.stake * 2;
  const clocks = [300, 300];
  const moves = HERO_GAME.m.split(",");
  clkW.classList.add("on");
  let ply = 0;
  const step = () => {
    const side = ply % 2;
    clocks[side] -= Math.round(rand(2, 9));
    (side ? clkB : clkW).textContent = clock(clocks[side]);
    slipBoard.play(moves[ply], RM ? 0 : 300);
    ply++;
    clkW.classList.toggle("on", ply % 2 === 0 && ply < moves.length);
    clkB.classList.toggle("on", ply % 2 === 1 && ply < moves.length);
    if (ply < moves.length) {
      statusEl.innerHTML = `<b>Live</b> · move ${Math.ceil((ply + 1) / 2)} · ${ply % 2 ? S.opp.n + " to move" : "your move"}`;
      later(step, ply % 2 ? 560 : 420);
    } else later(() => won(pot), 380);
  };
  if (RM) {
    moves.forEach((m) => slipBoard.play(m, 0));
    later(() => won(pot), 200);
  } else later(step, 700);
}

function won(pot) {
  S.state = "won";
  slip.dataset.state = "won";
  slipBoard.markMate("b");
  clkW.classList.remove("on");
  clkB.classList.remove("on");
  $("[data-slip-title]").textContent = "You won";
  $("[data-win-label]").textContent = "Paid in USDC";
  statusEl.innerHTML = "<b>Checkmate.</b> Smothered mate, Nd6#";
  winRoll.set("+" + money(pot), { from0: true });
  pushFeed(`<b>You</b> won <em>${money(pot)}</em> · vs ${S.opp.n} · ${S.opp.c}`, "is-you");
  later(resetSlip, 9000);
}

function resetSlip() {
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
  slip.classList.remove("is-swap");
  void slip.offsetWidth;
  slip.classList.add("is-swap");
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
let running = false;
let last = 0;
let heroVisible = true;
function frame(now) {
  if (!running) return;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (heroVisible && !RM) {
    moveWall(dt);
    for (const t of tiles) {
      stepTile(t, now);
      t.board.frame(now);
    }
  }
  slipBoard.frame(now);
  requestAnimationFrame(frame);
}
function run() {
  if (running) return;
  running = true;
  last = performance.now();
  requestAnimationFrame(frame);
}

/* ---------- Sections ---------- */
function staticMate(canvas) {
  const b = new Board(canvas);
  b.size();
  HERO_GAME.m.split(",").forEach((m) => b.play(m, 0));
  b.markMate("b");
  b.frame(performance.now());
  return b;
}

function typeLink(vis) {
  const out = vis.querySelector("[data-type]");
  const word = out.dataset.type;
  if (RM) {
    out.textContent = word;
    vis.classList.add("is-linked");
    return;
  }
  let i = 0;
  const tick = () => {
    out.textContent = word.slice(0, ++i);
    if (i < word.length) setTimeout(tick, 90 + Math.random() * 60);
    else setTimeout(() => vis.classList.add("is-linked"), 350);
  };
  setTimeout(tick, 500);
}

function setUpReveals() {
  const mathRolls = $$("[data-roll-math]").map((n) => new Roll(n));
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const n = e.target;
        n.classList.add("in");
        io.unobserve(n);
        const link = n.querySelector(".vis-link");
        if (link) typeLink(link);
        if (n.matches("[data-math-row]"))
          mathRolls.forEach((r, i) => r.set("$" + r.node.dataset.rollMath, { from0: true, delay: 150 + i * 180 }));
      }
    },
    { threshold: 0.25 }
  );
  $$(".reveal").forEach((n) => io.observe(n));
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

renderOpp();
renderStake(false);
paintTimes();
setInterval(paintTimes, 15000);
swipe.classList.add("is-idle");
setThumb(0);
setUpReveals();
setUpWaitlist();
seedFeed();

Promise.all([loadPieces(), document.fonts ? document.fonts.ready : null]).then(() => {
  layoutWall();
  slipBoard.size();
  staticMate($("[data-mate-board]"));
  staticMate($("[data-share-board]"));
  const now = performance.now();
  for (const t of tiles) t.board.frame(now);
  slipBoard.frame(now);
  new IntersectionObserver((e) => (heroVisible = e[0].isIntersecting)).observe(hero);
  run();
});

let lastW = innerWidth;
let rz;
addEventListener("resize", () => {
  clearTimeout(rz);
  rz = setTimeout(() => {
    slipBoard.size();
    setThumb(S.state === "idle" ? 0 : thumbMax());
    if (innerWidth !== lastW || !geo || Math.abs(wallEl.clientHeight - geo.h) > 160) {
      lastW = innerWidth;
      layoutWall();
    }
  }, 150);
});
