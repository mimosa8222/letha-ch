import * as THREE from 'three';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
export { V };

let gradient: THREE.DataTexture | null = null;
/** 3-step cel ramp so the placeholder reads as anime-shaded, not CAD. */
function toonRamp() {
  if (gradient) return gradient;
  const data = new Uint8Array([120, 120, 120, 255, 205, 205, 205, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

let softGradient: THREE.DataTexture | null = null;
/** Gentler ramp for faces: anime faces are mostly flat-lit. */
export function toonSoft(zone: string, color: string) {
  if (!softGradient) {
    const d = new Uint8Array([214, 214, 214, 255, 255, 255, 255, 255]);
    softGradient = new THREE.DataTexture(d, 2, 1, THREE.RGBAFormat);
    softGradient.minFilter = softGradient.magFilter = THREE.NearestFilter;
    softGradient.needsUpdate = true;
  }
  const m = new THREE.MeshToonMaterial({ color, gradientMap: softGradient });
  m.name = zone;
  return m;
}

/** A material is one recolorable zone: its name is the zone key. */
export function toon(zone: string, color: string, opts: Partial<THREE.MeshToonMaterialParameters> = {}) {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: toonRamp(), ...opts });
  m.name = zone;
  return m;
}

const outlineMat = new THREE.ShaderMaterial({
  uniforms: { thickness: { value: 0.0022 }, color: { value: new THREE.Color('#2a2228') } },
  vertexShader: /* glsl */ `
    uniform float thickness;
    void main() {
      vec3 transformed = position + normalize(normal) * thickness;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    void main() { gl_FragColor = vec4(color, 1.0); }`,
  side: THREE.BackSide,
});

/** Inverted-hull line art. Child of the mesh, so it hides with it. */
export function outline(mesh: THREE.Mesh, thickness = 0.0022) {
  const mat = outlineMat.clone();
  mat.uniforms.thickness.value = thickness;
  const o = new THREE.Mesh(mesh.geometry, mat);
  o.userData.outline = true;
  o.raycast = () => {};
  mesh.add(o);
  return mesh;
}

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, line = 0.0022) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  if (line > 0) outline(m, line);
  return m;
}

/** Tapered limb segment from a to b, with a sphere at b for the joint. */
export function limb(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, mat: THREE.Material, line = 0.002) {
  const g = new THREE.Group();
  const len = a.distanceTo(b);
  const geo = new THREE.CylinderGeometry(rb, ra, len, 20, 4, true);
  const m = mesh(geo, mat, line);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
  g.add(m);
  const j = mesh(new THREE.SphereGeometry(rb, 20, 14), mat, line);
  j.position.copy(b);
  g.add(j);
  return g;
}

export function ellipsoid(r: [number, number, number], mat: THREE.Material, line = 0.002, seg = 32) {
  const geo = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7));
  geo.scale(...r);
  return mesh(geo, mat, line);
}

/**
 * Surface of revolution around Y with elliptical cross-section and an optional
 * per-vertex radius modulation (pleats, waves). profile = [radius, y] pairs.
 */
export function revolve(
  profile: [number, number][],
  opts: { zScale?: number; seg?: number; mod?: (angle: number, t: number) => number; phiStart?: number; phiLength?: number } = {},
) {
  const { zScale = 1, seg = 64, mod, phiStart = 0, phiLength = Math.PI * 2 } = opts;
  const rows = profile.length;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    const a = phiStart + u * phiLength; // a=0 faces +Z (front)
    for (let j = 0; j < rows; j++) {
      const [r0, y] = profile[j];
      const t = j / (rows - 1);
      const r = r0 * (mod ? mod(a, t) : 1);
      pos.push(Math.sin(a) * r, y, Math.cos(a) * r * zScale);
      uv.push(u, 1 - t);
    }
  }
  for (let i = 0; i < seg; i++)
    for (let j = 0; j < rows - 1; j++) {
      const a = i * rows + j, b = (i + 1) * rows + j;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // Make normals point outward regardless of profile direction.
  const mid = Math.floor(rows / 2);
  const n = new THREE.Vector3().fromBufferAttribute(geo.attributes.normal as THREE.BufferAttribute, Math.floor(seg / 2) * rows + mid);
  const pp = new THREE.Vector3().fromBufferAttribute(geo.attributes.position as THREE.BufferAttribute, Math.floor(seg / 2) * rows + mid);
  if (n.x * pp.x + n.z * pp.z < 0) {
    for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
    geo.setIndex(idx);
    geo.computeVertexNormals();
  }
  return geo;
}

/** Tube along points, tapering from r0 to r1. */
export function tube(points: THREE.Vector3[], r0: number, r1 = r0, seg = 64, radial = 10) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const geo = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  if (r0 !== 1 || r1 !== 1) {
    const p = geo.attributes.position as THREE.BufferAttribute;
    const c = new THREE.Vector3();
    const v = new THREE.Vector3();
    for (let i = 0; i <= seg; i++) {
      curve.getPointAt(i / seg, c);
      const r = THREE.MathUtils.lerp(r0, r1, i / seg);
      for (let k = 0; k <= radial; k++) {
        const n = i * (radial + 1) + k;
        v.fromBufferAttribute(p, n).sub(c).multiplyScalar(r).add(c);
        p.setXYZ(n, v.x, v.y, v.z);
      }
    }
    geo.computeVertexNormals();
  }
  return geo;
}

/**
 * Split one geometry into several by a per-triangle classifier, so each zone
 * gets its own mesh + material (= independently recolorable).
 */
export function splitByZone(geo: THREE.BufferGeometry, classify: (c: THREE.Vector3) => string) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const uv = g.attributes.uv;
  const buckets = new Map<string, { p: number[]; n: number[]; uv: number[] }>();
  const c = new THREE.Vector3();
  for (let t = 0; t < p.count; t += 3) {
    c.set(0, 0, 0);
    for (let k = 0; k < 3; k++) c.x += p.getX(t + k) / 3, c.y += p.getY(t + k) / 3, c.z += p.getZ(t + k) / 3;
    const key = classify(c);
    if (!buckets.has(key)) buckets.set(key, { p: [], n: [], uv: [] });
    const b = buckets.get(key)!;
    for (let k = 0; k < 3; k++) {
      b.p.push(p.getX(t + k), p.getY(t + k), p.getZ(t + k));
      b.n.push(n.getX(t + k), n.getY(t + k), n.getZ(t + k));
      if (uv) b.uv.push(uv.getX(t + k), uv.getY(t + k));
    }
  }
  const out = new Map<string, THREE.BufferGeometry>();
  for (const [k, b] of buckets) {
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
    bg.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
    if (b.uv.length) bg.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    out.set(k, bg);
  }
  return out;
}

export function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
