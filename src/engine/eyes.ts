import * as THREE from 'three';

/**
 * Procedural anime iris textures.
 *
 * The base model's iris texture (1024×512) holds the iris the mesh samples in
 * one ellipse (pixel centre 766,261, radii 111×126 — measured from the UVs).
 * Each style repaints that ellipse: a two-stop gradient (top colour → bottom
 * colour), an eyelid shadow, a style-specific pattern and pupil, a rim, and
 * baked highlights. Colours are baked in, so the material colour is white.
 */
export interface EyeStyle {
  iris: string;
  highlight: string;
  color2: string; // bottom of the iris gradient
  pupil: number; // pupil scale 0.5..1.5
}

export const defaultEye = (): EyeStyle => ({ iris: 'gem', highlight: 'double', color2: '#e3b77a', pupil: 1 });

export const IRIS_STYLES = [
  ['original', '原版'], ['gem', '宝石'], ['clear', '清澈'], ['ring', '电波圈'],
  ['star', '星星瞳'], ['heart', '爱心瞳'], ['slit', '猫眼竖瞳'], ['hollow', '无神'],
] as const;
export const HIGHLIGHT_STYLES = [
  ['original', '原版'], ['double', '双点'], ['big', '大光斑'], ['star', '星形'], ['sparkle', '十字闪光'], ['none', '无'],
] as const;

const CX = 766, CY = 261, RX = 111, RY = 126;

const col = (hex: string) => new THREE.Color(hex);
const css = (c: THREE.Color, a = 1) => `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
const dark = (c: THREE.Color, k: number) => c.clone().multiplyScalar(k);
const light = (c: THREE.Color, k: number) => c.clone().lerp(new THREE.Color(1, 1, 1), k);
const mix = (a: THREE.Color, b: THREE.Color, t: number) => a.clone().lerp(b, t);

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}

function starPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, inner: number, points: number, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 ? r * inner : r;
    const a = rot + (i * Math.PI) / points;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

function heartPath(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.7, y - s * 1.2, x, y - s * 0.45);
  ctx.bezierCurveTo(x + s * 0.7, y - s * 1.2, x + s * 1.4, y - s * 0.1, x, y + s * 0.9);
  ctx.closePath();
}

function baseGradient(ctx: CanvasRenderingContext2D, c1: THREE.Color, c2: THREE.Color, lightness: number) {
  const g = ctx.createLinearGradient(0, CY - RY, 0, CY + RY);
  g.addColorStop(0, css(dark(c1, 0.35 + lightness * 0.3)));
  g.addColorStop(0.32, css(light(c1, lightness * 0.15)));
  g.addColorStop(0.72, css(mix(c1, c2, 0.7)));
  g.addColorStop(1, css(light(c2, 0.25 + lightness * 0.2)));
  ctx.fillStyle = g;
  ctx.fillRect(CX - RX, CY - RY, RX * 2, RY * 2);
}

function lidShadow(ctx: CanvasRenderingContext2D, k: number) {
  const g = ctx.createLinearGradient(0, CY - RY, 0, CY);
  g.addColorStop(0, `rgba(10,5,15,${0.55 * k})`);
  g.addColorStop(0.6, `rgba(10,5,15,${0.15 * k})`);
  g.addColorStop(1, 'rgba(10,5,15,0)');
  ctx.fillStyle = g;
  ctx.fillRect(CX - RX, CY - RY, RX * 2, RY);
}

function bottomGlow(ctx: CanvasRenderingContext2D, c2: THREE.Color, k: number) {
  const g = ctx.createRadialGradient(CX, CY + RY * 0.62, 4, CX, CY + RY * 0.62, RX * 0.75);
  g.addColorStop(0, css(light(c2, 0.55), 0.85 * k));
  g.addColorStop(1, css(light(c2, 0.3), 0));
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = g;
  ctx.fillRect(CX - RX, CY - RY, RX * 2, RY * 2);
  ctx.globalCompositeOperation = 'source-over';
}

function streaks(ctx: CanvasRenderingContext2D, c: THREE.Color, n: number, a: number) {
  ctx.strokeStyle = css(c, a);
  ctx.lineWidth = 2.5;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2 + (i % 3) * 0.03;
    const r0 = 0.42 + 0.06 * ((i * 7) % 3), r1 = 0.9 - 0.05 * ((i * 5) % 4);
    ctx.beginPath();
    ctx.moveTo(CX + Math.cos(t) * RX * r0, CY + Math.sin(t) * RY * r0);
    ctx.lineTo(CX + Math.cos(t) * RX * r1, CY + Math.sin(t) * RY * r1);
    ctx.stroke();
  }
}

function pupil(ctx: CanvasRenderingContext2D, c1: THREE.Color, s: number, shape: string) {
  const px = CX, py = CY - 6;
  ctx.fillStyle = css(dark(c1, 0.12));
  if (shape === 'star') {
    starPath(ctx, px, py, 46 * s, 0.45, 5);
    ctx.fill();
    ctx.fillStyle = css(light(c1, 0.75), 0.9);
    starPath(ctx, px, py, 18 * s, 0.45, 5);
    ctx.fill();
  } else if (shape === 'heart') {
    heartPath(ctx, px, py + 4, 40 * s);
    ctx.fill();
    ctx.fillStyle = css(light(c1, 0.7), 0.85);
    heartPath(ctx, px - 8 * s, py - 6 * s, 11 * s);
    ctx.fill();
  } else if (shape === 'slit') {
    ellipse(ctx, px, py + 6, 10 * s, 92);
    ctx.fill();
    ctx.strokeStyle = css(light(c1, 0.5), 0.6);
    ctx.lineWidth = 4;
    ellipse(ctx, px, py + 6, 18 * s, 98);
    ctx.stroke();
  } else if (shape === 'dot') {
    ellipse(ctx, px, py, 16 * s, 19 * s);
    ctx.fill();
  } else {
    const g = ctx.createRadialGradient(px, py, 2, px, py, 46 * s);
    g.addColorStop(0, css(dark(c1, 0.08)));
    g.addColorStop(0.75, css(dark(c1, 0.15)));
    g.addColorStop(1, css(dark(c1, 0.3), 0));
    ctx.fillStyle = g;
    ellipse(ctx, px, py, 40 * s, 50 * s);
    ctx.fill();
  }
}

function rim(ctx: CanvasRenderingContext2D, c1: THREE.Color, w: number) {
  ctx.strokeStyle = css(dark(c1, 0.22));
  ctx.lineWidth = w;
  ellipse(ctx, CX, CY, RX - w / 2, RY - w / 2);
  ctx.stroke();
}

function highlights(ctx: CanvasRenderingContext2D, style: string) {
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  const hx = CX - 36, hy = CY - 30; // main highlight: upper-left, below the lid line
  switch (style) {
    case 'double':
      ellipse(ctx, hx, hy, 27, 22, -0.4); ctx.fill();
      ellipse(ctx, CX + 42, CY + 48, 10, 9); ctx.fill();
      break;
    case 'big': {
      const g = ctx.createRadialGradient(hx, hy, 6, hx, hy, 48);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.6, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ellipse(ctx, hx, hy, 48, 42, -0.3); ctx.fill();
      ctx.fillStyle = '#fff'; ellipse(ctx, CX + 40, CY + 50, 7, 7); ctx.fill();
      break;
    }
    case 'star':
      starPath(ctx, hx, hy, 34, 0.32, 4, 0); ctx.fill();
      ellipse(ctx, CX + 40, CY + 46, 8, 8); ctx.fill();
      break;
    case 'sparkle':
      ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(hx - 34, hy); ctx.lineTo(hx + 34, hy); ctx.moveTo(hx, hy - 34); ctx.lineTo(hx, hy + 34); ctx.stroke();
      ellipse(ctx, hx, hy, 12, 12); ctx.fill();
      for (const [x, y, r] of [[CX + 38, CY + 44, 7], [CX + 52, CY + 18, 4], [CX - 54, CY + 40, 4]] as const) { ellipse(ctx, x, y, r, r); ctx.fill(); }
      break;
  }
}

/** Paint the iris for a style into a 1024×512 canvas laid out like the original texture. */
export function paintIris(canvas: HTMLCanvasElement, s: EyeStyle, color1: string, originalGrey?: CanvasImageSource) {
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 1024, 512);
  const c1 = col(color1), c2 = col(s.color2);
  ctx.save();
  ellipse(ctx, CX, CY, RX, RY);
  ctx.clip();
  switch (s.iris) {
    case 'original':
      if (originalGrey) {
        ctx.drawImage(originalGrey, 0, 0, 1024, 512);
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = css(light(c1, 0.1));
        ctx.fillRect(0, 0, 1024, 512);
        ctx.globalCompositeOperation = 'source-over';
      }
      break;
    case 'gem':
      baseGradient(ctx, c1, c2, 0);
      streaks(ctx, light(c2, 0.4), 44, 0.18);
      lidShadow(ctx, 1);
      pupil(ctx, c1, s.pupil, 'round');
      bottomGlow(ctx, c2, 1);
      rim(ctx, c1, 8);
      break;
    case 'clear':
      baseGradient(ctx, c1, c2, 0.6);
      streaks(ctx, light(c2, 0.7), 60, 0.12);
      lidShadow(ctx, 0.6);
      pupil(ctx, c1, s.pupil * 0.75, 'round');
      bottomGlow(ctx, c2, 1.2);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      for (const [x, y, r] of [[-50, 30, 5], [-30, 62, 3.5], [56, -10, 4], [20, 70, 3]] as const) { ellipse(ctx, CX + x, CY + y, r, r); ctx.fill(); }
      rim(ctx, c1, 5);
      break;
    case 'ring':
      for (let k = 7; k >= 1; k--) {
        ctx.fillStyle = css(k % 2 ? mix(c1, c2, (7 - k) / 7) : dark(c1, 0.35 + 0.05 * k));
        ellipse(ctx, CX, CY, (RX * k) / 7, (RY * k) / 7);
        ctx.fill();
      }
      pupil(ctx, c1, s.pupil, 'dot');
      lidShadow(ctx, 0.7);
      rim(ctx, c1, 7);
      break;
    case 'star':
    case 'heart':
    case 'slit':
      baseGradient(ctx, c1, c2, 0.1);
      streaks(ctx, light(c2, 0.4), 36, 0.14);
      lidShadow(ctx, 0.9);
      pupil(ctx, c1, s.pupil, s.iris);
      bottomGlow(ctx, c2, 0.9);
      rim(ctx, c1, 7);
      break;
    case 'hollow': {
      const flat = mix(c1, new THREE.Color(0.45, 0.45, 0.5), 0.45);
      ctx.fillStyle = css(flat);
      ctx.fillRect(CX - RX, CY - RY, RX * 2, RY * 2);
      lidShadow(ctx, 0.8);
      ctx.fillStyle = css(dark(flat, 0.45), 0.55);
      ellipse(ctx, CX, CY, 58 * s.pupil, 66 * s.pupil);
      ctx.fill();
      rim(ctx, flat, 9);
      break;
    }
  }
  if (s.iris !== 'hollow') highlights(ctx, s.highlight);
  ctx.restore();
}

export function eyeKey(s: EyeStyle, color1: string) {
  return `${s.iris}|${s.highlight}|${s.color2}|${s.pupil.toFixed(2)}|${color1}`;
}
