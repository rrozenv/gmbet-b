import { PIECES } from "./pieces.js";

const LIGHT = "#A2A8B0";
const DARK = "#6B727B";
const LAST = "rgba(236, 240, 245, 0.30)";
const MATE = "rgba(255, 91, 79, 0.78)";
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";

const svgs = {};
const sprites = new Map();
const bases = new Map();
let loading;

export function loadPieces() {
  if (loading) return loading;
  loading = Promise.all(
    Object.entries(PIECES).map(
      ([key, body]) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            svgs[key] = img;
            resolve();
          };
          img.onerror = resolve;
          img.src =
            "data:image/svg+xml;charset=utf-8," +
            encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" width="180" height="180">${body}</svg>`);
        })
    )
  );
  return loading;
}

function sprite(key, px) {
  const id = key + px;
  let c = sprites.get(id);
  if (!c && svgs[key]) {
    c = document.createElement("canvas");
    c.width = c.height = px;
    c.getContext("2d").drawImage(svgs[key], 0, 0, px, px);
    sprites.set(id, c);
  }
  return c;
}

function base(px, coords) {
  const id = px + (coords ? "c" : "");
  let c = bases.get(id);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = c.height = px * 8;
  const g = c.getContext("2d");
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      g.fillStyle = (x + y) % 2 ? DARK : LIGHT;
      g.fillRect(x * px, y * px, px, px);
    }
  if (coords) {
    g.font = `600 ${Math.round(px * 0.22)}px Geist, system-ui, sans-serif`;
    g.textBaseline = "top";
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? LIGHT : DARK;
      g.fillText(String(8 - i), px * 0.07, i * px + px * 0.06);
      g.fillStyle = i % 2 ? DARK : LIGHT;
      g.textBaseline = "bottom";
      g.fillText("abcdefgh"[i], i * px + px * 0.78, px * 8 - px * 0.04);
      g.textBaseline = "top";
    }
  }
  bases.set(id, c);
  return c;
}

const sq = (s) => (8 - Number(s[1])) * 8 + (s.charCodeAt(0) - 97);

function parse(fen) {
  const pos = new Array(64).fill(null);
  fen.split("/").forEach((row, y) => {
    let x = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) x += Number(ch);
      else pos[y * 8 + x++] = ch.toLowerCase() + (ch === ch.toUpperCase() ? "l" : "d");
    }
  });
  return pos;
}

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

export class Board {
  constructor(canvas, { coords = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.coords = coords;
    this.reset();
  }

  size() {
    const css = this.canvas.clientWidth;
    if (!css) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.max(4, Math.round((css * dpr) / 8));
    if (px !== this.px) {
      this.px = px;
      this.canvas.width = this.canvas.height = px * 8;
    }
    this.dirty = true;
  }

  reset() {
    this.pos = parse(START);
    this.last = null;
    this.mate = null;
    this.anim = null;
    this.dirty = true;
  }

  // move: "e2 e4" plus an optional flag: k / q (castling), e (en passant), =q (promotion)
  play(move, dur = 220) {
    const [from, to, flag] = move.split(" ");
    const a = sq(from);
    const b = sq(to);
    const piece = this.pos[a];
    const captured = this.pos[b];
    this.pos[b] = flag && flag[0] === "=" ? flag[1] + piece[1] : piece;
    this.pos[a] = null;
    if (flag === "k" || flag === "q") {
      const row = a - (a % 8);
      const [rf, rt] = flag === "k" ? [row + 7, row + 5] : [row, row + 3];
      this.pos[rt] = this.pos[rf];
      this.pos[rf] = null;
    }
    if (flag === "e") this.pos[b + (piece[1] === "l" ? 8 : -8)] = null;
    this.last = [a, b];
    this.mate = null;
    this.anim = dur > 0 ? { a, b, captured, t0: performance.now(), dur } : null;
    this.dirty = true;
  }

  markMate(color) {
    this.mate = this.pos.indexOf("k" + (color === "w" ? "l" : "d"));
    this.dirty = true;
  }

  frame(now) {
    if (!this.px || (!this.dirty && !this.anim)) return;
    const { ctx, px } = this;
    const b = base(px, this.coords);
    ctx.drawImage(b, 0, 0);
    if (this.last) {
      ctx.fillStyle = LAST;
      for (const i of this.last) ctx.fillRect((i % 8) * px, Math.floor(i / 8) * px, px, px);
    }
    if (this.mate != null && this.mate >= 0) {
      ctx.fillStyle = MATE;
      ctx.fillRect((this.mate % 8) * px, Math.floor(this.mate / 8) * px, px, px);
    }
    const anim = this.anim;
    let t = 1;
    if (anim) t = Math.min(1, (now - anim.t0) / anim.dur);
    for (let i = 0; i < 64; i++) {
      const key = this.pos[i];
      if (!key || (anim && i === anim.b)) continue;
      const s = sprite(key, px);
      if (s) ctx.drawImage(s, (i % 8) * px, Math.floor(i / 8) * px);
    }
    if (anim) {
      if (anim.captured && t < 0.85) {
        const s = sprite(anim.captured, px);
        if (s) ctx.drawImage(s, (anim.b % 8) * px, Math.floor(anim.b / 8) * px);
      }
      const e = easeOut(t);
      const x = (anim.a % 8) + ((anim.b % 8) - (anim.a % 8)) * e;
      const y = Math.floor(anim.a / 8) + (Math.floor(anim.b / 8) - Math.floor(anim.a / 8)) * e;
      const s = sprite(this.pos[anim.b], px);
      if (s) ctx.drawImage(s, Math.round(x * px), Math.round(y * px));
      if (t >= 1) this.anim = null;
    }
    this.dirty = false;
  }
}
