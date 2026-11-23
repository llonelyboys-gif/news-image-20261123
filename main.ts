// The World in One Picture — Monday 23 November 2026.
// A deterministic Node 22 stdlib-only program that draws a newspaper
// infographic (1024x1024) summing up the day's world news.
// Written fresh in this session. No network, no dependencies.
//
// Usage (grader-style): mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodePng } from './src/png.ts';
import { charAdvance, glyphFor, textWidth } from './src/font.ts';

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------- palette
type RGB = [number, number, number];
const PAPER: RGB = [247, 243, 232];
const INK: RGB = [18, 18, 18];
const RED: RGB = [164, 30, 34];
const BLUE: RGB = [29, 78, 137];
const GREEN: RGB = [38, 92, 56];
const GOLD: RGB = [178, 134, 34];
const GREY: RGB = [92, 88, 80];
const LIGHT: RGB = [233, 227, 211];
const SKY: RGB = [205, 226, 238];
const SEA: RGB = [168, 198, 220];
const SAND: RGB = [226, 208, 170];
const PINK: RGB = [232, 190, 180];
const WHITE: RGB = [255, 255, 255];
const DARKRED: RGB = [122, 20, 24];

// ---------------------------------------------------------------- canvas
class Canvas {
  data = new Uint8Array(W * H * 4);

  constructor() {
    // Newsprint paper with deterministic grain (seeded, so both runs match).
    let s = 20261123;
    const rnd = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    for (let i = 0; i < W * H; i++) {
      const g = Math.round((rnd() - 0.5) * 7);
      this.data[i * 4] = PAPER[0] + g;
      this.data[i * 4 + 1] = PAPER[1] + g;
      this.data[i * 4 + 2] = PAPER[2] + g;
      this.data[i * 4 + 3] = 255;
    }
  }

  set(x: number, y: number, c: RGB): void {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
    const i = (yi * W + xi) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = 255;
  }

  fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(W, Math.round(x + w));
    const y1 = Math.min(H, Math.round(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const i = (yy * W + xx) * 4;
        this.data[i] = c[0];
        this.data[i + 1] = c[1];
        this.data[i + 2] = c[2];
      }
    }
  }

  disc(cx: number, cy: number, r: number, c: RGB): void {
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(W - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(H - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r * r) this.set(x, y, c);
      }
    }
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB, fill = true): void {
    if (fill) {
      const x0 = Math.max(0, Math.floor(cx - rx));
      const x1 = Math.min(W - 1, Math.ceil(cx + rx));
      const y0 = Math.max(0, Math.floor(cy - ry));
      const y1 = Math.min(H - 1, Math.ceil(cy + ry));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = (x + 0.5 - cx) / rx;
          const dy = (y + 0.5 - cy) / ry;
          if (dx * dx + dy * dy <= 1) this.set(x, y, c);
        }
      }
      return;
    }
    const steps = Math.max(24, Math.round(2 * Math.PI * Math.max(rx, ry)));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * 2 * Math.PI;
      this.set(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, c);
    }
  }

  circle(cx: number, cy: number, r: number, c: RGB, fill = true): void {
    if (fill) {
      this.disc(cx, cy, r, c);
      return;
    }
    const steps = Math.max(24, Math.round(2 * Math.PI * r));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * 2 * Math.PI;
      this.set(cx + Math.cos(a) * r, cy + Math.sin(a) * r, c);
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(len * 1.5));
    const r = Math.max(0.5, w / 2);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.disc(x0 + dx * t, y0 + dy * t, r, c);
    }
  }

  poly(points: [number, number][], c: RGB): void {
    // Even-odd scanline fill.
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of points) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
      const xs: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const [x0, y0] = points[i];
        const [x1, y1] = points[(i + 1) % points.length];
        if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
          xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.ceil(xs[k]); x <= Math.floor(xs[k + 1]); x++) this.set(x, y, c);
      }
    }
  }

  polyline(points: [number, number][], w: number, c: RGB): void {
    for (let i = 0; i + 1 < points.length; i++) {
      this.line(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], w, c);
    }
  }

  rule(x: number, y: number, w: number, h: number, c: RGB = INK): void {
    this.fillRect(x, y, w, h, c);
  }

  // -- stroke-font text. (x, y) = top-left of the cap-height box.
  text(x: number, y: number, s: string, size: number, c: RGB, opts: { bold?: boolean; serif?: boolean; align?: 'left' | 'center' | 'right'; track?: number; weight?: number } = {}): number {
    const unit = size / 10;
    const lw = (opts.weight ?? (opts.bold ? 0.2 : 0.15)) * size;
    const track = (opts.track ?? 0) * unit;
    let total = 0;
    for (const ch of s) total += charAdvance(ch) * unit + track;
    let cx = x;
    if (opts.align === 'center') cx = x - total / 2;
    if (opts.align === 'right') cx = x - total;
    for (const ch of s) {
      const g = glyphFor(ch);
      if (g) {
        for (const stroke of g) {
          for (let i = 0; i + 1 < stroke.length; i++) {
            const [ax, ay] = stroke[i];
            const [bx, by] = stroke[i + 1];
            this.line(cx + ax * unit, y + ay * unit, cx + bx * unit, y + by * unit, lw, c);
            if (opts.serif) {
              // Serif ticks on near-vertical stroke ends.
              const dx = bx - ax;
              const dy = by - ay;
              if (Math.abs(dy) > Math.abs(dx) * 2) {
                const tick = 0.1 * size;
                for (const [px, py] of [[ax, ay], [bx, by]]) {
                  this.line(cx + px * unit - tick, y + py * unit, cx + px * unit + tick, y + py * unit, lw * 0.8, c);
                }
              }
            }
          }
          // Single-point glyphs (dots).
          if (stroke.length === 1) {
            this.disc(cx + stroke[0][0] * unit, y + stroke[0][1] * unit, Math.max(0.6, lw * 0.55), c);
          }
        }
      }
      cx += charAdvance(ch) * unit + track;
    }
    return total;
  }

  wrap(s: string, size: number, maxW: number, opts: { bold?: boolean } = {}): string[] {
    const unit = size / 10;
    const words = s.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const word of words) {
      const trial = cur ? cur + ' ' + word : word;
      if (textWidth(trial, size) <= maxW || !cur) {
        cur = trial;
      } else {
        lines.push(cur);
        cur = word;
      }
    }
    if (cur) lines.push(cur);
    void unit;
    void opts;
    return lines;
  }
}

const cv = new Canvas();

// ------------------------------------------------------------------ artwork
// Every story gets a scene drawn for it, in a 100x70 coordinate space that
// is scaled into the story's illustration box.
function art(key: string, x: number, y: number, w: number, h: number, wide = false): void {
  // Featured boxes are wide (320x70 space); medium boxes use a 100x70 space.
  const SW = wide ? 320 : 100;
  const X = (px: number) => x + (px / SW) * w;
  const Y = (py: number) => y + (py / 70) * h;
  const S = (v: number) => (v / SW) * w;
  const L = (x0: number, y0: number, x1: number, y1: number, wd: number, c: RGB) =>
    cv.line(X(x0), Y(y0), X(x1), Y(y1), Math.max(1, wd * S(1)), c);
  const R = (x0: number, y0: number, rw: number, rh: number, c: RGB) =>
    cv.fillRect(X(x0), Y(y0), S(rw), (rh / 70) * h, c);
  const C = (cx: number, cy: number, r: number, c: RGB, fill = true) =>
    cv.ellipse(X(cx), Y(cy), S(r), (r / 70) * h, c, fill);
  const P = (pts: [number, number][], c: RGB) =>
    cv.poly(pts.map(([px, py]) => [X(px), Y(py)] as [number, number]), c);
  const T = (tx: number, ty: number, s: string, size: number, c: RGB, o: Record<string, unknown> = {}) =>
    cv.text(X(tx), Y(ty), s, (size / 70) * h, c, o as never);

  switch (key) {
    case 'cop31': {
      // Climate summit table: three flags, a gavel, cracked earth below.
      R(0, 0, 320, 70, SKY);
      R(0, 58, 320, 12, SAND);
      L(20, 58, 60, 64, 2, INK); L(60, 64, 110, 57, 2, INK); L(110, 57, 160, 63, 2, INK);
      L(160, 63, 210, 58, 2, INK); L(210, 58, 260, 63, 2, INK); L(260, 63, 300, 57, 2, INK);
      R(56, 40, 208, 6, [120, 84, 52]); // table
      R(64, 46, 8, 12, [90, 60, 36]); R(248, 46, 8, 12, [90, 60, 36]);
      // three flags on the table
      L(96, 40, 96, 20, 2, INK); R(96, 20, 26, 12, BLUE);
      L(150, 40, 150, 20, 2, INK); R(150, 20, 26, 12, RED);
      L(204, 40, 204, 20, 2, INK); R(204, 20, 26, 12, GREEN);
      // gavel
      L(272, 10, 296, 22, 4, INK); R(268, 8, 10, 5, INK);
      T(8, 4, 'COP31', 14, INK, { bold: true });
      break;
    }
    case 'house': {
      // US Capitol dome with a big 258.
      R(0, 0, 320, 70, SKY);
      P([[104, 66], [216, 66], [216, 50], [104, 50]], WHITE);
      P([[124, 50], [196, 50], [182, 28], [138, 28]], WHITE);
      C(160, 28, 10, WHITE);
      L(160, 18, 160, 10, 2, INK);
      C(160, 8, 2.5, GOLD);
      for (let i = 0; i < 6; i++) {
        R(112 + i * 16, 54, 6, 12, INK);
        R(112 + i * 16, 34, 6, 10, INK);
      }
      R(0, 66, 320, 4, GREEN);
      T(10, 4, '258', 16, RED, { bold: true });
      break;
    }
    case 'iran': {
      // Oil tanker on fire, a mine in the water, Hormuz strait.
      R(0, 0, 320, 70, SKY);
      R(0, 48, 320, 22, SEA);
      P([[24, 48], [296, 48], [272, 34], [48, 34]], DARKRED); // hull
      R(64, 20, 28, 14, INK); R(136, 16, 28, 18, INK); R(212, 22, 24, 12, INK);
      L(92, 20, 92, 10, 2, INK);
      P([[84, 10], [100, 10], [92, 2]], RED); // flame on funnel
      P([[180, 14], [196, 4], [204, 16], [194, 20], [182, 18]], GOLD); // flame
      C(284, 56, 5, INK); // mine
      L(284, 50, 284, 46, 2, INK); L(278, 56, 290, 56, 2, INK);
      L(28, 54, 56, 54, 2, WHITE); L(120, 62, 152, 62, 2, WHITE);
      break;
    }
    case 'kyiv': {
      // Apartment block hit, smoke rising, broken windows.
      R(0, 0, 320, 70, [226, 214, 196]);
      P([[100, 70], [220, 70], [220, 12], [100, 12]], [190, 180, 160]);
      for (let r = 0; r < 3; r++)
        for (let cI = 0; cI < 4; cI++) R(108 + cI * 28, 18 + r * 16, 16, 9, r === 1 && cI === 1 ? INK : [90, 80, 66]);
      P([[170, 12], [190, 2], [206, 10], [198, 22], [180, 24]], [120, 112, 100]); // smoke
      C(196, 6, 6, [120, 112, 100]); C(210, 12, 5, [120, 112, 100]);
      P([[80, 70], [100, 70], [94, 52], [78, 52]], INK); // rubble
      P([[200, 70], [240, 70], [232, 56], [208, 60]], [120, 112, 100]);
      T(8, 4, 'KYIV', 14, RED, { bold: true });
      break;
    }
    case 'liverpool': {
      // Football pitch, goal, ball, scoreboard 4-0.
      R(0, 0, 320, 70, [52, 128, 74]);
      for (let i = 0; i < 8; i++) R(i * 40, 0, 20, 70, [46, 118, 68]);
      L(0, 50, 320, 50, 2, WHITE);
      C(160, 50, 13, WHITE, false);
      R(240, 8, 60, 20, WHITE); // goal
      L(240, 8, 240, 28, 2, INK); L(300, 8, 300, 28, 2, INK); L(240, 8, 300, 8, 2, INK);
      C(70, 60, 6, WHITE); C(70, 60, 6, INK, false);
      R(6, 4, 150, 16, INK);
      T(10, 6, 'LIV 4-0 MUN', 13, WHITE, { bold: true });
      break;
    }
    case 'indonesia': {
      // Candy factory on fire, smoke, fire crews' ladder.
      R(0, 0, 320, 70, [240, 214, 180]);
      P([[40, 70], [280, 70], [280, 28], [40, 28]], [170, 120, 90]);
      P([[40, 28], [160, 12], [280, 28]], [140, 90, 60]); // roof
      R(200, 6, 16, 12, [120, 80, 55]); // chimney
      P([[196, 6], [208, 0], [214, 4], [206, 8], [198, 6]], [120, 112, 100]);
      P([[76, 28], [92, 12], [104, 24], [96, 28], [84, 28]], GOLD); // flames
      P([[124, 28], [144, 8], [160, 22], [148, 28], [132, 28]], RED);
      R(60, 48, 24, 12, INK); R(120, 48, 24, 12, INK); R(200, 48, 24, 12, INK);
      L(250, 70, 290, 36, 3, RED);
      break;
    }
    case 'flags': {
      R(0, 0, 100, 70, SKY);
      L(28, 62, 28, 18, 2, INK); R(28, 18, 16, 11, BLUE);
      L(58, 62, 58, 18, 2, INK); R(58, 18, 16, 11, RED);
      P([[30, 40], [56, 40], [70, 52], [16, 52]], [210, 190, 160]);
      T(30, 48, 'TALK', 11, INK, { bold: true });
      break;
    }
    case 'flame': {
      R(0, 0, 100, 70, [240, 220, 200]);
      P([[50, 8], [66, 30], [58, 52], [42, 52], [34, 30]], RED);
      P([[50, 24], [60, 40], [54, 50], [46, 50], [40, 40]], GOLD);
      R(20, 56, 60, 6, [120, 90, 70]);
      break;
    }
    case 'ship': {
      R(0, 0, 100, 70, SKY);
      R(0, 46, 100, 24, SEA);
      P([[12, 46], [88, 46], [80, 34], [20, 34]], INK);
      R(34, 20, 12, 14, RED); R(56, 24, 10, 10, WHITE);
      L(8, 52, 20, 52, 1.5, WHITE); L(60, 58, 76, 58, 1.5, WHITE);
      break;
    }
    case 'missile': {
      R(0, 0, 100, 70, [226, 214, 196]);
      P([[20, 20], [80, 20], [88, 30], [80, 40], [20, 40]], [120, 118, 112]);
      P([[80, 20], [96, 30], [80, 40]], RED);
      P([[20, 20], [10, 12], [10, 48], [20, 40]], GOLD);
      L(10, 30, 2, 30, 1.5, INK);
      C(60, 60, 6, INK); C(76, 62, 4, INK);
      break;
    }
    case 'board': {
      R(0, 0, 100, 70, [60, 70, 66]);
      R(4, 4, 92, 56, [34, 52, 46]);
      T(10, 10, 'zeta(s)', 14, WHITE, { bold: true });
      T(10, 30, '= 0 ?', 14, WHITE, { bold: true });
      L(8, 44, 88, 44, 1.5, WHITE);
      R(0, 62, 100, 4, [140, 110, 70]);
      break;
    }
    case 'robot': {
      R(0, 0, 100, 70, [210, 220, 228]);
      R(30, 14, 40, 30, [120, 130, 140]);
      R(38, 22, 8, 6, [40, 200, 120]); R(54, 22, 8, 6, [40, 200, 120]);
      L(42, 34, 58, 34, 2, INK);
      L(50, 14, 50, 6, 2, INK); C(50, 5, 3, RED);
      R(20, 48, 60, 18, [90, 100, 110]);
      R(28, 52, 10, 4, [40, 200, 120]); R(46, 52, 10, 4, [40, 200, 120]); R(64, 52, 10, 4, RED);
      break;
    }
    case 'tent': {
      R(0, 0, 100, 70, [200, 210, 222]);
      P([[16, 62], [84, 62], [50, 20]], [190, 180, 150]);
      P([[16, 62], [50, 62], [50, 20]], [160, 148, 118]);
      R(46, 48, 8, 14, INK);
      for (let i = 0; i < 6; i++) L(10 + i * 14, 8, 6 + i * 14, 16, 1.5, BLUE);
      R(0, 62, 100, 8, SEA);
      break;
    }
    case 'doc': {
      R(0, 0, 100, 70, [232, 226, 210]);
      P([[24, 6], [76, 6], [76, 64], [24, 64]], WHITE);
      R(24, 6, 52, 2, INK);
      for (let i = 0; i < 5; i++) L(30, 16 + i * 9, 70, 16 + i * 9, 1.5, GREY);
      C(66, 52, 8, RED, false); L(60, 46, 72, 58, 2, RED);
      break;
    }
    case 'plane': {
      R(0, 0, 100, 70, SKY);
      P([[10, 36], [70, 30], [90, 34], [70, 42], [20, 44]], WHITE);
      P([[40, 30], [52, 14], [58, 30]], WHITE);
      P([[30, 44], [38, 54], [44, 44]], WHITE);
      C(84, 34, 2, INK);
      T(8, 56, '1,000+', 13, RED, { bold: true });
      break;
    }
    case 'chartdown': {
      R(0, 0, 100, 70, WHITE);
      L(10, 12, 10, 62, 1.5, INK); L(10, 62, 92, 62, 1.5, INK);
      P([[14, 16], [34, 26], [48, 22], [66, 44], [88, 58]], RED);
      cv.polyline(
        [[X(14), Y(16)], [X(34), Y(26)], [X(48), Y(22)], [X(66), Y(44)], [X(88), Y(58)]],
        Math.max(1.5, S(2.5)), RED,
      );
      P([[82, 52], [92, 58], [84, 62]], RED);
      break;
    }
    case 'chartup': {
      R(0, 0, 100, 70, WHITE);
      L(10, 12, 10, 62, 1.5, INK); L(10, 62, 92, 62, 1.5, INK);
      cv.polyline(
        [[X(14), Y(56)], [X(34), Y(44)], [X(48), Y(48)], [X(66), Y(26)], [X(88), Y(12)]],
        Math.max(1.5, S(2.5)), GREEN,
      );
      P([[82, 8], [92, 12], [84, 18]], GREEN);
      break;
    }
    case 'coin': {
      R(0, 0, 100, 70, [232, 226, 210]);
      C(50, 35, 26, GOLD);
      C(50, 35, 20, [214, 168, 60], false);
      T(40, 22, 'B', 26, [120, 88, 10], { bold: true });
      break;
    }
    case 'cross': {
      R(0, 0, 100, 70, WHITE);
      C(50, 35, 26, [220, 235, 225], false);
      R(46, 18, 8, 34, RED); R(33, 30, 34, 8, RED);
      break;
    }
    case 'boat': {
      R(0, 0, 100, 70, SKY);
      R(0, 46, 100, 24, SEA);
      P([[22, 40], [78, 40], [66, 54], [34, 54]], [140, 90, 60]);
      L(50, 40, 50, 16, 2, INK);
      P([[50, 16], [70, 38], [50, 38]], WHITE);
      L(8, 56, 20, 56, 1.5, WHITE); L(70, 62, 88, 62, 1.5, WHITE);
      break;
    }
    case 'stage': {
      R(0, 0, 100, 70, [40, 38, 52]);
      for (let i = 0; i < 4; i++) {
        P([[12 + i * 20, 20], [20 + i * 20, 8], [28 + i * 20, 20]], GOLD);
      }
      R(10, 52, 80, 6, [120, 100, 80]);
      R(44, 30, 12, 22, INK);
      C(50, 24, 6, [220, 190, 160]);
      break;
    }
    case 'mic': {
      R(0, 0, 100, 70, [232, 226, 210]);
      C(50, 26, 14, INK);
      L(50, 40, 50, 56, 3, INK);
      L(38, 56, 62, 56, 3, INK);
      for (let i = 0; i < 3; i++) L(38, 20 + i * 6, 62, 20 + i * 6, 1.5, GREY);
      break;
    }
    case 'drop': {
      R(0, 0, 100, 70, SKY);
      P([[50, 8], [70, 38], [62, 52], [38, 52], [30, 38]], SEA);
      C(50, 44, 6, WHITE);
      R(10, 58, 80, 4, BLUE);
      break;
    }
    case 'leaf': {
      R(0, 0, 100, 70, [225, 235, 220]);
      P([[20, 52], [50, 12], [80, 52], [50, 62]], GREEN);
      L(50, 12, 50, 62, 2, [20, 60, 30]);
      C(74, 52, 8, GOLD);
      break;
    }
    case 'gauge': {
      R(0, 0, 100, 70, WHITE);
      C(50, 52, 30, [220, 220, 210], false);
      P([[20, 52], [80, 52], [80, 46], [20, 46]], WHITE);
      L(50, 52, 66, 30, 2.5, RED);
      C(50, 52, 4, INK);
      T(42, 58, '51.5', 12, INK, { bold: true });
      break;
    }
    case 'crowd': {
      R(0, 0, 100, 70, [232, 226, 210]);
      for (let i = 0; i < 5; i++) {
        C(18 + i * 16, 30, 7, [190, 170, 140]);
        P([[10 + i * 16, 62], [26 + i * 16, 62], [24 + i * 16, 38], [12 + i * 16, 38]], i % 2 ? BLUE : RED);
      }
      R(30, 10, 40, 8, INK);
      break;
    }
    case 'chip': {
      R(0, 0, 100, 70, [220, 228, 232]);
      R(28, 18, 44, 34, INK);
      R(36, 26, 28, 18, [60, 200, 140]);
      for (let i = 0; i < 4; i++) {
        L(34 + i * 10, 18, 34 + i * 10, 10, 1.5, INK);
        L(34 + i * 10, 52, 34 + i * 10, 60, 1.5, INK);
      }
      break;
    }
    case 'wave': {
      R(0, 0, 100, 70, SKY);
      R(0, 44, 100, 26, SEA);
      for (let i = 0; i < 3; i++) {
        L(8 + i * 6, 50 + i * 6, 92 - i * 6, 50 + i * 6, 2, WHITE);
      }
      C(72, 18, 10, GOLD);
      break;
    }
    case 'sub': {
      R(0, 0, 100, 70, [30, 60, 90]);
      P([[16, 40], [76, 40], [84, 34], [76, 28], [16, 28]], GOLD);
      R(40, 20, 14, 8, GOLD);
      C(66, 34, 3, INK);
      L(84, 34, 92, 30, 2, GOLD); L(84, 34, 92, 38, 2, GOLD);
      for (let i = 0; i < 4; i++) C(20 + i * 8, 56, 2, WHITE);
      break;
    }
    case 'tortoise': {
      R(0, 0, 100, 70, [225, 235, 210]);
      C(50, 44, 22, [110, 140, 80]);
      C(50, 44, 16, [140, 170, 100], false);
      C(74, 44, 7, [110, 140, 80]);
      C(76, 42, 1.5, INK);
      L(30, 60, 30, 66, 2, [110, 140, 80]); L(66, 60, 66, 66, 2, [110, 140, 80]);
      break;
    }
    case 'stars': {
      R(0, 0, 100, 70, [16, 22, 48]);
      for (const [sx, sy, sr] of [[20, 16, 2], [38, 28, 1.5], [56, 12, 2], [74, 24, 1.5], [86, 44, 2], [30, 48, 1.5], [48, 56, 2], [66, 52, 1.5]] as const) {
        C(sx, sy, sr, WHITE);
      }
      C(50, 34, 12, [220, 220, 240], false);
      P([[44, 28], [56, 28], [58, 40], [42, 40]], [120, 130, 170]);
      break;
    }
    case 'scales': {
      R(0, 0, 100, 70, [232, 226, 210]);
      L(50, 10, 50, 56, 2.5, INK);
      L(22, 18, 78, 18, 2.5, INK);
      L(22, 18, 22, 34, 1.5, INK); L(78, 18, 78, 34, 1.5, INK);
      P([[12, 34], [32, 34], [22, 46]], GOLD);
      P([[68, 34], [88, 34], [78, 46]], GOLD);
      R(40, 56, 20, 4, INK);
      break;
    }
    case 'podium': {
      R(0, 0, 100, 70, [232, 226, 210]);
      P([[34, 62], [66, 62], [66, 36], [34, 36]], [120, 90, 60]);
      C(50, 26, 8, [220, 190, 160]);
      P([[38, 34], [62, 34], [56, 62], [44, 62]], INK);
      L(50, 18, 50, 10, 1.5, INK); C(50, 8, 3, RED);
      break;
    }
    case 'building': {
      R(0, 0, 100, 70, [232, 226, 210]);
      P([[24, 62], [76, 62], [76, 16], [24, 16]], [170, 160, 140]);
      for (let r = 0; r < 3; r++) for (let cI = 0; cI < 3; cI++) R(30 + cI * 15, 22 + r * 14, 8, 8, [90, 84, 72]);
      R(44, 48, 12, 14, INK);
      break;
    }
    case 'dome': {
      R(0, 0, 100, 70, SKY);
      C(50, 62, 24, WHITE);
      P([[26, 62], [74, 62], [74, 50], [26, 50]], WHITE);
      P([[36, 50], [64, 50], [56, 32], [44, 32]], WHITE);
      C(50, 32, 7, WHITE);
      break;
    }
    default: {
      R(0, 0, 100, 70, LIGHT);
      C(50, 35, 16, GREY, false);
      T(44, 28, '?', 16, GREY, { bold: true });
    }
  }
}

// -------------------------------------------------------------------- data
// All stories were first reported on Monday 23 November 2026 (any time
// zone), with the source and verification label shown on the picture.
type Story = {
  n: number;
  kicker: string;
  head: string;
  body: string;
  label: string;
  src: string;
  art: string;
  pin?: [number, number]; // map position, 0-100 x 0-70 in the map box
};

const FEATURED: Story[] = [
  {
    n: 1, kicker: 'CLIMATE · ANTALYA', art: 'cop31', pin: [52, 22],
    head: 'COP31 collapses: no climate deal after 48 hours of overtime',
    body: 'Nearly 200 nations leave Antalya with no deal. The EU refused a text without fossil-fuel language.',
    label: 'CONFIRMED', src: 'Xinhua / AP',
  },
  {
    n: 2, kicker: 'USA · WASHINGTON', art: 'house', pin: [18, 24],
    head: 'Democrats clinch House majority of at least 258 seats',
    body: 'The AP calls the House for the Democrats: at least 258 seats, the largest majority since 1992.',
    label: 'CONFIRMED', src: 'Associated Press',
  },
  {
    n: 3, kicker: 'MIDDLE EAST · HORMUZ', art: 'iran', pin: [61, 30],
    head: 'Trump "inclined" to resume war on Iran if no deal by New Year',
    body: 'He accuses Tehran of endless talks. Iran hits a Bahrain site; two tankers strike mines near Hormuz.',
    label: 'REPORTED', src: 'Economic Times / AP',
  },
  {
    n: 4, kicker: 'WAR · KYIV', art: 'kyiv', pin: [54, 15],
    head: 'Russian strikes kill 11 in the Kyiv region, a teenager among them',
    body: 'Strikes hit homes in the Kyiv region; a supermarket attack in Vyshneve kills two more.',
    label: 'CONFIRMED', src: 'Associated Press',
  },
  {
    n: 5, kicker: 'SPORT · ANFIELD', art: 'liverpool', pin: [45, 12],
    head: 'Liverpool 4-0 Man Utd: Pochettino debut ends in a rout',
    body: 'Yoro is sent off after eight minutes; Szoboszlai, Wirtz, Ngumoha and Munoz score. United sit 19th.',
    label: 'CONFIRMED', src: 'Reuters',
  },
  {
    n: 6, kicker: 'ASIA · BANTEN', art: 'indonesia', pin: [80, 36],
    head: 'Candy factory fire in Indonesia: 24 dead, about 30 missing',
    body: 'At least 24 body bags are recovered after a fire at a candy factory in Banten. The blaze is not yet out.',
    label: 'CONFIRMED', src: 'Xinhua',
  },
];

const MEDIUM: Story[] = [
  { n: 7, kicker: 'USA · DIPLOMACY', art: 'flags', head: 'Trump calls Putin a "friend" after Shenzhen talks', body: 'He says a Ukraine deal has a good chance, but hatred between Putin and Zelenskyy makes talks hard.', label: 'CONFIRMED', src: 'AP' },
  { n: 8, kicker: 'MIDDLE EAST', art: 'flame', head: 'Iran hits Bahrain industrial site; two wounded', body: 'Bahrain says a strike on a civilian site wounded two, one critically. The White House says a decision on renewed strikes is at least a week away.', label: 'REPORTED', src: 'Middle East Eye' },
  { n: 9, kicker: 'MIDDLE EAST', art: 'ship', head: 'Two supertankers catch fire after hitting mines', body: 'Iran\'s navy says the tankers struck mines in a restricted zone east of the Strait of Hormuz. The claim is not independently verified.', label: 'CLAIM', src: 'Iran navy / MEE' },
  { n: 10, kicker: 'EUROPE · POLAND', art: 'missile', head: 'Poland: three fallen objects were Russian missiles', body: 'Warsaw confirms the objects that fell on 20 November were Russian cruise missiles. NATO is preparing to meet on the incident.', label: 'CONFIRMED', src: 'CNA' },
  { n: 11, kicker: 'AFRICA · LIBYA', art: 'ship', head: 'Russian warship damaged in drone attack at Benghazi', body: 'A naval drone attack heavily damages a Russian vessel in Benghazi port; ten people are injured. The UN urges an investigation.', label: 'REPORTED', src: 'Ynet / AFP' },
  { n: 12, kicker: 'SCIENCE', art: 'board', head: 'Anthropic mathematician claims proof of Riemann', body: 'Levent Alpoge publishes what he says is a proof of the Riemann hypothesis. It is not yet peer reviewed.', label: 'REPORTED', src: 'One Turn' },
  { n: 13, kicker: 'TECH · AI', art: 'robot', head: 'AI agents found a zero-day and took over a server', body: 'Amazon Threat Intelligence says autonomous agents exploited an unpatched flaw in medical imaging software at East Asian universities.', label: 'REPORTED', src: 'AWS Security Blog' },
  { n: 14, kicker: 'MIDDLE EAST · GAZA', art: 'tent', head: 'Winter storms wreck Gaza shelters for 1m displaced', body: 'Torrential rain and cold flood thousands of temporary shelters. An Israeli strike on a food-delivery vehicle kills three, Gaza health officials say.', label: 'REPORTED', src: 'Nexus Europa / AFP' },
  { n: 15, kicker: 'CAUCASUS', art: 'doc', head: 'Armenia publishes draft of a new constitution', body: 'Yerevan publishes a draft constitution, a key step towards a formal peace agreement with Azerbaijan.', label: 'REPORTED', src: 'Reuters' },
  { n: 16, kicker: 'USA · TRAVEL', art: 'plane', head: 'Delta delays top 1,000 flights at Atlanta hub', body: 'A technical failure in Delta\'s flight operations system delays more than 1,000 flights on Sunday as Americans travel for Thanksgiving.', label: 'CONFIRMED', src: 'Xinhua' },
  { n: 17, kicker: 'MARKETS', art: 'chartdown', head: 'Nvidia sinks 14% as SEC examines its accounting', body: 'The drop erases about $491bn of market value in a day. Nvidia is now down seven weeks in a row, its longest losing streak since 2008.', label: 'CONFIRMED', src: 'Reuters / Zacks' },
  { n: 18, kicker: 'MARKETS', art: 'coin', head: 'Bitcoin rebounds above $61,000 after $55,000 low', body: 'Bitcoin climbs back above $61,000 after briefly falling to about $55,000 on Saturday, its lowest since September 2024.', label: 'REPORTED', src: 'Bloomberg / NordFX' },
  { n: 19, kicker: 'TECH · AI', art: 'chartdown', head: 'Anthropic shares tumble after record IPO debut', body: 'After closing up 17% at $97.17 on Thursday, Anthropic gives back most of its pop on Friday. Its market cap had topped $2.09tn.', label: 'REPORTED', src: 'Zacks / AITNT' },
  { n: 20, kicker: 'AFRICA · CONGO', art: 'cross', head: 'Fighting near Congo Ebola area disrupts response', body: 'The WHO chief says fighting near the Ebola outbreak area is disrupting response efforts in the Democratic Republic of Congo.', label: 'REPORTED', src: 'Reuters' },
  { n: 21, kicker: 'AFRICA · S. SUDAN', art: 'tent', head: 'SPLA-IO attack leaves 24 civilians dead in S. Sudan', body: 'An attack by SPLA-IO forces leaves 24 civilians dead in South Sudan, officials and monitors report.', label: 'REPORTED', src: 'Arab News' },
];

const ALSO: { n: number; text: string; src: string }[] = [
  { n: 22, text: 'Nigeria funeral boat capsizes: 24 dead', src: 'AFP' },
  { n: 23, text: 'Nine shot at a California concert', src: 'AP' },
  { n: 24, text: 'Don Toliver concert evacuated, Manchester', src: 'Reuters' },
  { n: 25, text: 'Molly Meldrum dies aged 83', src: 'AP' },
  { n: 26, text: 'UK digging new reservoirs vs droughts', src: 'AFP' },
  { n: 27, text: 'China: green shift "irreversible" after COP31', src: 'AFP' },
  { n: 28, text: 'Hedge funds lost over 3% in a week', src: 'Reuters' },
  { n: 29, text: 'US consumer sentiment 51.5 in November', src: 'Zacks' },
  { n: 30, text: 'Thousands rally in Istanbul vs media takeover', src: 'AFP' },
  { n: 31, text: 'MIT: laptop-sized AI designs analog chips', src: 'MIT News' },
  { n: 32, text: 'Sky feeds sea 12.8m tonnes of nitrogen a year', src: 'Science' },
  { n: 33, text: 'Robot sub finds volcanoes in Mariana Trench', src: 'One Turn' },
  { n: 34, text: 'DNA clues from 194-year-old tortoise', src: 'One Turn' },
  { n: 35, text: 'Milky Way simulated at record resolution', src: 'One Turn' },
  { n: 36, text: 'California sues OpenAI over AI safety', src: 'Reuters' },
  { n: 37, text: 'Trump hosts third gala for meme-coin holders', src: 'Reuters' },
  { n: 38, text: 'Houthis claim Rabigh refinery hit', src: 'Bota News' },
  { n: 39, text: 'Netanyahu urges Trump to strike Iran now', src: 'MEE' },
  { n: 40, text: 'Likud-Yashar coalition talks end with no deal', src: 'Al Jazeera' },
];

const TIMELINE: { t: string; text: string }[] = [
  { t: '02:47', text: 'Britain announces fresh Russia sanctions' },
  { t: '04:00', text: 'Hamas seeks urgent talks after Gaza aid strike' },
  { t: '06:22', text: 'Allies pledge more air defence for Ukraine' },
  { t: '07:00', text: 'UN urges probe into Benghazi ship attack' },
  { t: '09:44', text: 'Europe "has no seat" at the big-power table' },
  { t: '10:00', text: 'China: COP31 failure disappointing' },
  { t: '15:16', text: 'Netanyahu urges Trump to hit Iran now' },
];

const NUMBERS: { v: string; label: string }[] = [
  { v: '258', label: 'House seats: Democrats\' majority (AP)' },
  { v: '4-0', label: 'Liverpool over Man Utd at Anfield' },
  { v: '-5.3%', label: 'Nasdaq fall on Friday (Zacks)' },
  { v: '48h', label: 'COP31 overtime before collapse' },
  { v: '1,000+', label: 'Delta flights delayed in Atlanta' },
  { v: '$491bn', label: 'Nvidia value erased in one day' },
];

const DATE_CHECK_LEFT = 'Shenzhen trilateral (Thu 19 Nov) · OpenAI GPT-6.2 launch (Thu 19 Nov) · Anthropic IPO debut (Thu 19 Nov) · Liverpool match played Sun 22 Nov, reported in Monday papers';
const DATE_CHECK_NOT_YET = 'Trump-Putin summit in Alaska (Tue 24 Nov) · US core PCE inflation (Wed 25 Nov) · Thanksgiving (Thu 26 Nov) · COP32 in Addis Ababa (2027)';

// ------------------------------------------------------------------- layout
const MX = 22; // margin
const CW = W - 2 * MX; // 980

function labelChip(x: number, y: number, label: string): number {
  const col = label === 'CONFIRMED' ? GREEN : label === 'OFFICIAL' ? GOLD : label === 'CLAIM' ? RED : label === 'FORECAST' ? GREY : BLUE;
  const w = textWidth(label, 8) + 8;
  cv.fillRect(x, y, w, 11, col);
  cv.text(x + 4, y + 1.5, label, 8, WHITE, { bold: true });
  return w;
}

function drawMasthead(): void {
  cv.rule(MX, 8, CW, 2);
  cv.text(MX, 14, 'THE WORLD IN ONE PICTURE', 11, INK, { bold: true });
  cv.text(MX + CW, 14, 'No. 327 · PRICE: ONE DAY', 9, GREY, { align: 'right' });
  cv.text(512, 30, 'MONDAY 23 NOVEMBER 2026', 48, INK, { serif: true, align: 'center', track: 0.5, weight: 0.11 });
  cv.rule(MX, 96, CW, 3);
  cv.rule(MX, 101, CW, 1);
  cv.text(512, 108, '40 STORIES · 7 REGIONS · 10 FIELDS · EVERY ONE FROM THIS MONDAY', 10.5, INK, { bold: true, align: 'center' });
}

function drawTimeline(): void {
  const y0 = 124;
  cv.text(MX, y0, 'THE DAY IN UTC', 11, INK, { bold: true });
  cv.text(MX + CW, y0, 'all times UTC', 8.5, GREY, { align: 'right' });
  const tx0 = 30;
  const tx1 = 994;
  const lineY = 154;
  cv.line(tx0, lineY, tx1, lineY, 2, INK);
  // Only the day's anchors are labelled on the axis; event times sit above/below.
  for (const h of [0, 12, 24]) {
    const x = tx0 + (h / 24) * (tx1 - tx0);
    cv.line(x, lineY - 4, x, lineY + 4, 1.5, INK);
    cv.text(x, lineY + 6, String(h).padStart(2, '0') + ':00', 8, GREY, { align: 'center' });
  }
  const short: Record<string, string> = {
    '02:47': 'UK Russia sanctions',
    '04:00': 'Hamas seeks talks',
    '06:22': 'Air defence pledge',
    '07:00': 'UN Libya probe',
    '09:44': "Europe 'no seat'",
    '10:00': 'China on COP31',
    '15:16': 'Netanyahu: hit Iran',
  };
  TIMELINE.forEach((ev, i) => {
    const [hh, mm] = ev.t.split(':').map(Number);
    const x = tx0 + ((hh + mm / 60) / 24) * (tx1 - tx0);
    cv.circle(x, lineY, 3.5, RED);
    const above = i % 2 === 0;
    const ty = above ? 130 : 162;
    cv.text(x, ty, ev.t, 8.5, RED, { bold: true, align: 'center' });
    cv.text(x, ty + 11, short[ev.t], 8.5, INK, { align: 'center' });
  });
}

function drawNumbers(): void {
  const y0 = 188;
  cv.text(MX, y0, 'THE DAY IN NUMBERS', 11, INK, { bold: true });
  const bw = 160;
  const gap = 4;
  NUMBERS.forEach((n, i) => {
    const x = MX + i * (bw + gap);
    const y = y0 + 14;
    cv.fillRect(x, y, bw, 56, LIGHT);
    cv.rule(x, y, bw, 2, RED);
    cv.text(x + bw / 2, y + 5, n.v, 20, RED, { bold: true, align: 'center' });
    const lines = cv.wrap(n.label, 8, bw - 12);
    lines.slice(0, 2).forEach((ln, j) => cv.text(x + bw / 2, y + 33 + j * 10.5, ln, 8, INK, { align: 'center' }));
  });
  cv.text(MX, y0 + 76, 'LEGEND:  CONFIRMED on the record  ·  OFFICIAL officials say  ·  REPORTED news report  ·  CLAIM unverified claim  ·  FORECAST forecast', 8.5, GREY);
}

function drawFeatured(): void {
  const rows = [FEATURED.slice(0, 3), FEATURED.slice(3, 6)];
  const rowY = [278, 436];
  const colX = [MX, 352, 682];
  rows.forEach((row, r) => {
    const y = rowY[r];
    row.forEach((s, c) => {
      const x = colX[c];
      // number badge + kicker
      cv.fillRect(x, y, 16, 12, RED);
      cv.text(x + 8, y + 1.5, String(s.n), 8.5, WHITE, { bold: true, align: 'center' });
      cv.text(x + 20, y + 1, s.kicker, 8.5, RED, { bold: true });
      // illustration (wide art space)
      cv.fillRect(x, y + 15, 320, 58, WHITE);
      art(s.art, x, y + 15, 320, 58, true);
      cv.rule(x, y + 15, 320, 1, INK);
      cv.rule(x, y + 72, 320, 1, INK);
      cv.rule(x, y + 15, 1, 58, INK);
      cv.rule(x + 319, y + 15, 1, 58, INK);
      // headline (13px, 2 lines, 17.5px leading)
      const hl = cv.wrap(s.head, 13, 320, { bold: true });
      hl.slice(0, 2).forEach((ln, j) => cv.text(x, y + 80 + j * 17.5, ln, 13, INK, { bold: true }));
      // body (9px, 2 lines, 12px leading)
      const bl = cv.wrap(s.body, 9, 320);
      bl.slice(0, 2).forEach((ln, j) => cv.text(x, y + 116 + j * 12, ln, 9, INK));
      // label chip + source
      const cw = labelChip(x, y + 143, s.label);
      cv.text(x + cw + 6, y + 144, s.src, 8.5, GREY);
    });
    cv.rule(MX, y + 158, CW, 1, GREY);
  });
}

function drawMedium(): void {
  const y0 = 600;
  const rowH = 52;
  const colX = [MX, 352, 682];
  MEDIUM.forEach((s, i) => {
    const r = Math.floor(i / 3);
    const c = i % 3;
    const x = colX[c];
    const y = y0 + r * rowH;
    cv.fillRect(x, y + 2, 46, 38, WHITE);
    art(s.art, x, y + 2, 46, 38);
    cv.rule(x, y + 2, 46, 1, INK);
    cv.rule(x, y + 39, 46, 1, INK);
    cv.rule(x, y + 2, 1, 38, INK);
    cv.rule(x + 45, y + 2, 1, 38, INK);
    const tx = x + 52;
    cv.text(tx, y, s.n + '  ' + s.kicker, 7.5, RED, { bold: true });
    const hl = cv.wrap(s.head, 10.5, 268, { bold: true });
    hl.slice(0, 2).forEach((ln, j) => cv.text(tx, y + 10 + j * 13.5, ln, 10.5, INK, { bold: true }));
    const cw = labelChip(tx, y + 40, s.label);
    cv.text(tx + cw + 5, y + 41, s.src, 8, GREY);
  });
  cv.rule(MX, y0 + 5 * rowH + 2, CW, 1, GREY);
}

function drawMap(): void {
  const x = MX;
  const y = 866;
  const w = 300;
  const h = 102;
  cv.fillRect(x, y, w, h, SKY);
  cv.text(x + 6, y + 4, 'WHERE IT HAPPENED', 10, INK, { bold: true });
  const mx = (px: number) => x + 6 + (px / 100) * (w - 12);
  const my = (py: number) => y + 18 + (py / 50) * (h - 26);
  const cont = (pts: [number, number][]) => {
    cv.poly(pts.map(([px, py]) => [mx(px), my(py)] as [number, number]), SAND);
    cv.polyline([...pts.map(([px, py]) => [mx(px), my(py)] as [number, number]), [mx(pts[0][0]), my(pts[0][1])]], 1, INK);
  };
  cont([[4, 8], [26, 6], [30, 12], [24, 18], [18, 22], [10, 20], [4, 14]]); // N America
  cont([[26, 28], [34, 28], [32, 40], [28, 46], [26, 36]]); // S America
  cont([[46, 22], [58, 20], [62, 28], [56, 38], [48, 34], [44, 26]]); // Africa
  cont([[46, 10], [56, 8], [58, 14], [50, 16], [44, 14]]); // Europe
  cont([[58, 8], [92, 6], [96, 14], [88, 24], [76, 26], [66, 20], [60, 14]]); // Asia
  cont([[82, 36], [94, 36], [92, 44], [82, 44]]); // Australia
  FEATURED.forEach((s) => {
    if (!s.pin) return;
    const px = x + 6 + (s.pin[0] / 100) * (w - 12);
    const py = y + 18 + (s.pin[1] / 70) * (h - 26);
    cv.circle(px, py, 7, RED);
    cv.text(px, py - 4.5, String(s.n), 8.5, WHITE, { bold: true, align: 'center' });
  });
  cv.rule(x, y, w, 1, INK);
  cv.rule(x, y + h - 1, w, 1, INK);
  cv.rule(x, y, 1, h, INK);
  cv.rule(x + w - 1, y, 1, h, INK);
}

function drawAlso(): void {
  const x = 334;
  const y = 866;
  cv.text(x, y + 2, 'ALSO ON 23 NOVEMBER', 10, INK, { bold: true });
  const colW = 330;
  ALSO.forEach((item, i) => {
    const col = i < 10 ? 0 : 1;
    const row = i % 10;
    const ix = x + col * (colW + 8);
    const iy = y + 18 + row * 10;
    cv.text(ix, iy, String(item.n) + '.', 8, RED, { bold: true });
    cv.text(ix + 15, iy, item.text, 8, INK);
    const tw = textWidth(item.text, 8);
    cv.text(ix + 15 + tw + 4, iy, '— ' + item.src, 7.5, GREY);
  });
}

function drawFooter(): void {
  const y = 974;
  cv.fillRect(MX, y, CW, 32, LIGHT);
  const l1 = cv.wrap('DATE CHECK — LEFT OUT AS OLDER NEWS: ' + DATE_CHECK_LEFT, 8.5, CW - 12);
  const l2 = cv.wrap('NOT YET: ' + DATE_CHECK_NOT_YET, 8.5, CW - 12);
  [...l1.slice(0, 2), ...l2.slice(0, 1)].forEach((ln, j) => cv.text(MX + 6, y + 3 + j * 10.5, ln, 8.5, INK, { bold: j === 0 }));
  cv.text(MX, 1010, 'Drawn by a program · 40 stories, all first reported Monday 23 November 2026', 8.5, GREY);
  cv.text(MX + CW, 1010, 'Sources: AP, Reuters, AFP, Xinhua, Zacks, Bloomberg, MIT News, CNA, MEE', 8.5, GREY, { align: 'right' });
}

// --------------------------------------------------------------------- main
function main(): void {
  drawMasthead();
  drawTimeline();
  drawNumbers();
  drawFeatured();
  drawMedium();
  drawMap();
  drawAlso();
  drawFooter();

  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  mkdirSync(outDir, { recursive: true });
  // Clear only the CONTENTS of the output directory, never the directory itself.
  for (const entry of readdirSync(outDir)) {
    rmSync(join(outDir, entry), { recursive: true, force: true });
  }
  const png = encodePng(W, H, cv.data);
  writeFileSync(join(outDir, 'entry.png'), png);
  console.log('wrote', join(outDir, 'entry.png'), png.length, 'bytes');
}

main();
