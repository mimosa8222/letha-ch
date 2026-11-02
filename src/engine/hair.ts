import * as THREE from 'three';
import { MToonMaterial } from '@pixiv/three-vrm';

/**
 * Procedural anime hair.
 *
 * A hairstyle = front (前发) + side (侧发) + back (后发) groups. Each group is a
 * list of strands; each strand is a flat, tapering ribbon (lens cross-section)
 * grown from a root on the skull and simulated a few steps under gravity with
 * collision against the skull, neck, shoulders and torso, so it drapes over the
 * real body. All strands of a style are merged into one mesh + an inverted-hull
 * outline, tinted by the hair color like the original model's hair.
 */

export interface HairStyle {
  mode: 'original' | 'custom';
  front: string;
  side: string;
  back: string;
  frontLen: number; // multipliers, 1 = default
  sideLen: number;
  backLen: number;
  volume: number; // 0..1 extra lift off the scalp
}

export const defaultHair = (): HairStyle => ({
  mode: 'custom', front: 'side', side: 'short', back: 'medium', frontLen: 1, sideLen: 1, backLen: 1, volume: 0.4,
});

export const FRONT_STYLES = [
  ['blunt', '齐刘海'], ['side', '斜刘海'], ['center', '中分'], ['air', '空气刘海'], ['none', '露额头'],
] as const;
export const SIDE_STYLES = [
  ['none', '无'], ['short', '短鬓发'], ['long', '长鬓发'], ['hime', '公主切'],
] as const;
export const BACK_STYLES = [
  ['short', '短发'], ['bob', '波波头'], ['medium', '中长发'], ['long', '长直发'],
  ['ponytail', '高马尾'], ['twintail', '双马尾'], ['bun', '丸子头'],
] as const;

// ── body proxies (bind pose, metres; measured from the base model) ──
const SKULL_C = new THREE.Vector3(0, 1.468, -0.025);
const SKULL_R = new THREE.Vector3(0.1, 0.13, 0.115);
const BODY: { c: THREE.Vector3; r: THREE.Vector3 }[] = [
  { c: new THREE.Vector3(0, 1.12, -0.01), r: new THREE.Vector3(0.185, 0.235, 0.145) }, // torso (+ clothes)
  { c: new THREE.Vector3(0.13, 1.28, -0.01), r: new THREE.Vector3(0.1, 0.07, 0.09) }, // shoulders
  { c: new THREE.Vector3(-0.13, 1.28, -0.01), r: new THREE.Vector3(0.1, 0.07, 0.09) },
  { c: new THREE.Vector3(0, 1.32, -0.02), r: new THREE.Vector3(0.055, 0.09, 0.055) }, // neck
];

const dirOf = (az: number, el: number) => new THREE.Vector3(Math.sin(el) * Math.sin(az), Math.cos(el), Math.sin(el) * Math.cos(az));
const onSkull = (az: number, el: number, s = 1) => dirOf(az, el).multiply(SKULL_R).multiplyScalar(s).add(SKULL_C);

function pushOut(p: THREE.Vector3, c: THREE.Vector3, r: THREE.Vector3, s: number) {
  const q = new THREE.Vector3().subVectors(p, c).divide(r);
  const l = q.length();
  if (l < s) p.copy(q.multiplyScalar(s / Math.max(l, 1e-5)).multiply(r).add(c));
}

interface StrandSpec {
  az: number; // root azimuth (0 = front, +π/2 = character's left)
  el: number; // root polar angle from the crown
  w: number; // root half-width
  len?: number; // max length
  stopY?: number; // cut line (blunt cuts)
  drift?: number; // sideways push (+ = toward character's left)
  layer?: number; // scalp offset multiplier
  curl?: number; // tip curl: + outward flip, − inward
  steer?: THREE.Vector3; // pulled toward a tie point (ponytail)
  gravity?: number;
  startDir?: THREE.Vector3;
  start?: THREE.Vector3;
  collideSkull?: boolean;
  flat?: boolean; // hugs the scalp (tied hair)
}

function growStrand(s: StrandSpec, volume: number): THREE.Vector3[] {
  const layer = (s.layer ?? 1.03) + volume * 0.04;
  // root starts just under the scalp cap and rises to its layer
  const p = s.start ? s.start.clone() : onSkull(s.az, s.el, 1.006);
  // initial direction: down along the skull surface
  let d = s.startDir?.clone() ?? onSkull(s.az, s.el + 0.05, layer).sub(onSkull(s.az, s.el, layer)).normalize();
  const pts = [p.clone()];
  const step = 0.008;
  const maxLen = s.len ?? 1;
  const g = new THREE.Vector3(0, -(s.gravity ?? 0.22), 0);
  let travelled = 0;
  for (let i = 0; i < 160 && travelled < maxLen; i++) {
    const az = Math.atan2(p.x - SKULL_C.x, p.z - SKULL_C.z);
    const tangentAz = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az));
    d.add(g.clone().multiplyScalar(0.6));
    if (s.drift) d.addScaledVector(tangentAz, s.drift * 0.08);
    if (s.steer) {
      const to = s.steer.clone().sub(p);
      if (to.length() < 0.012) break;
      d.lerp(to.normalize(), 0.35);
    }
    d.normalize();
    p.addScaledVector(d, step);
    if (s.collideSkull !== false) pushOut(p, SKULL_C, SKULL_R, layer);
    for (const b of BODY) pushOut(p, b.c, b.r, 1.0 + 0.012 / b.r.y);
    travelled += step;
    pts.push(p.clone());
    if (s.stopY !== undefined && p.y <= s.stopY) break;
  }
  // tip curl (outward flip or inward bob curl) over the last 25%
  if (s.curl && pts.length > 6) {
    const n = pts.length, k0 = Math.floor(n * 0.75);
    for (let i = k0; i < n; i++) {
      const t = (i - k0) / (n - 1 - k0);
      const out = new THREE.Vector3(pts[i].x - SKULL_C.x, 0, pts[i].z - SKULL_C.z).normalize();
      pts[i].addScaledVector(out, s.curl * 0.03 * t * t);
      pts[i].y += Math.abs(s.curl) * 0.012 * t * t;
    }
  }
  return pts;
}

// ── style definitions → strand specs ──
const rnd = (seed: number) => { const x = Math.sin(seed * 127.1) * 43758.5453; return x - Math.floor(x); };

function frontStrands(style: string, L: number): StrandSpec[] {
  const out: StrandSpec[] = [];
  const browY = 1.485;
  if (style === 'none') {
    // swept back: short strands from the hairline toward the crown/back
    for (let i = 0; i < 16; i++) {
      const az = -1.0 + (2.0 * i) / 15;
      const up = onSkull(az, 0.3 * Math.PI).sub(onSkull(az, 0.36 * Math.PI)).normalize();
      out.push({ az, el: 0.37 * Math.PI, w: 0.02, len: 0.11, startDir: up, gravity: 0, layer: 1.035 });
    }
    return out;
  }
  const n = style === 'air' ? 9 : 19;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1); // 0 = character's right … 1 = left
    const az = -0.95 + 1.9 * t + (rnd(i + 3) - 0.5) * 0.05;
    const el = 0.13 * Math.PI + rnd(i) * 0.03;
    const j = (rnd(i + 11) - 0.5) * 0.012;
    if (style === 'blunt') out.push({ az, el, w: 0.019, stopY: browY - 0.004 + j * 0.3 - (L - 1) * 0.05, layer: 1.04 + rnd(i) * 0.015 });
    if (style === 'air') out.push({ az, el, w: 0.011, stopY: browY + 0.006 + j - (L - 1) * 0.05, layer: 1.035 });
    if (style === 'center') {
      const side = az >= 0 ? 1 : -1;
      out.push({ az: az + side * 0.05, el, w: 0.019, drift: side * 0.9, stopY: browY - 0.03 - Math.abs(az) * 0.05 - (L - 1) * 0.06 + j, layer: 1.04 });
    }
    if (style === 'side') {
      out.push({ az, el, w: 0.019, drift: -0.75, stopY: browY + 0.012 - t * 0.045 - (L - 1) * 0.06 + j, layer: 1.04 + rnd(i) * 0.01 });
    }
  }
  return out;
}

function sideStrands(style: string, L: number): StrandSpec[] {
  if (style === 'none') return [];
  const out: StrandSpec[] = [];
  for (const side of [-1, 1]) {
    const n = style === 'hime' ? 5 : 4;
    for (let i = 0; i < n; i++) {
      const az = side * (1.02 + i * 0.09);
      const el = 0.27 * Math.PI + i * 0.02;
      const j = (rnd(i * 7 + side) - 0.5) * 0.015;
      if (style === 'short') out.push({ az, el, w: 0.018, stopY: 1.37 - (L - 1) * 0.08 + j, curl: -0.15, layer: 1.06 });
      if (style === 'long') out.push({ az, el, w: 0.018, stopY: 1.14 - (L - 1) * 0.15 + j * 2, drift: side * -0.08, layer: 1.05 });
      if (style === 'hime') out.push({ az: side * (0.98 + i * 0.07), el, w: 0.02, stopY: 1.4 - (L - 1) * 0.08, gravity: 0.35, layer: 1.05 });
    }
  }
  return out;
}

function tieStrands(tie: THREE.Vector3, azFrom: number, azTo: number, n: number): StrandSpec[] {
  const out: StrandSpec[] = [];
  for (let i = 0; i < n; i++) {
    // only over the top/back of the skull — the scalp cap covers the sides, so nothing wraps over the ears
    for (const el of [0.1 * Math.PI, 0.2 * Math.PI, 0.3 * Math.PI]) {
      const az = azFrom + ((azTo - azFrom) * (i + 0.5 + (el > 1 ? 0.5 : 0))) / n;
      out.push({ az, el, w: 0.026, steer: tie, layer: 1.016, gravity: 0, len: 0.4, flat: true });
    }
  }
  return out;
}

function tail(tie: THREE.Vector3, back: THREE.Vector3, len: number, n: number, spread: number, seed: number): StrandSpec[] {
  const out: StrandSpec[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = spread * (0.4 + 0.6 * rnd(i + seed));
    const off = new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r * 0.6, Math.sin(a) * r);
    out.push({
      az: 0, el: 0, w: 0.016, start: tie.clone().add(off), startDir: back.clone().add(off.clone().multiplyScalar(8)).normalize(),
      len: len * (0.85 + 0.3 * rnd(i + seed * 3)), gravity: 0.32, layer: 1.0, curl: 0.25,
    });
  }
  return out;
}

function backStrands(style: string, L: number): StrandSpec[] {
  const out: StrandSpec[] = [];
  const shell = (stopY: number, curl: number, rows = 2, cols = 15, drift = 0) => {
    for (let r = 0; r < rows; r++)
      for (let i = 0; i < cols; i++) {
        const span = Math.PI - 1.1;
        const az = Math.PI + (i / (cols - 1) - 0.5) * 2 * span + (r ? span / cols : 0);
        const el = [0.1, 0.27, 0.42][r] * Math.PI + rnd(i + r * 31) * 0.04;
        const j = (rnd(i * 3 + r) - 0.5) * 0.03;
        out.push({ az, el, w: 0.03, stopY: stopY + j - r * 0.004, curl, layer: 1.035 + (2 - r) * 0.018, drift: drift * Math.sign(Math.sin(az)) });
      }
  };
  switch (style) {
    case 'short': shell(1.39 - (L - 1) * 0.05, -0.2, 3, 20); break;
    case 'bob': shell(1.355 - (L - 1) * 0.06, -0.7, 3, 20); break;
    case 'medium': shell(1.25 - (L - 1) * 0.1, 0.3, 3, 20); break;
    case 'long': shell(0.92 - (L - 1) * 0.2, 0.1, 3, 20); break;
    case 'ponytail': {
      const tie = new THREE.Vector3(0, 1.545, -0.135);
      out.push(...tieStrands(tie, Math.PI - 2.1, Math.PI + 2.1, 18));
      out.push(...tail(tie, new THREE.Vector3(0, -0.2, -1), 0.42 * L, 22, 0.022, 1));
      break;
    }
    case 'twintail': {
      for (const side of [-1, 1]) {
        const tie = new THREE.Vector3(side * 0.098, 1.535, -0.055);
        out.push(...tieStrands(tie, side > 0 ? 1.5 : Math.PI, side > 0 ? Math.PI : 2 * Math.PI - 1.5, 6));
        out.push(...tail(tie, new THREE.Vector3(side * 0.6, -0.1, -0.3), 0.5 * L, 16, 0.018, side + 5));
      }
      break;
    }
    case 'bun': {
      const tie = new THREE.Vector3(0, 1.6, -0.105);
      out.push(...tieStrands(tie, Math.PI - 2.1, Math.PI + 2.1, 12));
      break;
    }
  }
  return out;
}

// ── geometry ──
function strandGeometry(pts: THREE.Vector3[], w0: number, pos: number[], nor: number[], uv: number[], idx: number[], flat = false) {
  if (pts.length < 3) return;
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const S = Math.min(36, Math.max(8, pts.length));
  const R = 10;
  const base = pos.length / 3;
  const T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), P = new THREE.Vector3();
  for (let i = 0; i <= S; i++) {
    const t = i / S;
    curve.getPointAt(t, P);
    curve.getTangentAt(t, T);
    N.set(P.x - SKULL_C.x, 0.35 * (P.y - SKULL_C.y), P.z - SKULL_C.z).normalize();
    N.addScaledVector(T, -N.dot(T)).normalize();
    B.crossVectors(T, N).normalize();
    // pointed tip, slightly fuller in the middle
    // roots grow out of the scalp (no open tube ends), pointed tips
    const root = 0.35 + 0.65 * Math.min(1, t / 0.12);
    const w = w0 * root * Math.pow(1 - t, 0.7) * (1 + 0.25 * Math.sin(Math.PI * t)) + 0.0006;
    const th = flat ? 0.0012 : Math.max(0.0012, w * 0.22);
    for (let k = 0; k <= R; k++) {
      const a = (k / R) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      pos.push(P.x + B.x * ca * w + N.x * sa * th, P.y + B.y * ca * w + N.y * sa * th, P.z + B.z * ca * w + N.z * sa * th);
      // blend toward the clump/head normal so neighbouring strands shade as one mass
      const n = new THREE.Vector3().addScaledVector(B, ca * th).addScaledVector(N, sa * w).normalize().multiplyScalar(0.45).addScaledVector(N, 0.55).normalize();
      nor.push(n.x, n.y, n.z);
      // v from world height: one continuous highlight ring around the whole head
      uv.push(k / R, Math.min(1, Math.max(0, (1.62 - P.y) / 0.75)));
    }
  }
  for (let i = 0; i < S; i++)
    for (let k = 0; k < R; k++) {
      const a = base + i * (R + 1) + k, b = a + R + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
}

/** Scalp cap so the head never shows between strands. */
function capGeometry(style: HairStyle, pos: number[], nor: number[], uv: number[], idx: number[]) {
  const A = 48, E = 16, base = pos.length / 3;
  for (let i = 0; i <= A; i++) {
    const az = (i / A) * Math.PI * 2;
    const front = (1 + Math.cos(az)) / 2; // 1 at front, 0 at back
    // natural hairline: high at the forehead, down over the temples, low at the nape
    const elMax = (0.3 + 0.36 * (1 - front) + 0.08 * Math.sin(az) ** 2) * Math.PI;
    for (let j = 0; j <= E; j++) {
      const el = (j / E) * elMax;
      const p = onSkull(az, el, 1.012 + style.volume * 0.02);
      pos.push(p.x, p.y, p.z);
      const n = p.clone().sub(SKULL_C).divide(SKULL_R).divide(SKULL_R).normalize();
      nor.push(n.x, n.y, n.z);
      uv.push(i / A, Math.min(1, Math.max(0, (1.62 - p.y) / 0.75)));
    }
  }
  for (let i = 0; i < A; i++)
    for (let j = 0; j < E; j++) {
      const a = base + i * (E + 1) + j, b = a + E + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
}

function bunGeometry(pos: number[], nor: number[], uv: number[], idx: number[]) {
  const g = new THREE.SphereGeometry(0.048, 24, 16);
  g.scale(1, 0.85, 1);
  g.translate(0, 1.625, -0.12);
  const base = pos.length / 3;
  pos.push(...g.attributes.position.array);
  nor.push(...g.attributes.normal.array);
  const u = g.attributes.uv.array;
  for (let i = 0; i < u.length; i += 2) uv.push(u[i] * 6 % 1, 0.15 + u[i + 1] * 0.5);
  idx.push(...Array.from(g.index!.array, (v) => v + base));
}

let hairTex: THREE.Texture | null = null;
function hairTexture() {
  if (hairTex) return hairTex;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#cfcfcf'); g.addColorStop(0.085, '#d8d8d8'); g.addColorStop(0.105, '#ffffff');
  g.addColorStop(0.125, '#f2f2f2'); g.addColorStop(0.145, '#d4d4d4'); g.addColorStop(0.6, '#cdcdcd'); g.addColorStop(1, '#b0b0b0');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 256);
  ctx.globalAlpha = 0.07; ctx.fillStyle = '#000';
  for (let x = 3; x < 64; x += 8) ctx.fillRect(x, 0, 1, 256);
  hairTex = new THREE.CanvasTexture(c);
  hairTex.colorSpace = THREE.SRGBColorSpace;
  hairTex.wrapS = THREE.RepeatWrapping;
  return hairTex;
}

const outlineMat = () =>
  new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color('#3a2a22') } },
    vertexShader: `void main(){ vec3 p = position + normal * 0.0011; gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }`,
    fragmentShader: `uniform vec3 color; void main(){ gl_FragColor = vec4(color,1.0); }`,
    side: THREE.BackSide,
  });

export class ProceduralHair {
  readonly group = new THREE.Group();
  readonly material: MToonMaterial;
  readonly outline = outlineMat();
  mesh: THREE.Mesh | null = null;
  private key = '';

  constructor() {
    this.group.name = 'procedural-hair';
    this.material = new MToonMaterial({
      map: hairTexture(), shadingToonyFactor: 0.92, shadingShiftFactor: -0.1, side: THREE.DoubleSide,
    });
    this.material.name = 'ProceduralHair_HAIR';
  }

  /** Rebuild if the style changed. Returns true when geometry was replaced. */
  build(style: HairStyle): boolean {
    const key = JSON.stringify(style);
    if (key === this.key) return false;
    this.key = key;
    const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
    capGeometry(style, pos, nor, uv, idx);
    if (style.back === 'bun') bunGeometry(pos, nor, uv, idx);
    const specs = [
      ...backStrands(style.back, style.backLen),
      ...sideStrands(style.side, style.sideLen),
      ...frontStrands(style.front, style.frontLen),
    ];
    for (const s of specs) strandGeometry(growStrand(s, style.volume), s.w * (1 + style.volume * 0.4), pos, nor, uv, idx, s.flat);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.group.clear();
    }
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    const ol = new THREE.Mesh(geo, this.outline);
    ol.frustumCulled = false;
    this.group.add(this.mesh, ol);
    return true;
  }

  get strandCount() {
    return this.mesh ? this.mesh.geometry.getAttribute('position').count : 0;
  }
}
