import * as THREE from 'three';

/**
 * Turn the base model's sneakers into Letha's saddle shoes by repainting the
 * shoe texture by region. Every shoe triangle is classified by where it sits
 * on the foot (bind pose): sole (bottom), toe & heel (white), saddle (middle,
 * dark). The regions are rasterised into UV space, then each texel is
 * recoloured, keeping the original's light/dark detail (bright lace texels in
 * the saddle stay white, so the laces read).
 */
const SOLE = '#ff0000', WHITE = '#00ff00', SADDLE = '#0000ff';

export function saddleShoeTexture(meshes: THREE.Mesh[], orig: THREE.Texture) {
  const img = orig.image as CanvasImageSource & { width: number; height: number };
  const W = img.width, H = img.height;
  const region = document.createElement('canvas');
  region.width = W; region.height = H;
  const rctx = region.getContext('2d')!;

  for (const mesh of meshes) {
    const g = mesh.geometry;
    const pos = g.getAttribute('position'), uv = g.getAttribute('uv'), idx = g.index;
    if (!uv || !idx) continue;
    // per-foot bounds
    const b = { 1: { zmin: 9, zmax: -9, ymin: 9 }, [-1]: { zmin: 9, zmax: -9, ymin: 9 } } as Record<number, { zmin: number; zmax: number; ymin: number }>;
    const used = new Set<number>(Array.from(idx.array as ArrayLike<number>));
    for (const i of used) {
      const s = pos.getX(i) >= 0 ? 1 : -1, f = b[s];
      f.zmin = Math.min(f.zmin, pos.getZ(i)); f.zmax = Math.max(f.zmax, pos.getZ(i)); f.ymin = Math.min(f.ymin, pos.getY(i));
    }
    const arr = idx.array as ArrayLike<number>;
    for (let t = 0; t < arr.length; t += 3) {
      const ia = arr[t], ib = arr[t + 1], ic = arr[t + 2];
      const cx = (pos.getX(ia) + pos.getX(ib) + pos.getX(ic)) / 3;
      const cy = (pos.getY(ia) + pos.getY(ib) + pos.getY(ic)) / 3;
      const cz = (pos.getZ(ia) + pos.getZ(ib) + pos.getZ(ic)) / 3;
      const f = b[cx >= 0 ? 1 : -1];
      const along = (cz - f.zmin) / Math.max(1e-4, f.zmax - f.zmin); // 0 heel → 1 toe
      const color = cy < f.ymin + 0.018 ? SOLE : along > 0.66 || along < 0.24 ? WHITE : SADDLE;
      rctx.fillStyle = color; rctx.strokeStyle = color; rctx.lineWidth = 2;
      rctx.beginPath();
      for (const i of [ia, ib, ic]) rctx.lineTo(uv.getX(i) * W, uv.getY(i) * H);
      rctx.closePath(); rctx.fill(); rctx.stroke();
    }
  }

  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const octx = out.getContext('2d')!;
  octx.drawImage(img, 0, 0);
  const o = octx.getImageData(0, 0, W, H), r = rctx.getImageData(0, 0, W, H);
  const white = [239, 233, 221], dark = [43, 34, 31], sole = [123, 58, 38];
  for (let i = 0; i < o.data.length; i += 4) {
    const R = r.data[i], G = r.data[i + 1], B = r.data[i + 2];
    if (R < 128 && G < 128 && B < 128) continue; // texel not used by the shoe
    const L = (0.3 * o.data[i] + 0.59 * o.data[i + 1] + 0.11 * o.data[i + 2]) / 255;
    // sole from geometry; toe cap / saddle / heel by texture layout (toe at the
    // bottom of the unwrap, heel at the top, instep + laces in the middle band)
    const px = (i / 4) % W, py = Math.floor(i / 4 / W);
    const u = px / W, v = py / H;
    let c = R > 128 ? sole : v > 0.47 && v < 0.8 ? dark : white;
    let shade = 0.9;
    if (c === dark) {
      if (u > 0.43 && u < 0.57 && v > 0.55 && v < 0.81 && L < 0.35) c = white; // black laces → white laces
    } else shade = 0.82 + 0.18 * Math.min(1, L * 1.4);
    void G; void B;
    o.data[i] = c[0] * shade; o.data[i + 1] = c[1] * shade; o.data[i + 2] = c[2] * shade;
  }
  octx.putImageData(o, 0, 0);
  const t = new THREE.CanvasTexture(out);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = orig.flipY;
  t.wrapS = orig.wrapS; t.wrapT = orig.wrapT;
  return t;
}
