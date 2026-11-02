import type { FaceParams } from './faceShape';

/**
 * Feature SHAPES (eye type, brow type, mouth type) from the base model's own
 * artist-made blendshapes (pixiv's Fcl_* morph targets), mixed at partial
 * weight and kept as a permanent shape. In anime faces identity comes from
 * these feature shapes far more than from bone/skull proportions, so this is
 * what makes faces read as genuinely different under flat toon shading.
 *
 * Each slider runs −1..1: the positive side blends `pos`, the negative `neg`.
 */
export interface MorphParam {
  key: string;
  label: string; // "negative ↔ positive"
  min: number;
  max: number;
  pos: [string, number][];
  neg: [string, number][];
}

export const MORPH_PARAMS: MorphParam[] = [
  { key: 'mEyeTilt', label: '眼型：下垂 ↔ 上挑', min: -1, max: 1, pos: [['EYE_Angry', 0.55]], neg: [['EYE_Sorrow', 0.6]] },
  { key: 'mEyeRound', label: '眼型：细长 ↔ 圆', min: -1, max: 1, pos: [['EYE_Surprised', 0.6]], neg: [['EYE_Joy', 0.22], ['EYE_Close', 0.12]] },
  { key: 'mEyeOpen', label: '眼睛：困倦 ↔ 睁大', min: -1, max: 1, pos: [['EYE_Spread', 0.7]], neg: [['EYE_Close', 0.42]] },
  { key: 'mBrowTilt', label: '眉型：八字 ↔ 挑眉', min: -1, max: 1, pos: [['BRW_Angry', 0.75]], neg: [['BRW_Sorrow', 0.75]] },
  { key: 'mBrowArch', label: '眉型：平直 ↔ 弯眉', min: -1, max: 1, pos: [['BRW_Surprised', 0.6]], neg: [['BRW_Fun', 0.6]] },
  { key: 'mMouth', label: '嘴型：下撇 ↔ 微笑', min: -1, max: 1, pos: [['MTH_Fun', 0.55]], neg: [['MTH_Sorrow', 0.55]] },
  { key: 'mMouthSize', label: '嘴型：小嘴 ↔ 大嘴', min: -1, max: 1, pos: [['MTH_Large', 0.6]], neg: [['MTH_Small', 0.7]] },
  { key: 'mPout', label: '嘴型：抿嘴 ↔ 嘟嘴', min: -1, max: 1, pos: [['MTH_U', 0.3]], neg: [['MTH_Close', 0.6]] },
  { key: 'mFang', label: '虎牙', min: 0, max: 1, pos: [['HA_Fung1', 1]], neg: [] },
  { key: 'mHighlight', label: '眼神高光：无神 ↔ 正常', min: -1, max: 0, pos: [], neg: [['EYE_HighlightHide', 1]] },
];

/** Morph name suffix → weight for the given params. */
export function morphWeights(face: FaceParams): Map<string, number> {
  const w = new Map<string, number>();
  for (const p of MORPH_PARAMS) {
    const v = face[p.key] ?? 0;
    const list = v >= 0 ? p.pos : p.neg;
    for (const [name, k] of list) w.set(name, (w.get(name) ?? 0) + Math.abs(v) * k);
  }
  return w;
}

/**
 * Whole-face presets: combinations of proportions + feature shapes. They show
 * how the relationships between features (eye size vs. face length, brow–eye
 * distance, chin) create a character type.
 */
export const FACE_PRESETS: { id: string; label: string; face: FaceParams }[] = [
  { id: 'default', label: '默认', face: {} },
  { id: 'genki', label: '元气少女', face: { eyeSize: 0.45, eyeVertical: 0.3, mEyeRound: 0.6, mEyeOpen: 0.4, mBrowArch: 0.4, mMouth: 0.6, mFang: 0.7, faceLength: -0.4, chinLength: -0.3, cheekFull: 0.5, browHeight: 0.3 } },
  { id: 'cool', label: '冷淡御姐', face: { eyeSize: -0.15, eyeAngle: 0.5, mEyeTilt: 0.6, mEyeRound: -0.5, mBrowTilt: 0.4, browThickness: -0.3, browLength: 0.4, faceLength: 0.5, chinLength: 0.4, chinWidth: -0.4, jawWidth: -0.4, cheekFull: -0.4, noseHeight: 0.6, mMouthSize: -0.3 } },
  { id: 'sleepy', label: '困倦文静', face: { mEyeOpen: -0.8, mEyeTilt: -0.4, mBrowTilt: -0.4, eyeAngle: -0.3, browHeight: -0.2, mMouth: -0.2, mPout: -0.3 } },
  { id: 'gentle', label: '温柔垂眼', face: { eyeSize: 0.25, mEyeTilt: -0.7, mEyeRound: 0.2, mBrowTilt: -0.6, mBrowArch: 0.3, mMouth: 0.35, cheekFull: 0.3, chinWidth: 0.2 } },
  { id: 'smug', label: '坏笑', face: { mEyeTilt: 0.4, mEyeRound: -0.4, mBrowTilt: 0.5, mMouth: 0.8, mouthCorner: 0.6, mFang: 1, eyeAngle: 0.3 } },
  { id: 'child', label: '稚气', face: { eyeSize: 0.7, eyeVertical: 0.4, eyeHeight: -0.5, faceLength: -0.8, chinLength: -0.6, cheekFull: 0.8, jawWidth: 0.2, noseSize: -0.6, mMouthSize: -0.6, mEyeRound: 0.5 } },
];
