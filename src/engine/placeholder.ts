import * as THREE from 'three';
import { PLACEHOLDER_PARTS } from '../data/catalog';
import type { CharacterId, PartDef } from '../data/types';
import type { Avatar, AvatarPart } from './avatar';
import { disposeObject } from './avatar';
import { buildFaceLayers } from './face';
import { V, canvasTexture, ellipsoid, limb, mesh, revolve, splitByZone, toon, toonSoft, tube } from './geo';

/*
 * PLACEHOLDER mannequin, built in code only so the dress-up system can be
 * developed before the user's VRoid model exists. It is NOT final art and is
 * labelled as such in-scene and in the UI. Units: metres, y up, feet at y=0,
 * character faces +Z (camera). Character's left = +X.
 */

const HEAD_C = V(0, 1.468, 0.005);
const HEAD_R = 0.105;
const HEAD_S = V(0.9, 1, 0.95);
const HAIR_C = HEAD_C.clone().add(V(0, 0.01, -0.008));
const HAIR_S = V(0.95, 1, 0.98);
const BELOW = V(0, 1.0, 0);

type Builder = (zone: (key: string) => string) => THREE.Object3D[];

// ───────────────────────── shared body pieces ─────────────────────────

function headGeometry() {
  const geo = new THREE.SphereGeometry(HEAD_R, 64, 48);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y < 0) {
      // anime jaw: narrow toward a soft pointed chin
      const t = -y / HEAD_R;
      x *= 1 - 0.38 * Math.pow(t, 1.4);
      z *= 1 - 0.12 * t;
      if (z > 0) z += 0.012 * t * t;
    }
    p.setXYZ(i, x * HEAD_S.x, y * HEAD_S.y, z * HEAD_S.z);
  }
  geo.computeVertexNormals();
  return geo;
}

interface ArmPose { shoulder: THREE.Vector3; elbow: THREE.Vector3; wrist: THREE.Vector3 }

function arm(p: ArmPose, mat: THREE.Material) {
  const g = new THREE.Group();
  g.add(limb(p.shoulder, p.elbow, 0.036, 0.029, mat));
  g.add(limb(p.elbow, p.wrist, 0.028, 0.021, mat));
  const sh = ellipsoid([0.04, 0.04, 0.04], mat);
  sh.position.copy(p.shoulder);
  g.add(sh);
  return g;
}

function hand(at: THREE.Vector3, dir: THREE.Vector3, mat: THREE.Material) {
  const h = ellipsoid([0.024, 0.045, 0.013], mat, 0.0018);
  h.position.copy(at);
  h.quaternion.setFromUnitVectors(V(0, -1, 0), dir.clone().normalize());
  return h;
}

function torso(mat: THREE.Material) {
  return mesh(
    revolve(
      [[0.001, 0.8], [0.11, 0.805], [0.145, 0.84], [0.155, 0.89], [0.14, 0.95], [0.118, 1.01], [0.122, 1.08],
       [0.14, 1.15], [0.15, 1.21], [0.145, 1.26], [0.12, 1.295], [0.07, 1.315], [0.035, 1.32], [0.001, 1.322]],
      { zScale: 0.68 },
    ),
    mat,
  );
}

function legs(mat: THREE.Material) {
  const out: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const geo = revolve(
      [[0.001, 0.06], [0.03, 0.065], [0.031, 0.09], [0.036, 0.15], [0.046, 0.3], [0.047, 0.35], [0.043, 0.43],
       [0.042, 0.48], [0.055, 0.6], [0.066, 0.75], [0.07, 0.83], [0.001, 0.86]],
      { zScale: 0.95, seg: 40 },
    );
    geo.translate(s * 0.075, 0, 0);
    out.push(mesh(geo, mat));
    const foot = ellipsoid([0.033, 0.03, 0.09], mat);
    foot.position.set(s * 0.075, 0.03, 0.04);
    out.push(foot);
  }
  return out;
}

/** Reusable leg-hugging tube between y0..y1 (socks, boots). */
function legSleeve(s: number, prof: [number, number][]) {
  const geo = revolve(prof, { zScale: 0.95, seg: 48 });
  geo.translate(s * 0.075, 0, 0);
  return geo;
}

function footShape(s: number, scale = 1) {
  const geo = new THREE.SphereGeometry(1, 48, 32);
  geo.scale(0.04 * scale, 0.042 * scale, 0.11 * scale);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), z = p.getZ(i);
    p.setY(i, Math.max(y, -0.022) + 0.032);
    p.setZ(i, z + 0.045);
    // toe box lower than the instep
    if (z > 0) p.setY(i, p.getY(i) - 0.012 * (z / 0.11));
  }
  geo.translate(s * 0.075, 0, 0);
  geo.computeVertexNormals();
  return geo;
}

// ───────────────────────── Letha ─────────────────────────

const LETHA_ARMS = {
  right: { shoulder: V(-0.165, 1.283, 0), elbow: V(-0.205, 1.05, -0.03), wrist: V(-0.222, 0.84, -0.005) },
  left: { shoulder: V(0.165, 1.283, 0), elbow: V(0.205, 1.05, -0.02), wrist: V(0.218, 0.84, 0.075) },
};

/** Point on the bob-hair shell, in three's sphere convention (phi=π/2 is front). */
function hairPoint(phi: number, theta: number, r: number, c: THREE.Vector3, s: THREE.Vector3) {
  return V(-r * Math.cos(phi) * Math.sin(theta) * s.x + c.x, r * Math.cos(theta) * s.y + c.y, r * Math.sin(phi) * Math.sin(theta) * s.z + c.z);
}

/** Grid patch on a deformed sphere: f(u,v) → point. Used for hair strands. */
function patch(f: (u: number, v: number) => THREE.Vector3, nu: number, nv: number, inside: THREE.Vector3 = HAIR_C) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= nu; i++)
    for (let j = 0; j <= nv; j++) {
      const p = f(i / nu, j / nv);
      pos.push(p.x, p.y, p.z);
      uv.push(i / nu, 1 - j / nv);
    }
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j, b = (i + 1) * (nv + 1) + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // orient normals away from `inside` so outlines and lighting are correct
  const P = g.attributes.position, N = g.attributes.normal;
  let score = 0;
  for (let i = 0; i < P.count; i++)
    score += (P.getX(i) - inside.x) * N.getX(i) + (P.getY(i) - inside.y) * N.getY(i) + (P.getZ(i) - inside.z) * N.getZ(i);
  if (score < 0) {
    for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return g;
}


function bobHair(mat: THREE.Material) {
  const out: THREE.Object3D[] = [];
  const R = 0.118;
  const open = 0.98; // front opening half-angle
  const thetaEnd = 0.75 * Math.PI;
  // back + sides shell with waves and an outward flip at the ends
  const shell = patch((u, v) => {
    const phi = Math.PI / 2 + open + u * (Math.PI * 2 - 2 * open);
    const theta = v * thetaEnd;
    const wave = 1 + 0.03 * Math.sin(phi * 9) * v * v;
    const flip = v > 0.78 ? Math.pow((v - 0.78) / 0.22, 2) * 0.42 : 0;
    const p = hairPoint(phi, theta, R * wave * (1 + flip), HAIR_C, HAIR_S);
    p.y += flip * 0.03; // ends curl up and out
    return p;
  }, 96, 36);
  out.push(mesh(shell, mat, 0.0024));
  // crown cap over the forehead
  const cap = patch((u, v) => hairPoint(u * Math.PI * 2, v * 0.3 * Math.PI, R, HAIR_C, HAIR_S), 64, 12);
  out.push(mesh(cap, mat, 0.0024));
  // short uneven bangs: tapered strips ending above the brows
  const lens = [0.355, 0.39, 0.345, 0.4, 0.36, 0.385, 0.35, 0.395, 0.34];
  const n = lens.length;
  lens.forEach((len, k) => {
    const c = Math.PI / 2 - 1.0 + (2.0 * (k + 0.5)) / n;
    const w = 1.0 / n + 0.03;
    const strip = patch((u, v) => {
      const theta = 0.2 * Math.PI + v * (len - 0.2) * Math.PI;
      const phi = c + (u - 0.5) * 2 * w * (1 - 0.85 * Math.pow(v, 2.5));
      return hairPoint(phi, theta, R * (1.005 + 0.02 * v), HAIR_C, HAIR_S);
    }, 8, 12);
    out.push(mesh(strip, mat, 0.002));
  });
  // cheek locks framing the face (part of the bob, not asymmetric side hair)
  for (const s of [-1, 1]) {
    const c = Math.PI / 2 + s * (open + 0.06);
    const lock = patch((u, v) => {
      const theta = 0.3 * Math.PI + v * 0.43 * Math.PI;
      const phi = c + (u - 0.5) * 0.3 * (1 - 0.5 * v);
      const flip = v > 0.8 ? Math.pow((v - 0.8) / 0.2, 2) * 0.3 : 0;
      return hairPoint(phi, theta, R * (1.01 + flip), HAIR_C, HAIR_S);
    }, 6, 16);
    out.push(mesh(lock, mat, 0.002));
  }
  return out;
}

function bobbyPins(mat: THREE.Material) {
  // two pins crossed in an X on her left temple
  const g = new THREE.Group();
  const at = hairPoint(Math.PI / 2 + 0.75, 0.33 * Math.PI, 0.121, HAIR_C, HAIR_S);
  g.position.copy(at);
  g.lookAt(at.clone().add(at.clone().sub(HAIR_C).normalize()));
  for (const r of [0.6, -0.6]) {
    const pin = mesh(new THREE.BoxGeometry(0.004, 0.042, 0.003), mat, 0.0008);
    pin.rotation.z = r;
    g.add(pin);
  }
  return g;
}

function dress(zone: (k: string) => string) {
  const out: THREE.Object3D[] = [];
  const m = toon('dress', zone('dress'));
  const skirtMat = toon('dress', zone('dress'), { side: THREE.DoubleSide });
  out.push(mesh(revolve(
    [[0.128, 0.99], [0.13, 1.05], [0.146, 1.14], [0.157, 1.21], [0.153, 1.262], [0.13, 1.3], [0.085, 1.325], [0.042, 1.335]],
    { zScale: 0.7 }), m));
  const pleat = (a: number, t: number) => 1 + 0.07 * t * Math.abs(((a * 14) / Math.PI) % 2 - 1);
  out.push(mesh(revolve(
    [[0.127, 0.985], [0.15, 0.93], [0.2, 0.8], [0.24, 0.64], [0.262, 0.5]],
    { zScale: 0.8, seg: 168, mod: pleat }), skirtMat));
  out.push(mesh(revolve([[0.128, 0.972], [0.133, 0.982], [0.133, 1.022], [0.129, 1.035]], { zScale: 0.7 }),
    toon('waistband', zone('waistband'))));
  // puff sleeves gathered at a cuff
  for (const s of [-1, 1]) {
    const puff = ellipsoid([0.062, 0.058, 0.058], m, 0.0022);
    puff.position.set(s * 0.178, 1.245, 0);
    puff.rotation.z = s * 0.25;
    out.push(puff);
    const cuff = mesh(new THREE.TorusGeometry(0.039, 0.007, 10, 32), m, 0.0015);
    cuff.position.set(s * 0.188, 1.19, -0.008);
    cuff.rotation.set(Math.PI / 2, 0, s * 0.18);
    out.push(cuff);
  }
  return out;
}

// Dial collar ─ a Peter Pan collar that drapes over the shoulder line.
const COLLAR = { rIn: 0.05, rOut: 0.158, gap: 0.07, lobe: 0.75, zs: 0.72 };

function collarPoint(a: number, s: number, extra = 0, lift = 0) {
  const { rIn, rOut, gap, lobe, zs } = COLLAR;
  const d = Math.min(a, Math.PI * 2 - a) - gap; // distance from the front opening
  const k = d < lobe ? Math.sqrt(Math.max(0, 1 - ((lobe - d) / lobe) ** 2)) : 1;
  const ro = rIn + (rOut + extra - rIn) * (0.12 + 0.88 * k);
  const r = rIn + (ro - rIn) * s;
  // follows the shoulder slope: steeper over chest/back than over the shoulder
  const drop = (0.048 + 0.032 * Math.abs(Math.cos(a))) * Math.pow(s, 1.25);
  const y = 1.348 - drop + lift;
  return V(Math.sin(a) * r, y, Math.cos(a) * r * zs + 0.004);
}

function collarSurface(extra: number, lift: number) {
  const { gap } = COLLAR;
  return patch((u, v) => collarPoint(gap + u * (Math.PI * 2 - 2 * gap), v, extra, lift), 220, 14, BELOW);
}

/** Edge thickness: a strip hanging down from the outer edge. */
function collarRim(extra: number, lift: number, depth: number) {
  const { gap } = COLLAR;
  return patch((u, v) => {
    const p = collarPoint(gap + u * (Math.PI * 2 - 2 * gap), 1, extra, lift);
    p.y -= v * depth;
    return p;
  }, 220, 1, V(0, 1.3, 0));
}

const DIAL_FREQS = [55, 64, 80, 100, 124, 160];
// Printed positions spaced evenly by label so the numbers stay legible on a phone.
const dialA = (f: number) => {
  const i = DIAL_FREQS.indexOf(f);
  if (i >= 0) return 0.3 + i * 0.2;
  // minor ticks: interpolate between neighbouring labels
  for (let k = 0; k < DIAL_FREQS.length - 1; k++)
    if (f > DIAL_FREQS[k] && f < DIAL_FREQS[k + 1])
      return 0.3 + (k + (f - DIAL_FREQS[k]) / (DIAL_FREQS[k + 1] - DIAL_FREQS[k])) * 0.2;
  return f < 55 ? 0.24 : 1.36;
};

function collarTextures() {
  const Wd = 4096, Hd = 640;
  const ax = (a: number) => ((a - COLLAR.gap) / (Math.PI * 2 - 2 * COLLAR.gap)) * Wd;
  const tear = 2 * Math.PI - 0.95;
  const cotton = canvasTexture(Wd, Hd, (ctx) => {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, Wd, Hd);
    // soft fold shading toward the outer edge
    const g = ctx.createLinearGradient(0, 0, 0, Hd);
    g.addColorStop(0, 'rgba(0,0,0,0.10)'); g.addColorStop(0.25, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.06)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, Wd, Hd);
    // stitch line just inside the edge
    ctx.strokeStyle = 'rgba(90,90,90,0.75)'; ctx.lineWidth = 5; ctx.setLineDash([22, 16]);
    ctx.beginPath(); ctx.moveTo(0, Hd * 0.86); ctx.lineTo(Wd, Hd * 0.86); ctx.stroke();
    ctx.setLineDash([]);
    // small frayed tear (the needle sits in it)
    const tx = ax(tear), ty = Hd * 0.6;
    ctx.strokeStyle = '#555'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(tx - 50, ty - 18); ctx.lineTo(tx - 15, ty + 4); ctx.lineTo(tx + 10, ty - 6); ctx.lineTo(tx + 48, ty + 16); ctx.stroke();
    ctx.lineWidth = 2.5;
    for (let i = -40; i <= 40; i += 9) {
      ctx.beginPath(); ctx.moveTo(tx + i, ty + (i % 2 ? -4 : 4)); ctx.lineTo(tx + i + 4, ty + (i % 2 ? -22 : 24)); ctx.stroke();
    }
  });
  const ticks = canvasTexture(Wd, Hd, (ctx) => {
    ctx.clearRect(0, 0, Wd, Hd);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
    const base = Hd * 0.4;
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(ax(dialA(52)), base); ctx.lineTo(ax(dialA(168)), base); ctx.stroke();
    for (let f = 55; f <= 160; f += 5) {
      const x = ax(dialA(f));
      ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(x, base + 26); ctx.stroke();
    }
    ctx.font = 'bold 62px "Courier New", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const f of DIAL_FREQS) {
      const x = ax(dialA(f));
      ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(x, base + 44); ctx.stroke();
      ctx.fillText(String(f), x, base + 56);
    }
  });
  const conelrad = canvasTexture(Wd, Hd, (ctx) => {
    ctx.clearRect(0, 0, Wd, Hd);
    ctx.fillStyle = '#fff';
    for (const f of [64, 124]) {
      const x = ax(dialA(f)), y = Hd * 0.4 - 12;
      ctx.beginPath(); ctx.moveTo(x - 34, y - 66); ctx.lineTo(x + 34, y - 66); ctx.lineTo(x, y); ctx.closePath(); ctx.fill();
    }
  });
  return { cotton, ticks, conelrad };
}

function dialCollar(zone: (k: string) => string) {
  const out: THREE.Object3D[] = [];
  const tx = collarTextures();
  const cotton = toon('cotton', zone('cotton'), { map: tx.cotton, side: THREE.DoubleSide });
  const top = mesh(collarSurface(0, 0), cotton, 0.0018);
  out.push(top);
  out.push(mesh(collarRim(0, 0, 0.011), toon('cotton', zone('cotton'), { side: THREE.DoubleSide }), 0.0015));
  // underside so the collar has real thickness from low angles
  out.push(mesh(collarSurface(0, -0.011), toon('cotton', zone('cotton'), { side: THREE.DoubleSide }), 0));
  const overlay = (map: THREE.Texture, color: string, name: string, i: number) => {
    const mat = new THREE.MeshBasicMaterial({ map, color, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 - i, polygonOffsetUnits: -8 - i * 4 });
    mat.name = name;
    const m = new THREE.Mesh(top.geometry, mat);
    m.renderOrder = 3 + i;
    return m;
  };
  out.push(overlay(tx.ticks, zone('dial'), 'dial', 0));
  out.push(overlay(tx.conelrad, '#C8221E', 'conelrad', 1));
  // red-thread needle stuck in the tear on her right side
  const tear = 2 * Math.PI - 0.95;
  const p0 = collarPoint(tear, 0.62, 0, 0.002);
  const needle = mesh(new THREE.CylinderGeometry(0.0012, 0.0005, 0.05, 8), new THREE.MeshStandardMaterial({ color: '#c9ccd2', metalness: 0.9, roughness: 0.25 }), 0.0006);
  needle.position.copy(p0).add(V(-0.004, 0.006, 0.006));
  needle.rotation.set(0.9, 0, 0.9);
  out.push(needle);
  const eye = needle.position.clone().add(V(0.013, 0.012, 0.016));
  out.push(mesh(tube([eye, eye.clone().add(V(0.008, -0.006, 0.01)), p0.clone().add(V(0.012, -0.004, 0.012)), p0.clone().add(V(0.005, 0.0005, 0.004))], 0.0011, 0.0011, 24, 6),
    toon('thread', '#B3201C'), 0));
  return out;
}

function organdy(zone: (k: string) => string) {
  const mat = new THREE.MeshToonMaterial({ color: zone('organdy'), transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false });
  mat.name = 'organdy';
  const s = new THREE.Mesh(collarSurface(0.014, 0.0045), mat);
  s.renderOrder = 6;
  const rim = new THREE.Mesh(collarRim(0.014, 0.0045, 0.012), mat);
  rim.renderOrder = 6;
  return [s, rim];
}

function crewSocks(zone: (k: string) => string, unrest: boolean) {
  const out: THREE.Object3D[] = [];
  // top of the sock at ~1/3 up the calf (ankle 0.07 → knee 0.47 ⇒ ≈0.205)
  const body: [number, number][] = [[0.034, 0.055], [0.035, 0.1], [0.039, 0.15], [0.042, 0.19], [0.0425, 0.205]];
  const cuff: [number, number][] = [[0.043, 0.178], [0.048, 0.186], [0.0495, 0.2], [0.047, 0.212], [0.043, 0.214]];
  let baseMat: THREE.Material, motifMap: THREE.Texture | null = null;
  if (unrest) {
    const mesh_ = canvasTexture(512, 256, (ctx) => {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 512, 256);
      ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 2;
      for (let i = 0; i < 512; i += 10) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 128, 256); ctx.stroke(); ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i - 128, 256); ctx.stroke(); }
    });
    mesh_.wrapS = THREE.RepeatWrapping;
    baseMat = toon('mesh', zone('mesh'), { map: mesh_ });
    motifMap = canvasTexture(512, 256, (ctx) => {
      ctx.clearRect(0, 0, 512, 256); ctx.fillStyle = '#fff';
      // vertical motif: paired bars with notches (element extraction, not a copy)
      for (const x of [40, 170, 300, 430]) {
        ctx.fillRect(x, 0, 14, 256); ctx.fillRect(x + 24, 0, 6, 256);
        for (let y = 20; y < 256; y += 60) ctx.fillRect(x - 6, y, 42, 10);
      }
    });
  } else baseMat = toon('sock', zone('sock'));
  for (const s of [-1, 1]) {
    out.push(mesh(legSleeve(s, body), baseMat, 0.0016));
    out.push(mesh(legSleeve(s, cuff), unrest ? baseMat : toon('sock', zone('sock')), 0.0016));
    const foot = new THREE.Mesh(footShape(s, 0.93), baseMat);
    out.push(foot);
    if (motifMap) {
      const mm = new THREE.MeshBasicMaterial({ map: motifMap, color: zone('motif'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 });
      mm.name = 'motif';
      out.push(new THREE.Mesh(legSleeve(s, body), mm));
    }
  }
  return out;
}

function saddleShoes(zone: (k: string) => string) {
  const out: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const parts = splitByZone(footShape(s), (c) => {
      if (c.y < 0.016) return 'sole';
      if (c.z > 0.0 && c.z < 0.095) return 'saddle';
      return 'upper';
    });
    for (const [k, g] of parts) out.push(mesh(g, toon(k, zone(k)), 0.0018));
    // thick sole slab
    const sole = new THREE.CylinderGeometry(1, 1, 0.012, 40);
    sole.scale(0.042, 1, 0.113);
    sole.translate(s * 0.075, 0.006, 0.045);
    out.push(mesh(sole, toon('sole', zone('sole')), 0.0015));
    // laces across the saddle
    for (let i = 0; i < 4; i++) {
      const z = 0.03 + i * 0.016;
      const lace = mesh(new THREE.BoxGeometry(0.03, 0.003, 0.004), toon('lace', zone('lace')), 0.0007);
      lace.position.set(s * 0.075, 0.072 - i * 0.0045, z);
      lace.rotation.x = -0.35;
      out.push(lace);
    }
  }
  return out;
}

function ouija(zone: (k: string) => string) {
  const g = new THREE.Group();
  const tex = canvasTexture(1024, 700, (ctx) => {
    ctx.fillStyle = '#c8c8c8'; ctx.fillRect(0, 0, 1024, 700);
    for (let i = 0; i < 90; i++) {
      ctx.strokeStyle = `rgba(80,80,80,${0.05 + Math.random() * 0.12})`; ctx.lineWidth = 1 + Math.random() * 3;
      const y = Math.random() * 700;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(300, y + 20, 700, y - 20, 1024, y + Math.random() * 10); ctx.stroke();
    }
    ctx.fillStyle = '#222'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 54px Georgia, serif';
    ctx.fillText('YES', 150, 80); ctx.fillText('NO', 874, 80);
    const row = (letters: string, cy: number, rad: number) => {
      [...letters].forEach((ch, i) => {
        const t = (i + 0.5) / letters.length;
        const a = Math.PI * (1.15 + 0.7 * t);
        const x = 512 + Math.cos(a) * rad, y = cy + Math.sin(a) * rad * 0.42 + 300;
        // P·H·I·C·A are worn faint
        ctx.globalAlpha = 'PHICA'.includes(ch) ? 0.22 : 1;
        ctx.save(); ctx.translate(x, y); ctx.rotate((a + Math.PI / 2) * 0.5); ctx.fillText(ch, 0, 0); ctx.restore();
      });
      ctx.globalAlpha = 1;
    };
    ctx.font = 'bold 64px Georgia, serif';
    row('ABCDEFGHIJKLM', 40, 470);
    row('NOPQRSTUVWXYZ', 160, 420);
    ctx.font = 'bold 50px Georgia, serif';
    ctx.fillText('1 2 3 4 5 6 7 8 9 0', 512, 520);
    ctx.fillText('GOOD BYE', 512, 625);
  });
  const board = mesh(new THREE.BoxGeometry(0.33, 0.225, 0.011), [
    toon('wood', zone('wood')), toon('wood', zone('wood')), toon('wood', zone('wood')), toon('wood', zone('wood')),
    toon('wood', zone('wood'), { map: tex }), toon('wood', zone('wood')),
  ] as unknown as THREE.Material, 0.0018);
  g.add(board);
  // planchette (teardrop with a pink glass window), resting on the board
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.045);
  shape.bezierCurveTo(0.04, 0.02, 0.035, -0.035, 0, -0.035);
  shape.bezierCurveTo(-0.035, -0.035, -0.04, 0.02, 0, 0.045);
  const hole = new THREE.Path();
  hole.absarc(0, 0.0, 0.013, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const pl = mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 2 }), toon('wood', zone('wood')), 0.0012);
  pl.position.set(0.07, -0.05, 0.007);
  pl.rotation.z = -0.4;
  g.add(pl);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.013, 24), new THREE.MeshToonMaterial({ color: zone('glass'), transparent: true, opacity: 0.7, name: 'glass' }));
  glass.position.set(0.07, -0.05, 0.011);
  g.add(glass);
  // held against her left hip, turned so the face reads from the front
  g.position.set(0.262, 0.835, 0.07);
  g.rotation.set(0, 0.95, -0.08);
  return g;
}

// Radio + strap + earphone: all routed through anchor points so they connect.
const RADIO = { pos: V(-0.178, 0.9, 0.068), rotY: -0.62 };
const RADIO_JACK = V(-0.158, 0.958, 0.087);
const RADIO_LUG_F = V(-0.2, 0.958, 0.04);
const RADIO_LUG_B = V(-0.215, 0.95, 0.0);

function radio(zone: (k: string) => string) {
  const out: THREE.Object3D[] = [];
  const leatherTex = canvasTexture(256, 384, (ctx) => {
    ctx.fillStyle = '#d0d0d0'; ctx.fillRect(0, 0, 256, 384);
    ctx.fillStyle = 'rgba(40,40,40,0.55)';
    for (let y = 30; y < 200; y += 16) for (let x = 24 + ((y / 16) % 2) * 8; x < 236; x += 16) { ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#efe7d0'; ctx.fillRect(28, 236, 200, 108);
    ctx.fillStyle = '#333'; ctx.font = 'bold 26px monospace'; ctx.textAlign = 'center';
    ctx.fillText('55  80  124 160', 128, 280);
    ctx.fillStyle = '#b22'; ctx.fillRect(126, 252, 4, 80);
    ctx.strokeStyle = 'rgba(60,60,60,0.8)'; ctx.lineWidth = 3; ctx.setLineDash([8, 6]);
    ctx.strokeRect(10, 10, 236, 364);
  });
  const leather = toon('leather', zone('leather'));
  const box = mesh(new THREE.BoxGeometry(0.078, 0.112, 0.036), [leather, leather, leather, leather, toon('leather', zone('leather'), { map: leatherTex }), leather] as unknown as THREE.Material, 0.0018);
  box.position.copy(RADIO.pos);
  box.rotation.y = RADIO.rotY;
  out.push(box);
  const knob = mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.008, 20), toon('knob', '#E9E1CC'), 0.0008);
  knob.position.copy(RADIO.pos).add(V(-0.03, 0.04, -0.02));
  knob.rotation.z = Math.PI / 2;
  out.push(knob);
  // strap: radio lug → across chest → over left shoulder → down the back → radio
  const strap = [
    RADIO_LUG_F, V(-0.15, 1.0, 0.1), V(-0.09, 1.07, 0.112), V(-0.02, 1.15, 0.117), V(0.05, 1.22, 0.112),
    V(0.105, 1.275, 0.08), V(0.135, 1.315, 0.015), V(0.12, 1.3, -0.065), V(0.06, 1.2, -0.11),
    V(-0.05, 1.08, -0.105), V(-0.15, 0.98, -0.075), RADIO_LUG_B,
  ];
  const sg = tube(strap, 0.0055, 0.0055, 160, 8);
  sg.scale(1, 1, 1);
  out.push(mesh(sg, toon('strap', zone('strap')), 0.0012));
  return out;
}

function earphone(zone: (k: string) => string) {
  const out: THREE.Object3D[] = [];
  const ivory = toon('ivory', zone('ivory'));
  // bulky crystal earphone in her right ear, outside the hair
  const ear = V(-0.122, 1.452, 0.012);
  const body = mesh(new THREE.CylinderGeometry(0.013, 0.015, 0.03, 24), ivory, 0.0015);
  body.position.copy(ear);
  body.rotation.z = Math.PI / 2 + 0.25;
  out.push(body);
  const bud = ellipsoid([0.009, 0.009, 0.009], ivory, 0.001);
  bud.position.copy(ear).add(V(0.014, 0.004, 0));
  out.push(bud);
  // cord: ear → down the neck → over the collar → down her side → radio jack
  const cord = [
    ear.clone().add(V(-0.004, -0.014, 0.004)), V(-0.11, 1.405, 0.03), V(-0.075, 1.36, 0.04), V(-0.06, 1.338, 0.06),
    V(-0.1, 1.322, 0.085), V(-0.135, 1.27, 0.095), V(-0.152, 1.17, 0.095), V(-0.16, 1.06, 0.1),
    V(-0.16, 0.99, 0.097), RADIO_JACK.clone().add(V(0, 0.016, 0)),
  ];
  out.push(mesh(tube(cord, 0.0016, 0.0016, 140, 6), toon('cord', zone('cord')), 0.0006));
  const plug = mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.016, 12), toon('cord', zone('cord')), 0.0006);
  plug.position.copy(RADIO_JACK).add(V(0, 0.008, 0));
  out.push(plug);
  return out;
}

function headband(zone: (k: string) => string) {
  const g = new THREE.TorusGeometry(0.118, 0.008, 10, 64, Math.PI * 1.25);
  const m = mesh(g, toon('band', zone('band')), 0.0016);
  m.position.copy(HAIR_C).add(V(0, 0.02, -0.012));
  m.rotation.set(-0.35, 0, -Math.PI * 0.125);
  m.scale.set(0.96, 1.02, 1);
  return [m];
}

function nightcap(zone: (k: string) => string) {
  const geo = revolve([[0.128, 0], [0.126, 0.04], [0.11, 0.09], [0.06, 0.14], [0.001, 0.16]], { zScale: 1 });
  const m = mesh(geo, toon('cap', zone('cap'), { side: THREE.DoubleSide }), 0.002);
  m.position.copy(HAIR_C).add(V(0, 0.03, -0.015));
  m.rotation.x = -0.35;
  const pom = ellipsoid([0.02, 0.02, 0.02], toon('cap', zone('cap')));
  pom.position.set(0, 0.165, 0);
  m.add(pom);
  return [m];
}

function nightgown(zone: (k: string) => string) {
  const m = toon('gown', zone('gown'), { side: THREE.DoubleSide });
  const out: THREE.Object3D[] = [];
  out.push(mesh(revolve([[0.27, 0.32], [0.23, 0.6], [0.17, 0.9], [0.15, 1.0], [0.155, 1.18], [0.158, 1.22], [0.13, 1.3], [0.06, 1.33]],
    { zScale: 0.78, seg: 96, mod: (a, t) => 1 + 0.025 * (1 - t) * Math.sin(a * 18) }), m));
  for (const s of [-1, 1]) {
    const sl = ellipsoid([0.055, 0.05, 0.052], m);
    sl.position.set(s * 0.176, 1.245, 0);
    out.push(sl);
  }
  return out;
}

function bracelet(zone: (k: string) => string) {
  const m = mesh(new THREE.TorusGeometry(0.026, 0.006, 8, 24), toon('beads', zone('beads')), 0.0012);
  m.position.copy(LETHA_ARMS.left.wrist).add(V(0, 0.01, 0));
  m.rotation.x = Math.PI / 2 - 0.4;
  return [m];
}

// ───────────────────────── Phicia ─────────────────────────

const PHICIA_ARMS = {
  // signature pose: right hand covering the mouth
  right: { shoulder: V(-0.165, 1.283, 0), elbow: V(-0.13, 1.12, 0.14), wrist: V(-0.045, 1.33, 0.13) },
  left: { shoulder: V(0.165, 1.283, 0), elbow: V(0.205, 1.05, -0.02), wrist: V(0.215, 0.835, 0.0) },
};

function phiciaHair(mat: THREE.Material) {
  const out: THREE.Object3D[] = [];
  const R = 0.12;
  const open = 0.95;
  out.push(mesh(patch((u, v) => {
    const phi = Math.PI / 2 + open + u * (Math.PI * 2 - 2 * open);
    return hairPoint(phi, v * 0.8 * Math.PI, R * (1 + 0.02 * Math.sin(phi * 13) * v), HAIR_C, HAIR_S);
  }, 96, 30), mat, 0.0024));
  out.push(mesh(patch((u, v) => hairPoint(u * Math.PI * 2, v * 0.3 * Math.PI, R, HAIR_C, HAIR_S), 64, 12), mat, 0.0024));
  // back length down to the shoulder blades
  out.push(mesh(revolve([[0.105, 1.42], [0.115, 1.34], [0.13, 1.25], [0.12, 1.16]],
    { zScale: 0.75, phiStart: Math.PI / 2 + 0.6, phiLength: Math.PI - 1.2, seg: 40, mod: (a, t) => 1 + 0.06 * t * Math.abs(Math.sin(a * 9)) }), mat, 0.002));
  // long fringe with separate strands across the eyes
  const fr = [0.43, 0.5, 0.46, 0.55, 0.44, 0.52, 0.47];
  fr.forEach((len, k) => {
    const c = Math.PI / 2 - 0.85 + (1.7 * (k + 0.5)) / fr.length;
    out.push(mesh(patch((u, v) => {
      const theta = 0.2 * Math.PI + v * (len - 0.2) * Math.PI;
      const phi = c + (u - 0.5) * 0.3 * (1 - 0.9 * Math.pow(v, 2)) + 0.05 * Math.sin(k + v * 3) * v;
      return hairPoint(phi, theta, R * (1.005 + 0.06 * v * v), HAIR_C, HAIR_S);
    }, 6, 16), mat, 0.0018));
  });
  // a long lock on each side of the face, down to the chest
  for (const s of [-1, 1]) {
    const pts = [V(s * 0.095, 1.5, 0.05), V(s * 0.108, 1.42, 0.065), V(s * 0.1, 1.33, 0.08), V(s * 0.09, 1.22, 0.1), V(s * 0.08, 1.12, 0.11)];
    const g = tube(pts, 0.022, 0.006, 48, 10);
    g.scale(1, 1, 1);
    out.push(mesh(g, mat, 0.0018));
  }
  return out;
}

function laceCap(zone: (k: string) => string) {
  const out: THREE.Object3D[] = [];
  const lace = toon('lace', zone('lace'), { side: THREE.DoubleSide });
  const cap = new THREE.Group();
  cap.position.copy(HAIR_C).add(V(0, 0.075, -0.045));
  cap.rotation.x = -0.6;
  const disc = mesh(revolve([[0.001, 0.012], [0.06, 0.01], [0.1, 0.0], [0.112, -0.006]],
    { seg: 120, mod: (a, t) => 1 + 0.07 * t * t * Math.abs(Math.sin(a * 10)) }), lace, 0.0016);
  cap.add(disc);
  const frill = mesh(new THREE.TorusGeometry(0.11, 0.008, 8, 120), lace, 0.0012);
  frill.rotation.x = Math.PI / 2;
  frill.position.y = -0.006;
  cap.add(frill);
  out.push(cap);
  // curled dark horns growing out of the cap
  const horn = toon('horn', zone('horn'));
  for (const s of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24, a = t * Math.PI * 1.6;
      const r = 0.05 * (1 - 0.55 * t);
      pts.push(V(s * (0.075 + 0.03 * t + r * (1 - Math.cos(a)) * 0.5), 0.02 + Math.sin(a) * r, -r * (1 - Math.cos(a)) * 0.8));
    }
    const g = tube(pts, 0.016, 0.0025, 60, 12);
    const m = mesh(g, horn, 0.0016);
    m.position.copy(HAIR_C).add(V(0, 0.07, -0.01));
    out.push(m);
  }
  return out;
}

function phiciaShirt(zone: (k: string) => string) {
  const m = toon('shirt', zone('shirt'));
  const out: THREE.Object3D[] = [];
  out.push(mesh(revolve([[0.128, 0.95], [0.126, 1.02], [0.146, 1.14], [0.157, 1.21], [0.153, 1.262], [0.13, 1.3], [0.08, 1.326], [0.04, 1.335]], { zScale: 0.7 }), m));
  for (const a of [PHICIA_ARMS.right, PHICIA_ARMS.left]) {
    out.push(limb(a.shoulder, a.elbow, 0.044, 0.036, m));
    out.push(limb(a.elbow, a.wrist, 0.035, 0.028, m));
    const sh = ellipsoid([0.047, 0.047, 0.047], m);
    sh.position.copy(a.shoulder);
    out.push(sh);
  }
  return out;
}

function shirtCollar(zone: (k: string) => string) {
  const out: THREE.Object3D[] = [];
  const cm = toon('collar', zone('collar'), { side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0); sh.lineTo(s * 0.06, 0.012); sh.lineTo(s * 0.03, -0.07); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.004, bevelEnabled: false });
    const m = mesh(g, cm, 0.0014);
    m.position.set(s * 0.006, 1.335, 0.038);
    m.rotation.x = -0.75;
    out.push(m);
  }
  const band = mesh(revolve([[0.044, 1.31], [0.043, 1.35]], { zScale: 0.85, phiStart: 0.15, phiLength: Math.PI * 2 - 0.3 }), cm, 0.0012);
  out.push(band);
  const tie = toon('tie', zone('tie'));
  const knot = ellipsoid([0.014, 0.012, 0.008], tie, 0.0012);
  knot.position.set(0, 1.315, 0.068);
  out.push(knot);
  const bl = new THREE.Shape();
  bl.moveTo(-0.008, 0); bl.lineTo(0.008, 0); bl.lineTo(0.022, -0.17); bl.lineTo(0, -0.19); bl.lineTo(-0.022, -0.17); bl.closePath();
  const blade = mesh(new THREE.ExtrudeGeometry(bl, { depth: 0.003, bevelEnabled: false }), tie, 0.0012);
  blade.position.set(0, 1.307, 0.071);
  blade.rotation.x = -0.32;
  out.push(blade);
  return out;
}

function frillCollar(zone: (k: string) => string) {
  const m = toon('frill', zone('frill'), { side: THREE.DoubleSide });
  return [mesh(revolve([[0.045, 1.35], [0.07, 1.33], [0.11, 1.295]], { zScale: 0.75, seg: 180, mod: (a, t) => 1 + 0.09 * t * Math.sin(a * 22) }), m, 0.0014)];
}

function cape(zone: (k: string) => string, long: boolean) {
  const m = toon('cape', zone('cape'), { side: THREE.DoubleSide });
  const prof: [number, number][] = long
    ? [[0.05, 1.35], [0.15, 1.3], [0.22, 1.2], [0.25, 0.9], [0.3, 0.5], [0.34, 0.15]]
    : [[0.05, 1.35], [0.15, 1.3], [0.215, 1.2], [0.235, 1.1]];
  return [mesh(revolve(prof, { zScale: 0.75, seg: 120, phiStart: 0.32, phiLength: Math.PI * 2 - 0.64, mod: (a, t) => 1 + 0.03 * t * Math.sin(a * 7) }), m, 0.002)];
}

function longSkirt(zone: (k: string) => string) {
  const m = toon('skirt', zone('skirt'), { side: THREE.DoubleSide });
  return [mesh(revolve([[0.127, 0.96], [0.16, 0.85], [0.22, 0.55], [0.27, 0.2], [0.29, 0.12]], { zScale: 0.82, seg: 140, mod: (a, t) => 1 + 0.035 * t * Math.sin(a * 11) }), m)];
}

function boots(zone: (k: string) => string) {
  const m = toon('boot', zone('boot'));
  const out: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    out.push(mesh(footShape(s), m, 0.0018));
    out.push(mesh(legSleeve(s, [[0.04, 0.05], [0.041, 0.12], [0.045, 0.2], [0.047, 0.21]]), m, 0.0018));
  }
  return out;
}

function brooch(zone: (k: string) => string, star: boolean) {
  const gem = toon('gem', zone('gem'));
  if (!star) {
    const b = ellipsoid([0.014, 0.017, 0.006], gem, 0.0012);
    b.position.set(0, 1.22, 0.113);
    return [b];
  }
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.007 : 0.017, a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const m = mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.004, bevelEnabled: false }), gem, 0.0012);
  m.position.set(0, 1.22, 0.11);
  return [m];
}

// ───────────────────────── assembly ─────────────────────────

const BUILDERS: Record<CharacterId, Record<string, Builder>> = {
  letha: {
    hair_bob: (z) => bobHair(toon('hair', z('hair'), { side: THREE.DoubleSide })),
    bobby_pins: (z) => [bobbyPins(toon('pin', z('pin')))],
    headband: (z) => headband(z),
    nightcap: (z) => nightcap(z),
    dress_daily: (z) => dress(z),
    nightgown: (z) => nightgown(z),
    collar_dial: (z) => dialCollar(z),
    collar_organdy: (z) => organdy(z),
    socks_crew: (z) => crewSocks(z, false),
    socks_unrest: (z) => crewSocks(z, true),
    shoes_saddle: (z) => saddleShoes(z),
    ouija: (z) => [ouija(z)],
    radio: (z) => radio(z),
    earphone: (z) => earphone(z),
    bracelet: (z) => bracelet(z),
  },
  phicia: {
    hair_long: (z) => phiciaHair(toon('hair', z('hair'), { side: THREE.DoubleSide })),
    lace_cap: (z) => laceCap(z),
    shirt_white: (z) => phiciaShirt(z),
    collar_shirt: (z) => shirtCollar(z),
    collar_frill: (z) => frillCollar(z),
    cape_short: (z) => cape(z, false),
    cape_long: (z) => cape(z, true),
    skirt_long: (z) => longSkirt(z),
    shoes_boots: (z) => boots(z),
    brooch_round: (z) => brooch(z, false),
    brooch_star: (z) => brooch(z, true),
  },
};

function placeholderSign() {
  const tex = canvasTexture(1024, 256, (ctx) => {
    ctx.fillStyle = 'rgba(255,214,0,0.92)'; ctx.fillRect(0, 0, 1024, 256);
    ctx.fillStyle = '#111';
    for (let x = -256; x < 1024; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 32, 0); ctx.lineTo(x + 32 + 40, 40); ctx.lineTo(x + 40, 40); ctx.fill(); ctx.beginPath(); ctx.moveTo(x, 216); ctx.lineTo(x + 32, 216); ctx.lineTo(x + 72, 256); ctx.lineTo(x + 40, 256); ctx.fill(); }
    ctx.font = 'bold 84px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('PLACEHOLDER · 占位模型', 512, 128);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.18), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(0, 0.002, 0.34);
  return m;
}

export function buildPlaceholder(character: CharacterId): Avatar {
  const defs = PLACEHOLDER_PARTS[character];
  const root = new THREE.Group();
  root.name = `placeholder_${character}`;
  const parts: AvatarPart[] = [];
  const zoneFn = (def: PartDef) => (k: string) => def.zones.find((z) => z.key === k)?.default ?? '#cccccc';

  const bodyDef = defs.find((d) => d.id === 'body')!;
  const skin = toon('skin', zoneFn(bodyDef)('skin'));
  const arms = character === 'letha' ? LETHA_ARMS : PHICIA_ARMS;

  // body
  const body: THREE.Object3D[] = [torso(skin), ...legs(skin)];
  body.push(limb(V(0, 1.29, -0.008), V(0, 1.4, 0), 0.034, 0.032, skin));
  const headGeo = headGeometry();
  const head = mesh(headGeo, toonSoft('skin', zoneFn(bodyDef)('skin')), 0.0024);
  head.receiveShadow = false; // anime faces: no cast-shadow blotches
  head.position.copy(HEAD_C);
  body.push(head);
  for (const s of [-1, 1]) {
    const ear = ellipsoid([0.012, 0.022, 0.01], skin, 0.0015);
    ear.position.copy(HEAD_C).add(V(s * 0.093, -0.012, -0.005));
    body.push(ear);
  }
  body.push(arm(arms.right, skin), arm(arms.left, skin));
  const fingertipNormal: THREE.Object3D[] = [];
  const fingertipFaded: THREE.Object3D[] = [];
  if (character === 'letha') {
    body.push(hand(arms.right.wrist.clone().add(V(-0.004, -0.04, 0)), V(-0.05, -1, 0.05), skin));
    body.push(hand(arms.left.wrist.clone().add(V(0.004, -0.035, 0.01)), V(0.05, -1, 0.15), skin));
  } else {
    const palm = ellipsoid([0.02, 0.033, 0.011], skin, 0.0016);
    palm.position.set(-0.012, 1.385, 0.112);
    palm.rotation.set(0.25, 0, -0.75);
    body.push(palm);
    const fingers = ellipsoid([0.016, 0.024, 0.008], skin, 0.0014);
    fingers.position.set(0.016, 1.402, 0.106);
    fingers.rotation.set(0.2, 0, -1.1);
    body.push(fingers);
    const tipGeo = new THREE.SphereGeometry(1, 16, 12);
    tipGeo.scale(0.006, 0.012, 0.006);
    const tip = mesh(tipGeo, skin, 0.0012);
    tip.position.set(0.038, 1.413, 0.101);
    tip.rotation.z = -1.2;
    fingertipNormal.push(tip);
    body.push(tip);
    const fadedMat = new THREE.MeshToonMaterial({ color: zoneFn(bodyDef)('skin'), transparent: true, opacity: 0.22, depthWrite: false });
    const faded = new THREE.Mesh(tipGeo, fadedMat);
    faded.position.copy(tip.position);
    faded.rotation.copy(tip.rotation);
    fingertipFaded.push(faded);
    body.push(hand(arms.left.wrist.clone().add(V(0.003, -0.04, 0)), V(0.04, -1, 0), skin));
  }
  for (const o of body) root.add(o);
  parts.push({ def: bodyDef, objects: body });

  // face
  const faceDef = defs.find((d) => d.id === 'face')!;
  const face = buildFaceLayers(headGeo, character === 'letha'
    ? { lid: 0.5, eyeScale: [1, 1], lidTilt: 0.35, browAngle: -0.3, mouth: 'flat', blush: 0.35 }
    : { lid: 0.55, eyeScale: [0.9, 1.04], lidTilt: -0.5, browAngle: 0.6, mouth: 'smirk', blush: 0.15 },
  { iris: zoneFn(faceDef)('iris'), line: character === 'letha' ? '#4a3524' : '#2b2730', blush: '#F08A8A' });
  face.position.copy(HEAD_C);
  root.add(face);
  parts.push({ def: faceDef, objects: [face] });

  // garments & props
  for (const def of defs) {
    if (def.id === 'body' || def.id === 'face') continue;
    if (def.id === 'fingertip_fade') {
      for (const o of fingertipFaded) root.add(o);
      parts.push({ def, objects: fingertipFaded, inverse: fingertipNormal });
      continue;
    }
    const build = BUILDERS[character][def.id];
    if (!build) continue;
    const objs = build(zoneFn(def));
    for (const o of objs) root.add(o);
    parts.push({ def, objects: objs });
  }

  const sign = placeholderSign();
  root.add(sign);

  return {
    character,
    source: 'placeholder',
    root,
    parts,
    faceTarget: HEAD_C.clone(),
    height: 1.6,
    update() {},
    dispose() {
      disposeObject(root);
    },
  };
}
