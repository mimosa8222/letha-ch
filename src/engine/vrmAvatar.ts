import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';
import type { CharacterId, PartDef, SlotId, Status } from '../data/types';
import type { Avatar, AvatarPart } from './avatar';

/**
 * VRoid Studio names its materials like `N00_002_01_Tops_01_CLOTH (Instance)`
 * or `Body_00_SKIN`. Map those tokens to our slots.
 */
const RULES: [RegExp, SlotId, string][] = [
  [/_SKIN\b|Body_00/i, 'body', '身体'],
  [/Eye|Face|Brow|Mouth|Eyeline|Lash/i, 'face', '脸'],
  [/Hair/i, 'hair', '头发'],
  [/Onepiece|Onepice|Tops/i, 'top', '上身'],
  [/Bottoms|Skirt|Pants/i, 'bottom', '下身'],
  [/Socks|Legwear/i, 'socks', '袜子'],
  [/Shoes|Boots/i, 'shoes', '鞋'],
  [/Collar/i, 'collar', '领子'],
  [/Hat|Cap|Head/i, 'headwear', '头饰'],
];

function classify(name: string): { slot: SlotId; label: string } {
  for (const [re, slot, label] of RULES) if (re.test(name)) return { slot, label };
  return { slot: 'accessory', label: '配件' };
}

const clean = (n: string) => n.replace(/\s*\(Instance\)$/i, '').replace(/^N\d+_\d+_\d+_/, '');

export async function loadVrmAvatar(data: ArrayBuffer, character: CharacterId): Promise<Avatar> {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await loader.parseAsync(data, '');
  const vrm = gltf.userData.vrm as VRM | undefined;
  if (!vrm) throw new Error('这不是 VRM 文件（缺少 VRM 扩展）');

  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.combineSkeletons(gltf.scene);
  VRMUtils.rotateVRM0(vrm); // VRM 0.x faces -Z; make it face the camera
  vrm.scene.traverse((o) => {
    o.frustumCulled = false;
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });

  // Rest pose is a T-pose; lower the arms to a natural standing pose.
  const h = vrm.humanoid;
  h.getNormalizedBoneNode('leftUpperArm')?.rotation.set(0, 0, -1.2);
  h.getNormalizedBoneNode('rightUpperArm')?.rotation.set(0, 0, 1.2);
  h.getNormalizedBoneNode('leftLowerArm')?.rotation.set(0, -0.15, 0);
  h.getNormalizedBoneNode('rightLowerArm')?.rotation.set(0, 0.15, 0);
  vrm.update(0);

  // One part per material (VRoid puts each garment in its own primitive).
  const byMat = new Map<string, THREE.Mesh[]>();
  vrm.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const key = clean(mats[0]?.name || m.name || 'mesh');
    if (!byMat.has(key)) byMat.set(key, []);
    byMat.get(key)!.push(m);
  });

  const parts: AvatarPart[] = [];
  for (const [name, meshes] of byMat) {
    const { slot } = classify(name);
    const status: Status = '试';
    const def: PartDef = {
      id: `vrm:${name}`,
      slot,
      label: name,
      status,
      defaultOn: true,
      zones: [{ key: name, label: name, default: '#ffffff' }],
    };
    parts.push({ def, objects: meshes });
  }

  // Frame using the head bone.
  const box = new THREE.Box3().setFromObject(vrm.scene);
  const head = h.getNormalizedBoneNode('head');
  const faceTarget = new THREE.Vector3();
  if (head) head.getWorldPosition(faceTarget).add(new THREE.Vector3(0, 0.06, 0));
  else faceTarget.set(0, box.max.y - 0.12, 0);

  return {
    character,
    source: 'vrm',
    root: vrm.scene,
    parts,
    faceTarget,
    height: box.max.y - box.min.y,
    vrm,
    update(dt) {
      vrm.update(dt);
    },
    dispose() {
      VRMUtils.deepDispose(vrm.scene);
    },
  };
}
