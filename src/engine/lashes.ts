import * as THREE from 'three';
import { MToonMaterial } from '@pixiv/three-vrm';

/**
 * Lower lashes for the base model (it ships with upper lash lines only).
 *
 * The lower-lid contour is read from the face mesh itself: boundary edges of
 * the face skin (edges used by a single triangle) form the eye openings; the
 * part below each eye centre is the lower lid. Along its outer ~60% we build a
 * thin tapered strip that hugs the lid, plus a few short lashes at the outer
 * corner (a common anime touch, and visible in Letha's reference art).
 */
export function lowerLidCurves(skin: THREE.Mesh[], eyeL: THREE.Vector3, eyeR: THREE.Vector3, eyeW: number) {
  const curves: Record<'L' | 'R', THREE.Vector3[]> = { L: [], R: [] };
  for (const m of skin) {
    m.updateWorldMatrix(true, false);
    const pos = m.geometry.getAttribute('position');
    const idx = m.geometry.index;
    if (!idx) continue;
    // weld by position so UV seams don't look like boundaries
    const key = (i: number) => `${pos.getX(i).toFixed(5)},${pos.getY(i).toFixed(5)},${pos.getZ(i).toFixed(5)}`;
    const count = new Map<string, number>();
    const edgeVerts = new Map<string, [number, number]>();
    const a = idx.array as ArrayLike<number>;
    for (let t = 0; t < a.length; t += 3) {
      for (const [i, j] of [[a[t], a[t + 1]], [a[t + 1], a[t + 2]], [a[t + 2], a[t]]]) {
        const ki = key(i), kj = key(j);
        const e = ki < kj ? `${ki}|${kj}` : `${kj}|${ki}`;
        count.set(e, (count.get(e) ?? 0) + 1);
        edgeVerts.set(e, [i, j]);
      }
    }
    const v = new THREE.Vector3();
    for (const [e, n] of count) {
      if (n !== 1) continue;
      for (const i of edgeVerts.get(e)!) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        for (const [side, c] of [['L', eyeL], ['R', eyeR]] as const) {
          if (Math.abs(v.x - c.x) < eyeW * 0.62 && v.y < c.y - 0.002 && v.y > c.y - eyeW * 0.6 && v.z > c.z - 0.02) curves[side].push(v.clone());
        }
      }
    }
  }
  for (const side of ['L', 'R'] as const) {
    // dedupe + sort from inner corner to outer corner
    const s = side === 'L' ? 1 : -1;
    const uniq = new Map<string, THREE.Vector3>();
    for (const p of curves[side]) uniq.set(p.toArray().map((x) => x.toFixed(4)).join(), p);
    curves[side] = [...uniq.values()].sort((p, q) => s * (p.x - q.x));
  }
  return curves;
}

export function buildLowerLashes(curves: Record<'L' | 'R', THREE.Vector3[]>, color: THREE.ColorRepresentation) {
  const pos: number[] = [], idx: number[] = [];
  const quadStrip = (pts: THREE.Vector3[], width: (t: number) => number) => {
    const base = pos.length / 3;
    pts.forEach((p, i) => {
      const t = i / (pts.length - 1);
      const w = width(t);
      // just below the lid edge and a hair in front of the skin
      pos.push(p.x, p.y - 0.0006, p.z + 0.0012, p.x, p.y - 0.0006 - w, p.z + 0.0012);
    });
    for (let i = 0; i < pts.length - 1; i++) {
      const a = base + i * 2;
      idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
  };
  for (const side of ['L', 'R'] as const) {
    const c = curves[side];
    if (c.length < 4) continue;
    const curve = new THREE.CatmullRomCurve3(c);
    const pts = curve.getSpacedPoints(24).slice(9); // outer ~60% of the lid
    quadStrip(pts, (t) => 0.0004 + 0.0011 * Math.sin(Math.PI * Math.min(1, t * 1.1)) ** 0.7);
    // three short lashes fanning down at the outer corner
    const s = side === 'L' ? 1 : -1;
    [0.62, 0.78, 0.92].forEach((t, k) => {
      const root = curve.getPointAt(Math.min(1, 0.4 + t * 0.6));
      const tip = root.clone().add(new THREE.Vector3(s * (0.0012 + k * 0.0009), -0.0032 - k * 0.0004, 0.0008));
      const b = pos.length / 3;
      pos.push(root.x - s * 0.0005, root.y - 0.0008, root.z + 0.0012, root.x + s * 0.0005, root.y - 0.0008, root.z + 0.0012, tip.x, tip.y, tip.z + 0.0012);
      idx.push(b, b + 1, b + 2);
    });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mat = new MToonMaterial({ color: new THREE.Color(color), shadeColorFactor: new THREE.Color(color), side: THREE.DoubleSide });
  mat.name = 'LowerLash_EYE';
  const m = new THREE.Mesh(g, mat);
  m.name = 'lower-lashes';
  m.frustumCulled = false;
  m.renderOrder = 3;
  return m;
}
