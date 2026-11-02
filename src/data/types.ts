// Shared data model. Deliberately renderer-agnostic: the same PartDef / Look
// shapes describe the code-built placeholder mannequin and a user's VRM file
// (and would also fit Route A's layered PNGs if that route is revisited).

export type Status = '定' | '倾向' | '未定' | '试';
export type CharacterId = 'letha' | 'phicia';
export type AvatarSource = 'placeholder' | 'vrm';

export type SlotId =
  | 'body'
  | 'face'
  | 'hair'
  | 'headwear'
  | 'top'
  | 'collar'
  | 'outer'
  | 'bottom'
  | 'socks'
  | 'shoes'
  | 'hand'
  | 'accessory';

export interface SlotDef {
  id: SlotId;
  label: string;
  /** More than one part in this slot can be on at the same time. */
  multi: boolean;
  /** Slot can be left empty. */
  optional: boolean;
  /** Parts here are always shown and cannot be toggled (skin, face). */
  locked?: boolean;
}

export interface ZoneDef {
  key: string;
  label: string;
  default: string;
}

export interface PartDef {
  id: string;
  slot: SlotId;
  label: string;
  status: Status;
  zones: ZoneDef[];
  /** On in the default look. */
  defaultOn: boolean;
  /** Part ids that must also be on (e.g. organdy layer needs the cotton collar). */
  requires?: string[];
  note?: string;
}

/** A look = which parts are on. Colors join this in M2. */
export interface Look {
  enabled: Record<string, boolean>;
}

export interface SavedLook {
  id: string;
  name: string;
  character: CharacterId;
  source: AvatarSource;
  look: Look;
  createdAt: number;
}
