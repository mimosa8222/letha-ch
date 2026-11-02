import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MToonMaterial, VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';
import { FaceShaper, type FaceParams } from './faceShape';
import { ProceduralHair, defaultHair, type HairStyle } from './hair';
import type { Subject } from './viewer';

const MODELS = `${import.meta.env.BASE_URL}models/`;
/** Artifact hosting only serves text, so that build ships models as base64 .txt. */
const B64 = import.meta.env.VITE_B64_MODELS === '1';

async function fetchModel(file: string, onProgress?: (f: number) => void): Promise<ArrayBuffer> {
  const url = B64 ? `${MODELS}${file}.b64.txt` : `${MODELS}${file}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`模型下载失败 ${res.status}: ${file}`);
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body!.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    if (total) onProgress?.(got / total);
  }
  const buf = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) { buf.set(c, o); o += c.length; }
  if (!B64) return buf.buffer;
  const bin = atob(new TextDecoder().decode(buf).trim());
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export interface OutfitDef {
  id: string;
  label: string;
  /** Base-model materials shown with this outfit (others in the clothing set are hidden). */
  baseMaterials: string[];
  /** Extra garment GLB rebinding onto the skeleton. */
  garment?: string;
}

/** Clothing slots of the base model. Add outfits here. */
export const CLOTHING_MATERIALS = ['Tops_01_CLOTH', 'Bottoms_01_CLOTH'];
export const OUTFITS: OutfitDef[] = [
  { id: 'casual', label: 'T 恤 + 短裤（原模型）', baseMaterials: ['Tops_01_CLOTH', 'Bottoms_01_CLOTH'] },
  { id: 'dress', label: '连衣裙（Blender 生成）', baseMaterials: [], garment: 'dress.glb' },
];

export interface Look {
  face: FaceParams;
  hairColor: string;
  eyeColor: string;
  outfit: string;
  hair: HairStyle;
  dressColor: string;
}

const matName = (m: THREE.Material) => m.name.replace(/\s*\(Instance\)$/i, '');

/** Greyscale copy of a texture so a tint color can fully drive its hue. */
function greyTexture(tex: THREE.Texture, gain: number, normalize: boolean) {
  const img = tex.image as CanvasImageSource & { width: number; height: number };
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  const a = d.data;
  // normalise brightness so light colors (blonde, silver) can be reached
  let sum = 0, n = 0;
  for (let i = 0; i < a.length; i += 4) if (a[i + 3] > 128) { sum += 0.3 * a[i] + 0.59 * a[i + 1] + 0.11 * a[i + 2]; n++; }
  const norm = normalize && n ? (gain * 0.6 * 255) / (sum / n) : gain;
  for (let i = 0; i < a.length; i += 4) {
    const l = Math.min(255, (0.3 * a[i] + 0.59 * a[i + 1] + 0.11 * a[i + 2]) * norm);
    a[i] = a[i + 1] = a[i + 2] = l;
  }
  ctx.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = tex.flipY;
  t.wrapS = tex.wrapS;
  t.wrapT = tex.wrapT;
  t.needsUpdate = true;
  return t;
}

export class Character implements Subject {
  root: THREE.Object3D;
  faceTarget = new THREE.Vector3();
  height = 1.6;
  readonly shaper: FaceShaper;
  private byMat = new Map<string, THREE.Mesh[]>();
  private garments = new Map<string, THREE.Object3D>();
  private hairMats: MToonMaterial[] = [];
  private irisMats: MToonMaterial[] = [];
  private garmentMats: MToonMaterial[] = [];
  private blinkT = 0;
  readonly hair = new ProceduralHair();
  private originalHair: THREE.Mesh[] = [];

  private constructor(readonly vrm: VRM) {
    this.root = vrm.scene;
    vrm.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.frustumCulled = false;
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        const k = matName(mat);
        if (!this.byMat.has(k)) this.byMat.set(k, []);
        this.byMat.get(k)!.push(m);
      }
    });

    // natural standing pose instead of a T-pose
    const h = vrm.humanoid;
    h.getNormalizedBoneNode('leftUpperArm')?.rotation.set(0, 0, -1.18);
    h.getNormalizedBoneNode('rightUpperArm')?.rotation.set(0, 0, 1.18);
    h.getNormalizedBoneNode('leftLowerArm')?.rotation.set(0, -0.2, 0);
    h.getNormalizedBoneNode('rightLowerArm')?.rotation.set(0, 0.2, 0);
    vrm.update(0);

    const find = (re: RegExp) => [...this.byMat.entries()].filter(([k]) => re.test(k)).flatMap(([, v]) => v);
    const faceMeshes = [...new Set(find(/FACE|EYE|_SKIN$/).concat(find(/HAIR/)))];
    // face, eyes, brows, mouth, hair and the neck part of the body
    const bodyMeshes = find(/^(Body_00_SKIN|Tops|Bottoms)/);
    this.shaper = new FaceShaper([...faceMeshes, ...bodyMeshes], {
      iris: find(/EyeIris/),
      white: find(/EyeWhite/),
      mouth: find(/FaceMouth/),
      skin: find(/^Face_00_SKIN/),
    });

    for (const mesh of find(/HAIR/)) for (const m of [mesh.material].flat()) this.prepTint(m as MToonMaterial, this.hairMats, 1.5, true);
    this.originalHair = [...new Set(find(/HAIR/))];
    vrm.scene.add(this.hair.group);
    this.hairMats.push(this.hair.material);
    for (const mesh of find(/EyeIris/)) for (const m of [mesh.material].flat()) this.prepTint(m as MToonMaterial, this.irisMats, 1.6);

    const box = new THREE.Box3().setFromObject(vrm.scene);
    this.height = box.max.y - box.min.y;
    const L = this.shaper.landmarks;
    this.faceTarget.set(0, (L.eyeL.y + L.chin.y) / 2 + 0.01, 0);
  }

  static async load(onProgress?: (f: number) => void) {
    const loader = new GLTFLoader();
    loader.register((p) => new VRMLoaderPlugin(p));
    const gltf = await loader.parseAsync(await fetchModel('base.vrm', onProgress), '');
    const vrm = gltf.userData.vrm as VRM;
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.rotateVRM0(vrm);
    return new Character(vrm);
  }

  private prepTint(m: MToonMaterial, list: MToonMaterial[], gain: number, normalize = false) {
    if (!m || list.includes(m)) return;
    if (m.map) m.map = greyTexture(m.map, gain, normalize);
    if (m.shadeMultiplyTexture) m.shadeMultiplyTexture = greyTexture(m.shadeMultiplyTexture, gain, normalize);
    list.push(m);
  }

  private tint(list: MToonMaterial[], hex: string, shade = 0.72) {
    const c = new THREE.Color(hex);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    // anime shading: shadow color is a darker, slightly cooler & more saturated version
    const sh = new THREE.Color().setHSL((hsl.h + 0.97) % 1, Math.min(1, hsl.s * 1.15 + 0.05), hsl.l * shade);
    for (const m of list) {
      m.color.copy(c);
      if (m.shadeColorFactor) m.shadeColorFactor.copy(sh);
    }
  }

  async setOutfit(id: string) {
    const def = OUTFITS.find((o) => o.id === id) ?? OUTFITS[0];
    for (const name of CLOTHING_MATERIALS)
      for (const m of this.byMat.get(name) ?? []) m.visible = def.baseMaterials.includes(name);
    for (const [k, g] of this.garments) g.visible = k === def.garment;
    if (def.garment && !this.garments.has(def.garment)) {
      const g = await this.loadGarment(def.garment);
      this.garments.set(def.garment, g);
      g.visible = true;
    }
  }

  /** Load a skinned garment and bind it to this avatar's bones by name. */
  private async loadGarment(file: string) {
    const gltf = await new GLTFLoader().parseAsync(await fetchModel(file), '');
    const group = new THREE.Group();
    group.name = `garment:${file}`;
    const skinned: THREE.SkinnedMesh[] = [];
    gltf.scene.traverse((o) => (o as THREE.SkinnedMesh).isSkinnedMesh && skinned.push(o as THREE.SkinnedMesh));
    for (const sm of skinned) {
      const bones = sm.skeleton.bones.map((b) => {
        const target = this.vrm.scene.getObjectByName(b.name) as THREE.Bone | undefined;
        if (!target) throw new Error(`garment bone missing on avatar: ${b.name}`);
        return target;
      });
      const src = sm.material as THREE.MeshStandardMaterial;
      const white = /Collar/i.test(src.name);
      const mat = new MToonMaterial({
        color: white ? new THREE.Color('#f6f3ec') : new THREE.Color(src.color),
        shadeColorFactor: white ? new THREE.Color('#c9c4d6') : new THREE.Color(src.color).multiplyScalar(0.6),
        shadingToonyFactor: 0.9,
        shadingShiftFactor: -0.05,
        side: THREE.DoubleSide,
      });
      mat.name = src.name;
      if (!white) this.garmentMats.push(mat);
      const mesh = new THREE.SkinnedMesh(sm.geometry, mat);
      mesh.name = sm.name;
      mesh.frustumCulled = false;
      mesh.bind(new THREE.Skeleton(bones, sm.skeleton.boneInverses), sm.bindMatrix);
      group.add(mesh);
    }
    this.vrm.scene.add(group);
    return group;
  }

  setHair(style: HairStyle) {
    const custom = style.mode === 'custom';
    for (const m of this.originalHair) m.visible = !custom;
    this.hair.group.visible = custom;
    if (custom && this.hair.build(style)) this.shaper.setExtra(this.hair.mesh ? [this.hair.mesh] : []);
  }

  async applyLook(look: Look) {
    this.setHair({ ...defaultHair(), ...look.hair });
    this.shaper.apply(look.face);
    this.tint(this.hairMats, look.hairColor);
    this.hair.outline.uniforms.color.value.set(look.hairColor).multiplyScalar(0.35);
    this.tint(this.irisMats, look.eyeColor, 0.55);
    await this.setOutfit(look.outfit);
    for (const m of this.garmentMats) {
      const isBand = /Waistband/i.test(m.name);
      const c = new THREE.Color(look.dressColor).multiplyScalar(isBand ? 0.6 : 1);
      m.color.copy(c);
      m.shadeColorFactor.copy(c.clone().multiplyScalar(0.62));
    }
  }

  update(dt: number) {
    // idle blink every ~4s
    this.blinkT += dt;
    const em = this.vrm.expressionManager;
    if (em) {
      const t = this.blinkT % 4.2;
      em.setValue('blink', t > 4.0 ? Math.sin(((t - 4.0) / 0.2) * Math.PI) : 0);
    }
    this.vrm.update(dt);
  }
}
