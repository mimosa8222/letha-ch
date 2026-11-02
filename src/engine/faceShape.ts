import * as THREE from 'three';

/**
 * Real face shaping: every parameter is a smooth displacement field D(p)
 * evaluated on the actual mesh vertices (bind-pose positions).
 *
 * The SAME position→displacement function is applied to the face mesh, the
 * neck part of the body mesh and the hair, so vertices that coincide across
 * mesh seams (face↔neck, face↔hair) move identically and seams stay closed.
 * Expression morph targets (blink, mouth shapes) stay valid because they are
 * relative deltas on top of the deformed base.
 *
 * Every vertex also carries a tag (brow / eye / skin / hair) so features can be
 * moved independently: eye parameters never drag the eyebrows, and eyebrow
 * parameters move only the eyebrow mesh (kept on the skin surface).
 *
 * To add a parameter: append to PARAMS with an `apply` that edits `p` in place.
 */

export type Tag = 'brow' | 'eye' | 'iris' | 'skin' | 'hair';

export interface Landmarks {
  eyeL: THREE.Vector3;
  eyeR: THREE.Vector3;
  eyeW: number; // eye-white width
  browL: THREE.Vector3;
  browR: THREE.Vector3;
  mouth: THREE.Vector3;
  nose: THREE.Vector3; // nose tip
  chin: THREE.Vector3; // lowest front point of the face
  faceHalfW: number;
}

export type Group = '眉毛' | '眼睛' | '脸型' | '下巴与下颌' | '鼻子' | '嘴巴';

export interface ParamDef {
  key: string;
  label: string;
  group: Group;
  min: number;
  max: number;
  apply(p: THREE.Vector3, v: number, L: Landmarks, tag: Tag): void;
}

/** 1 inside r0, 0 outside r1, smooth in between. */
const fall = (d: number, r0: number, r1: number) => {
  if (d <= r0) return 1;
  if (d >= r1) return 0;
  const t = (d - r0) / (r1 - r0);
  return 1 - t * t * (3 - 2 * t);
};
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const ell = (p: THREE.Vector3, c: THREE.Vector3, sx: number, sy: number, sz: number) =>
  Math.hypot((p.x - c.x) / sx, (p.y - c.y) / sy, (p.z - c.z) / sz);
/** Keeps everything below the jaw (neck/body) fixed. */
const headMask = (p: THREE.Vector3, L: Landmarks) => fall(L.chin.y - p.y, 0.0, 0.045);
/** Front half of the head only (the face), fading out toward the ears. */
const frontMask = (p: THREE.Vector3) => smooth(-0.01, 0.03, p.z);

function eyeField(p: THREE.Vector3, c: THREE.Vector3, L: Landmarks, grow = 1) {
  const r = L.eyeW * 0.5;
  return fall(ell(p, c, 1, 1.05, 1.8), r * 1.15 * grow, r * 2.1 * grow);
}

function eachEye(p: THREE.Vector3, L: Landmarks, tag: Tag, fn: (c: THREE.Vector3, w: number, side: 1 | -1) => void) {
  if (tag === 'brow' || tag === 'hair') return; // eyes never drag eyebrows or hair
  const left = p.x >= 0;
  const c = left ? L.eyeL : L.eyeR;
  const w = eyeField(p, c, L);
  if (w > 0) fn(c, w, left ? 1 : -1);
}

/** Brow-only edit that keeps the brow lying on the curved forehead. */
function brow(p: THREE.Vector3, L: Landmarks, tag: Tag, fn: (c: THREE.Vector3, side: 1 | -1) => void) {
  if (tag !== 'brow') return;
  const side = p.x >= 0 ? 1 : -1;
  const x0 = p.x, y0 = p.y;
  fn(side > 0 ? L.browL : L.browR, side);
  // follow the skull curvature (z falls off with x², forehead leans back with y)
  p.z += -4.5 * (p.x * p.x - x0 * x0) - 0.35 * (p.y - y0);
}

export const PARAMS: ParamDef[] = [
  // ── 眉毛 ──
  { key: 'browHeight', label: '眉毛高度', group: '眉毛', min: -1, max: 1,
    apply(p, v, L, tag) { brow(p, L, tag, () => { p.y += 0.009 * v; }); } },
  { key: 'browSpacing', label: '眉距', group: '眉毛', min: -1, max: 1,
    apply(p, v, L, tag) { brow(p, L, tag, (_c, s) => { p.x += s * 0.007 * v; }); } },
  { key: 'browAngle', label: '眉毛角度', group: '眉毛', min: -1, max: 1,
    apply(p, v, L, tag) {
      brow(p, L, tag, (c, s) => {
        const a = s * 0.3 * v, dx = p.x - c.x, dy = p.y - c.y;
        p.x = c.x + dx * Math.cos(a) - dy * Math.sin(a);
        p.y = c.y + dx * Math.sin(a) + dy * Math.cos(a);
      });
    } },
  { key: 'browThickness', label: '眉毛粗细', group: '眉毛', min: -1, max: 1,
    apply(p, v, L, tag) { brow(p, L, tag, (c) => { p.y = c.y + (p.y - c.y) * (1 + 0.7 * v); }); } },
  { key: 'browLength', label: '眉毛长度', group: '眉毛', min: -1, max: 1,
    apply(p, v, L, tag) {
      brow(p, L, tag, (c, s) => {
        const inner = c.x - s * 0.022; // scale from the inner end outward
        p.x = inner + (p.x - inner) * (1 + 0.3 * v);
      });
    } },

  // ── 眼睛 ──
  { key: 'eyeSize', label: '眼睛大小', group: '眼睛', min: -1, max: 1,
    apply(p, v, L, tag) {
      eachEye(p, L, tag, (c, w) => {
        const k = 0.22 * v * w;
        p.x += (p.x - c.x) * k;
        p.y += (p.y - c.y) * k * 1.1;
      });
    } },
  { key: 'eyeVertical', label: '眼睛纵向', group: '眼睛', min: -1, max: 1,
    apply(p, v, L, tag) { eachEye(p, L, tag, (c, w) => { p.y += (p.y - c.y) * 0.25 * v * w; }); } },
  { key: 'irisSize', label: '瞳孔大小', group: '眼睛', min: -1, max: 1,
    apply(p, v, L, tag) {
      if (tag !== 'iris') return;
      const c = p.x >= 0 ? L.eyeL : L.eyeR;
      p.x += (p.x - c.x) * 0.22 * v;
      p.y += (p.y - c.y) * 0.22 * v;
    } },
  { key: 'irisHeight', label: '瞳孔上下', group: '眼睛', min: -1, max: 1,
    apply(p, v, _L, tag) { if (tag === 'iris') p.y += 0.004 * v; } },
  { key: 'eyeSpacing', label: '眼距', group: '眼睛', min: -1, max: 1,
    apply(p, v, L, tag) {
      eachEye(p, L, tag, (_c, _w, side) => {
        p.x += side * 0.006 * v * eyeField(p, side > 0 ? L.eyeL : L.eyeR, L, 1.25);
      });
    } },
  { key: 'eyeHeight', label: '眼睛高度', group: '眼睛', min: -1, max: 1,
    apply(p, v, L, tag) { eachEye(p, L, tag, (c) => { p.y += 0.007 * v * eyeField(p, c, L, 1.25); }); } },
  { key: 'eyeAngle', label: '眼角角度', group: '眼睛', min: -1, max: 1,
    apply(p, v, L, tag) {
      eachEye(p, L, tag, (c, w, side) => {
        const a = side * 0.22 * v * w;
        const dx = p.x - c.x, dy = p.y - c.y;
        p.x = c.x + dx * Math.cos(a) - dy * Math.sin(a);
        p.y = c.y + dx * Math.sin(a) + dy * Math.cos(a);
      });
    } },

  // ── 脸型 ──
  { key: 'faceWidth', label: '脸宽', group: '脸型', min: -1, max: 1,
    apply(p, v, L) {
      const w = fall(Math.abs(p.y - (L.eyeL.y - 0.02)), 0.05, 0.13) * headMask(p, L);
      p.x *= 1 + 0.09 * v * w;
    } },
  { key: 'faceLength', label: '脸长', group: '脸型', min: -1, max: 1,
    apply(p, v, L) {
      const ey = L.eyeL.y;
      if (p.y >= ey) return;
      const t = Math.min(1, (ey - p.y) / (ey - L.chin.y));
      p.y -= 0.022 * v * t * headMask(p, L);
    } },
  { key: 'cheekbone', label: '颧骨宽度', group: '脸型', min: -1, max: 1,
    apply(p, v, L, tag) {
      if (tag === 'hair') return;
      const w = fall(Math.abs(p.y - (L.eyeL.y - 0.028)), 0.008, 0.035) * smooth(0.04, 0.075, Math.abs(p.x)) * frontMask(p);
      p.x *= 1 + 0.07 * v * w;
    } },
  { key: 'cheekFull', label: '脸颊饱满', group: '脸型', min: -1, max: 1,
    apply(p, v, L, tag) {
      if (tag !== 'skin') return;
      const c = new THREE.Vector3(Math.sign(p.x) * 0.06, (L.mouth.y + L.eyeL.y) / 2 - 0.01, 0.045);
      const w = fall(ell(p, c, 0.03, 0.03, 0.04), 0.2, 1);
      p.x += Math.sign(p.x) * 0.005 * v * w;
      p.z += 0.004 * v * w;
    } },

  // ── 下巴与下颌 ──
  { key: 'chinLength', label: '下巴长度', group: '下巴与下颌', min: -1, max: 1,
    apply(p, v, L) {
      const w = fall(ell(p, L.chin, 0.045, 0.03, 0.07), 0, 1) * headMask(p, L);
      p.y -= 0.012 * v * w;
      p.z += 0.003 * v * w;
    } },
  { key: 'chinWidth', label: '下巴宽度', group: '下巴与下颌', min: -1, max: 1,
    apply(p, v, L) {
      const w = fall(ell(p, L.chin, 0.045, 0.028, 0.08), 0.1, 1) * headMask(p, L);
      p.x *= 1 + 0.35 * v * w;
    } },
  { key: 'chinForward', label: '下巴前后', group: '下巴与下颌', min: -1, max: 1,
    apply(p, v, L) {
      const w = fall(ell(p, L.chin, 0.04, 0.03, 0.06), 0, 1) * headMask(p, L);
      p.z += 0.008 * v * w;
    } },
  { key: 'jawWidth', label: '下颌宽度', group: '下巴与下颌', min: -1, max: 1,
    apply(p, v, L) {
      const midJaw = (L.mouth.y + L.chin.y) / 2;
      const w = fall(Math.abs(p.y - midJaw), 0.012, 0.05) * headMask(p, L);
      p.x *= 1 + 0.14 * v * w;
    } },
  { key: 'jawAngle', label: '下颌角高度', group: '下巴与下颌', min: -1, max: 1,
    apply(p, v, L) {
      const c = new THREE.Vector3(Math.sign(p.x) * 0.075, (L.mouth.y + L.chin.y) / 2 + 0.005, 0.0);
      const w = fall(ell(p, c, 0.035, 0.03, 0.05), 0.2, 1) * headMask(p, L);
      p.y += 0.009 * v * w;
    } },

  // ── 鼻子 ──
  { key: 'noseHeight', label: '鼻梁高度', group: '鼻子', min: -1, max: 1,
    apply(p, v, L) {
      const ridge = new THREE.Vector3(0, L.nose.y + 0.012, L.nose.z);
      p.z += 0.005 * v * fall(ell(p, ridge, 0.011, 0.028, 0.03), 0.3, 1);
    } },
  { key: 'noseWidth', label: '鼻子宽度', group: '鼻子', min: -1, max: 1,
    apply(p, v, L) { p.x *= 1 + 0.45 * v * fall(ell(p, L.nose, 0.018, 0.014, 0.03), 0.3, 1); } },
  { key: 'noseY', label: '鼻子位置', group: '鼻子', min: -1, max: 1,
    apply(p, v, L) { p.y += 0.006 * v * fall(ell(p, L.nose, 0.016, 0.02, 0.03), 0.3, 1); } },
  { key: 'noseSize', label: '鼻子大小', group: '鼻子', min: -1, max: 1,
    apply(p, v, L) {
      const w = fall(ell(p, L.nose, 0.016, 0.02, 0.03), 0.3, 1);
      p.addScaledVector(p.clone().sub(L.nose), 0.35 * v * w);
    } },

  // ── 嘴巴 ──
  { key: 'mouthWidth', label: '嘴巴宽度', group: '嘴巴', min: -1, max: 1,
    apply(p, v, L) { p.x *= 1 + 0.3 * v * fall(ell(p, L.mouth, 0.034, 0.016, 0.06), 0.55, 1); } },
  { key: 'mouthHeight', label: '嘴巴高度', group: '嘴巴', min: -1, max: 1,
    apply(p, v, L) { p.y += 0.008 * v * fall(ell(p, L.mouth, 0.04, 0.02, 0.07), 0.55, 1); } },
  { key: 'mouthSize', label: '嘴巴大小', group: '嘴巴', min: -1, max: 1,
    apply(p, v, L) {
      const w = fall(ell(p, L.mouth, 0.035, 0.016, 0.06), 0.55, 1);
      p.x += (p.x - L.mouth.x) * 0.3 * v * w;
      p.y += (p.y - L.mouth.y) * 0.3 * v * w;
    } },
  { key: 'mouthCorner', label: '嘴角上扬', group: '嘴巴', min: -1, max: 1,
    apply(p, v, L) {
      const w = fall(ell(p, L.mouth, 0.034, 0.014, 0.06), 0.55, 1) * smooth(0.004, 0.02, Math.abs(p.x));
      p.y += 0.004 * v * w;
    } },
];

export type FaceParams = Record<string, number>;
export const defaultFaceParams = (): FaceParams => Object.fromEntries(PARAMS.map((p) => [p.key, 0]));

interface Target {
  attr: THREE.BufferAttribute;
  base: Float32Array;
  toWorld: THREE.Matrix4;
  toLocal: THREE.Matrix4;
  tag: Tag;
}

const tagOf = (m: THREE.Mesh): Tag => {
  const n = [m.material].flat()[0]?.name ?? '';
  if (/Brow/i.test(n)) return 'brow';
  if (/HAIR/i.test(n)) return 'hair';
  if (/EyeIris|EyeHighlight/i.test(n)) return 'iris';
  if (/EYE|Eyeline/i.test(n)) return 'eye';
  return 'skin';
};

function makeTarget(m: THREE.Mesh, tag = tagOf(m)): Target {
  const attr = m.geometry.getAttribute('position') as THREE.BufferAttribute;
  m.updateWorldMatrix(true, false);
  const toWorld = m.matrixWorld.clone();
  return { attr, base: Float32Array.from(attr.array as Float32Array), toWorld, toLocal: toWorld.clone().invert(), tag };
}

export class FaceShaper {
  private targets: Target[] = [];
  private extra: Target[] = [];
  readonly landmarks: Landmarks;

  constructor(meshes: THREE.Mesh[], landmarkMeshes: Record<string, THREE.Mesh[]>) {
    const seen = new Set<THREE.BufferAttribute>();
    for (const m of meshes) {
      const attr = m.geometry.getAttribute('position') as THREE.BufferAttribute;
      if (seen.has(attr)) continue; // primitives may share a buffer: deform once
      seen.add(attr);
      this.targets.push(makeTarget(m));
    }
    this.landmarks = computeLandmarks(landmarkMeshes);
  }

  /** Replace the extra (regenerated) meshes, e.g. procedural hair. */
  setExtra(meshes: THREE.Mesh[]) {
    this.extra = meshes.map((m) => makeTarget(m, 'hair'));
  }

  /** Recompute every target vertex from its rest position. */
  apply(params: FaceParams) {
    const active = PARAMS.filter((d) => Math.abs(params[d.key] ?? 0) > 1e-4);
    const p = new THREE.Vector3();
    const L = this.landmarks;
    for (const t of [...this.targets, ...this.extra]) {
      const { attr, base, tag } = t;
      const arr = attr.array as Float32Array;
      for (let i = 0; i < attr.count; i++) {
        const o = i * 3;
        if (!active.length) {
          arr[o] = base[o]; arr[o + 1] = base[o + 1]; arr[o + 2] = base[o + 2];
          continue;
        }
        p.set(base[o], base[o + 1], base[o + 2]).applyMatrix4(t.toWorld);
        if (p.y < L.chin.y - 0.06) {
          arr[o] = base[o]; arr[o + 1] = base[o + 1]; arr[o + 2] = base[o + 2];
          continue;
        }
        for (const d of active) d.apply(p, params[d.key], L, tag);
        p.applyMatrix4(t.toLocal);
        arr[o] = p.x; arr[o + 1] = p.y; arr[o + 2] = p.z;
      }
      attr.needsUpdate = true;
    }
  }

  /** Total vertex displacement (m), optionally only for one tag — used by tests. */
  displacement(tag?: Tag): number {
    let sum = 0;
    for (const t of [...this.targets, ...this.extra]) {
      if (tag && t.tag !== tag) continue;
      const arr = t.attr.array as Float32Array;
      for (let i = 0; i < arr.length; i++) sum += Math.abs(arr[i] - t.base[i]);
    }
    return sum;
  }
}

function worldPoints(meshes: THREE.Mesh[] | undefined) {
  const out: THREE.Vector3[] = [];
  for (const m of meshes ?? []) {
    m.updateWorldMatrix(true, false);
    const a = m.geometry.getAttribute('position');
    const idx = m.geometry.index;
    const used = idx ? new Set(Array.from(idx.array as ArrayLike<number>)) : null;
    for (let i = 0; i < a.count; i++) {
      if (used && !used.has(i)) continue;
      out.push(new THREE.Vector3().fromBufferAttribute(a, i).applyMatrix4(m.matrixWorld));
    }
  }
  return out;
}

const mean = (pts: THREE.Vector3[]) => pts.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, pts.length));

function computeLandmarks(m: Record<string, THREE.Mesh[]>): Landmarks {
  const iris = worldPoints(m.iris);
  const white = worldPoints(m.white);
  const mouth = worldPoints(m.mouth);
  const skin = worldPoints(m.skin);
  const brows = worldPoints(m.brow);
  const eyeL = mean(iris.filter((p) => p.x > 0));
  const eyeR = mean(iris.filter((p) => p.x < 0));
  const wl = white.filter((p) => p.x > 0);
  const eyeW = Math.max(...wl.map((p) => p.x)) - Math.min(...wl.map((p) => p.x));
  const maxZ = Math.max(...mouth.map((p) => p.z));
  const mth = mean(mouth.filter((p) => p.z > maxZ - 0.015)); // lips, not teeth/tongue
  const mid = skin.filter((p) => Math.abs(p.x) < 0.006 && p.y < eyeL.y && p.y > mth.y);
  const nose = mid.reduce((a, b) => (b.z > a.z ? b : a), mid[0] ?? new THREE.Vector3(0, eyeL.y - 0.035, 0.08));
  const front = skin.filter((p) => Math.abs(p.x) < 0.01 && p.z > 0.02);
  const chin = front.reduce((a, b) => (b.y < a.y ? b : a), front[0] ?? new THREE.Vector3(0, mth.y - 0.035, 0.06));
  const band = skin.filter((p) => Math.abs(p.y - eyeL.y) < 0.01);
  const faceHalfW = Math.max(...band.map((p) => Math.abs(p.x)));
  const bl = brows.filter((p) => p.x > 0), br = brows.filter((p) => p.x < 0);
  const browL = bl.length ? mean(bl) : new THREE.Vector3(0.045, eyeL.y + 0.037, 0.064);
  const browR = br.length ? mean(br) : new THREE.Vector3(-0.045, eyeL.y + 0.037, 0.064);
  return { eyeL, eyeR, eyeW, browL, browR, mouth: mth, nose: nose.clone(), chin: chin.clone(), faceHalfW };
}
