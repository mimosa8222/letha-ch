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
 * To add a parameter: append to PARAMS with a `apply` that edits `p` in place.
 */

export interface Landmarks {
  eyeL: THREE.Vector3;
  eyeR: THREE.Vector3;
  eyeW: number; // eye-white width
  mouth: THREE.Vector3;
  nose: THREE.Vector3; // nose tip
  chin: THREE.Vector3; // lowest front point of the face
  faceHalfW: number;
}

export interface ParamDef {
  key: string;
  label: string;
  group: '眼睛' | '脸型' | '鼻子' | '嘴巴';
  min: number;
  max: number;
  apply(p: THREE.Vector3, v: number, L: Landmarks): void;
}

/** 1 inside r0, 0 outside r1, smooth in between. */
const fall = (d: number, r0: number, r1: number) => {
  if (d <= r0) return 1;
  if (d >= r1) return 0;
  const t = (d - r0) / (r1 - r0);
  return 1 - t * t * (3 - 2 * t);
};
const ell = (p: THREE.Vector3, c: THREE.Vector3, sx: number, sy: number, sz: number) =>
  Math.hypot((p.x - c.x) / sx, (p.y - c.y) / sy, (p.z - c.z) / sz);
/** Keeps everything below the jaw (neck/body) fixed, and only the front-ish head moves. */
const headMask = (p: THREE.Vector3, L: Landmarks) => fall(L.chin.y - p.y, 0.0, 0.045);

function eyeField(p: THREE.Vector3, c: THREE.Vector3, L: Landmarks, grow = 1) {
  const r = L.eyeW * 0.5;
  return fall(ell(p, c, 1, 1.05, 1.8), r * 1.15 * grow, r * 2.1 * grow);
}

function eachEye(p: THREE.Vector3, L: Landmarks, fn: (c: THREE.Vector3, w: number, side: 1 | -1) => void) {
  // a vertex belongs to the nearer eye; fields don't overlap at the nose bridge
  const left = p.x >= 0;
  const c = left ? L.eyeL : L.eyeR;
  const w = eyeField(p, c, L);
  if (w > 0) fn(c, w, left ? 1 : -1);
}

export const PARAMS: ParamDef[] = [
  {
    key: 'eyeSize', label: '眼睛大小', group: '眼睛', min: -1, max: 1,
    apply(p, v, L) {
      eachEye(p, L, (c, w) => {
        const k = 0.22 * v * w;
        p.x += (p.x - c.x) * k;
        p.y += (p.y - c.y) * k * 1.1;
      });
    },
  },
  {
    key: 'eyeSpacing', label: '眼距', group: '眼睛', min: -1, max: 1,
    apply(p, v, L) {
      eachEye(p, L, (_c, _w, side) => {
        const w = eyeField(p, side > 0 ? L.eyeL : L.eyeR, L, 1.25);
        p.x += side * 0.006 * v * w;
      });
    },
  },
  {
    key: 'eyeHeight', label: '眼睛高度', group: '眼睛', min: -1, max: 1,
    apply(p, v, L) {
      eachEye(p, L, (c) => {
        p.y += 0.007 * v * eyeField(p, c, L, 1.25);
      });
    },
  },
  {
    key: 'eyeAngle', label: '眼角角度', group: '眼睛', min: -1, max: 1,
    apply(p, v, L) {
      eachEye(p, L, (c, w, side) => {
        const a = side * 0.22 * v * w;
        const dx = p.x - c.x, dy = p.y - c.y;
        p.x = c.x + dx * Math.cos(a) - dy * Math.sin(a);
        p.y = c.y + dx * Math.sin(a) + dy * Math.cos(a);
      });
    },
  },
  {
    key: 'faceWidth', label: '脸宽', group: '脸型', min: -1, max: 1,
    apply(p, v, L) {
      // cheeks/temples band, fades above the brows and below the jaw
      const w = fall(Math.abs(p.y - (L.eyeL.y - 0.02)), 0.05, 0.13) * headMask(p, L);
      p.x *= 1 + 0.09 * v * w;
    },
  },
  {
    key: 'faceLength', label: '脸长', group: '脸型', min: -1, max: 1,
    apply(p, v, L) {
      // stretch everything below the eye line downward
      const ey = L.eyeL.y;
      if (p.y >= ey) return;
      const t = Math.min(1, (ey - p.y) / (ey - L.chin.y));
      p.y -= 0.022 * v * t * headMask(p, L);
    },
  },
  {
    key: 'chinLength', label: '下巴长度', group: '脸型', min: -1, max: 1,
    apply(p, v, L) {
      const w = fall(ell(p, L.chin, 0.045, 0.03, 0.07), 0, 1) * headMask(p, L);
      p.y -= 0.012 * v * w;
      p.z += 0.003 * v * w;
    },
  },
  {
    key: 'jawWidth', label: '下颌宽度', group: '脸型', min: -1, max: 1,
    apply(p, v, L) {
      const midJaw = (L.mouth.y + L.chin.y) / 2;
      const w = fall(Math.abs(p.y - midJaw), 0.012, 0.05) * headMask(p, L);
      p.x *= 1 + 0.14 * v * w;
    },
  },
  {
    key: 'noseHeight', label: '鼻梁高度', group: '鼻子', min: -1, max: 1,
    apply(p, v, L) {
      const ridge = new THREE.Vector3(0, L.nose.y + 0.012, L.nose.z);
      const w = fall(ell(p, ridge, 0.011, 0.028, 0.03), 0.3, 1);
      p.z += 0.005 * v * w;
    },
  },
  {
    key: 'noseWidth', label: '鼻子宽度', group: '鼻子', min: -1, max: 1,
    apply(p, v, L) {
      const w = fall(ell(p, L.nose, 0.018, 0.014, 0.03), 0.3, 1);
      p.x *= 1 + 0.45 * v * w;
    },
  },
  {
    key: 'mouthWidth', label: '嘴巴宽度', group: '嘴巴', min: -1, max: 1,
    apply(p, v, L) {
      const w = fall(ell(p, L.mouth, 0.034, 0.016, 0.06), 0.55, 1);
      p.x *= 1 + 0.3 * v * w;
    },
  },
  {
    key: 'mouthHeight', label: '嘴巴高度', group: '嘴巴', min: -1, max: 1,
    apply(p, v, L) {
      const w = fall(ell(p, L.mouth, 0.04, 0.02, 0.07), 0.55, 1);
      p.y += 0.008 * v * w;
    },
  },
];

export type FaceParams = Record<string, number>;
export const defaultFaceParams = (): FaceParams => Object.fromEntries(PARAMS.map((p) => [p.key, 0]));

interface Target {
  attr: THREE.BufferAttribute;
  base: Float32Array;
  toWorld: THREE.Matrix4;
  toLocal: THREE.Matrix4;
}

export class FaceShaper {
  private targets: Target[] = [];
  readonly landmarks: Landmarks;

  constructor(meshes: THREE.Mesh[], landmarkMeshes: Record<string, THREE.Mesh[]>) {
    const seen = new Set<THREE.BufferAttribute>();
    for (const m of meshes) {
      const attr = m.geometry.getAttribute('position') as THREE.BufferAttribute;
      if (seen.has(attr)) continue; // primitives may share a buffer: deform once
      seen.add(attr);
      m.updateWorldMatrix(true, false);
      const toWorld = m.matrixWorld.clone();
      this.targets.push({ attr, base: Float32Array.from(attr.array as Float32Array), toWorld, toLocal: toWorld.clone().invert() });
    }
    this.landmarks = computeLandmarks(landmarkMeshes);
  }

  /** Recompute every target vertex from its rest position. */
  apply(params: FaceParams) {
    const active = PARAMS.filter((d) => Math.abs(params[d.key] ?? 0) > 1e-4);
    const p = new THREE.Vector3();
    const L = this.landmarks;
    for (const t of this.targets) {
      const { attr, base } = t;
      const arr = attr.array as Float32Array;
      for (let i = 0; i < attr.count; i++) {
        const o = i * 3;
        if (!active.length) {
          arr[o] = base[o]; arr[o + 1] = base[o + 1]; arr[o + 2] = base[o + 2];
          continue;
        }
        p.set(base[o], base[o + 1], base[o + 2]).applyMatrix4(t.toWorld);
        if (p.y < L.chin.y - 0.06) { // far below the head: untouched
          arr[o] = base[o]; arr[o + 1] = base[o + 1]; arr[o + 2] = base[o + 2];
          continue;
        }
        for (const d of active) d.apply(p, params[d.key], L);
        p.applyMatrix4(t.toLocal);
        arr[o] = p.x; arr[o + 1] = p.y; arr[o + 2] = p.z;
      }
      attr.needsUpdate = true;
    }
  }

  /** Total vertex displacement (m) — used by the automated test. */
  displacement(): number {
    let sum = 0;
    for (const t of this.targets) {
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
    // only vertices actually referenced by this primitive's triangles
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
  const eyeL = mean(iris.filter((p) => p.x > 0));
  const eyeR = mean(iris.filter((p) => p.x < 0));
  const wl = white.filter((p) => p.x > 0);
  const eyeW = Math.max(...wl.map((p) => p.x)) - Math.min(...wl.map((p) => p.x));
  const mth = mean(mouth.filter((p) => p.z > -1));
  // mouth: use the front-most layer (lips), not teeth/tongue
  const maxZ = Math.max(...mouth.map((p) => p.z));
  const lips = mouth.filter((p) => p.z > maxZ - 0.015);
  mth.copy(mean(lips));
  const mid = skin.filter((p) => Math.abs(p.x) < 0.006 && p.y < eyeL.y && p.y > mth.y);
  const nose = mid.reduce((a, b) => (b.z > a.z ? b : a), mid[0] ?? new THREE.Vector3(0, eyeL.y - 0.035, 0.08));
  const front = skin.filter((p) => Math.abs(p.x) < 0.01 && p.z > 0.02);
  const chin = front.reduce((a, b) => (b.y < a.y ? b : a), front[0] ?? new THREE.Vector3(0, mth.y - 0.035, 0.06));
  const band = skin.filter((p) => Math.abs(p.y - eyeL.y) < 0.01);
  const faceHalfW = Math.max(...band.map((p) => Math.abs(p.x)));
  return { eyeL, eyeR, eyeW, mouth: mth, nose: nose.clone(), chin: chin.clone(), faceHalfW };
}
