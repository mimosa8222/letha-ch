import * as THREE from 'three';
import { canvasTexture } from './geo';

/**
 * Face features are painted onto equirectangular canvases that wrap the head
 * sphere (u=0.25 is the front, screen-right = character's left). Each layer is
 * drawn in white/greyscale and tinted by its material color, so every layer is
 * a recolorable zone. Proportions follow SPEC §5.2: eye line at mid-face,
 * eye width ≈ 1/5 face width, gap ≈ one eye width, mouth halfway eye→chin.
 */
export interface FaceParams {
  /** 0 closed · 0.5 half-lidded · 1 wide open */
  lid: number;
  /** Per-eye scale [character right (screen left), character left]. */
  eyeScale: [number, number];
  /** Lid tilt: + droops toward the outer corner (sleepy), − sly. */
  lidTilt: number;
  browAngle: number;
  mouth: 'flat' | 'smirk' | 'down';
  blush: number;
}

const W = 1024, H = 512;
const CX = 256; // front of face
const EYE_Y = 270;
const EYE_W = 66;
const EYE_DX = 66;
const MOUTH_Y = 360;
const NOSE_Y = 322;

interface EyeGeom { cx: number; cy: number; w: number; h: number; lidY: (x: number) => number; outer: number }

function eyeGeom(side: -1 | 1, p: FaceParams): EyeGeom {
  const s = p.eyeScale[side < 0 ? 0 : 1];
  const w = EYE_W * s;
  const h = w * 0.92;
  const cx = CX + side * EYE_DX;
  const cy = EYE_Y;
  const top = cy - h / 2;
  const open = THREE.MathUtils.clamp(p.lid, 0, 1);
  const lidBase = top + (1 - open) * h * 0.82;
  const lidY = (x: number) => {
    const u = (x - cx) / (w / 2); // -1..1, +side = outer corner
    const outerness = u * side;
    return lidBase - Math.cos(u * Math.PI * 0.5) * h * 0.12 * open + outerness * p.lidTilt * h * 0.12;
  };
  return { cx, cy, w, h, lidY, outer: side };
}

function eyeClip(ctx: CanvasRenderingContext2D, e: EyeGeom) {
  ctx.beginPath();
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const x = e.cx - e.w / 2 + (e.w * i) / n;
    ctx.lineTo(x, Math.max(e.lidY(x), e.cy - e.h / 2));
  }
  ctx.ellipse(e.cx, e.cy, e.w / 2, e.h / 2, 0, 0, Math.PI, false);
  ctx.closePath();
}

type Layer = 'white' | 'iris' | 'highlight' | 'line' | 'blush';

function drawLayer(layer: Layer, p: FaceParams) {
  return canvasTexture(W, H, (ctx) => {
    ctx.clearRect(0, 0, W, H);
    const eyes = [eyeGeom(-1, p), eyeGeom(1, p)];
    const lidded = p.lid > 0.04;
    for (const e of eyes) {
      if (layer === 'white' && lidded) {
        ctx.save(); eyeClip(ctx, e); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
      }
      if (layer === 'iris' && lidded) {
        ctx.save(); eyeClip(ctx, e); ctx.clip();
        const ix = e.cx, iy = e.cy + e.h * 0.06, rx = e.w * 0.31, ry = e.h * 0.43;
        const g = ctx.createLinearGradient(0, iy - ry, 0, iy + ry);
        g.addColorStop(0, '#3a3a3a'); g.addColorStop(0.55, '#b4b4b4'); g.addColorStop(1, '#ffffff');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(ix, iy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath(); ctx.ellipse(ix, iy - ry * 0.05, rx * 0.42, ry * 0.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.ellipse(ix, iy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
        // eyelid shadow cast onto the eyeball
        const sg = ctx.createLinearGradient(0, e.lidY(e.cx), 0, e.lidY(e.cx) + e.h * 0.25);
        sg.addColorStop(0, 'rgba(60,60,70,0.55)'); sg.addColorStop(1, 'rgba(60,60,70,0)');
        ctx.fillStyle = sg; ctx.fillRect(e.cx - e.w, e.cy - e.h, e.w * 2, e.h * 2);
        ctx.restore();
      }
      if (layer === 'highlight' && lidded) {
        ctx.save(); eyeClip(ctx, e); ctx.clip();
        ctx.fillStyle = '#fff';
        const hy = Math.max(e.lidY(e.cx) + 7, e.cy - e.h * 0.15);
        ctx.beginPath(); ctx.ellipse(e.cx - e.w * 0.1, hy, 6, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(e.cx + e.w * 0.12, e.cy + e.h * 0.28, 2.5, 2.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      if (layer === 'line') {
        // upper lash line: thick, winged at the outer corner
        ctx.fillStyle = '#fff';
        const n = 24, x0 = e.cx - e.w / 2 - 3, x1 = e.cx + e.w / 2 + 3;
        ctx.beginPath();
        for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n; ctx.lineTo(x, e.lidY(x) - 1.5); }
        const ox = e.outer > 0 ? x1 : x0;
        ctx.lineTo(ox + e.outer * 8, e.lidY(ox) - 6);
        for (let i = n; i >= 0; i--) {
          const x = x0 + ((x1 - x0) * i) / n;
          const u = Math.abs((x - e.cx) / (e.w / 2));
          ctx.lineTo(x, e.lidY(x) + 3 + 4 * (1 - u * u));
        }
        ctx.closePath(); ctx.fill();
        // double-eyelid crease
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 4; i <= n - 2; i++) { const x = x0 + ((x1 - x0) * i) / n; ctx.lineTo(x, e.lidY(x) - 9); }
        ctx.stroke();
        // lower lashes (short strokes near the outer half)
        if (lidded) {
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(e.cx, e.cy, e.w / 2 - 2, e.h / 2, 0, e.outer > 0 ? 0.15 : Math.PI * 0.55, e.outer > 0 ? Math.PI * 0.45 : Math.PI * 0.85);
          ctx.stroke();
        }
        // brows
        ctx.lineWidth = 3.5; ctx.lineCap = 'round';
        const by = e.cy - e.h * 0.95;
        const bi = e.cx - e.outer * e.w * 0.4, bo = e.cx + e.outer * e.w * 0.55;
        ctx.beginPath();
        ctx.moveTo(bi, by - p.browAngle * 6);
        ctx.quadraticCurveTo(e.cx, by - 5, bo, by + 3 + p.browAngle * 4);
        ctx.stroke();
      }
    }
    if (layer === 'line') {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(CX + 1, NOSE_Y - 4); ctx.lineTo(CX + 3, NOSE_Y + 2); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
      ctx.beginPath();
      if (p.mouth === 'flat') { ctx.moveTo(CX - 11, MOUTH_Y); ctx.quadraticCurveTo(CX, MOUTH_Y + 1.5, CX + 11, MOUTH_Y); }
      if (p.mouth === 'down') { ctx.moveTo(CX - 11, MOUTH_Y + 2); ctx.quadraticCurveTo(CX, MOUTH_Y - 2, CX + 11, MOUTH_Y + 2); }
      if (p.mouth === 'smirk') { ctx.moveTo(CX - 10, MOUTH_Y); ctx.quadraticCurveTo(CX + 2, MOUTH_Y + 3, CX + 13, MOUTH_Y - 4); }
      ctx.stroke();
    }
    if (layer === 'blush' && p.blush > 0) {
      for (const s of [-1, 1]) {
        const g = ctx.createRadialGradient(CX + s * 82, 308, 2, CX + s * 82, 308, 26);
        g.addColorStop(0, `rgba(255,255,255,${p.blush})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(CX + s * 82, 308, 28, 14, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
  });
}

/** Builds the stacked face layers as meshes sharing the head geometry. */
export function buildFaceLayers(headGeo: THREE.BufferGeometry, p: FaceParams, colors: { iris: string; line: string; blush: string }) {
  const g = new THREE.Group();
  const layers: [Layer, string][] = [
    ['blush', colors.blush],
    ['white', '#ffffff'],
    ['iris', colors.iris],
    ['highlight', '#ffffff'],
    ['line', colors.line],
  ];
  layers.forEach(([layer, color], i) => {
    const mat = new THREE.MeshBasicMaterial({
      map: drawLayer(layer, p),
      color,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1 - i,
      polygonOffsetUnits: -4 - i * 4,
    });
    mat.name = `face_${layer}`;
    const m = new THREE.Mesh(headGeo, mat);
    m.renderOrder = 2 + i;
    g.add(m);
  });
  return g;
}
