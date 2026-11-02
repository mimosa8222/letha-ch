import type { CharacterId, Look, PartDef, SlotDef, SlotId } from './types';

export const SLOTS: SlotDef[] = [
  { id: 'body', label: '身体', multi: false, optional: false, locked: true },
  { id: 'face', label: '脸', multi: false, optional: false, locked: true },
  { id: 'hair', label: '发型', multi: false, optional: false },
  { id: 'headwear', label: '头饰', multi: true, optional: true },
  { id: 'top', label: '上身', multi: false, optional: true },
  { id: 'collar', label: '领子', multi: true, optional: true },
  { id: 'outer', label: '披风', multi: false, optional: true },
  { id: 'bottom', label: '下身', multi: false, optional: true },
  { id: 'socks', label: '袜子', multi: false, optional: true },
  { id: 'shoes', label: '鞋', multi: false, optional: true },
  { id: 'hand', label: '手持', multi: true, optional: true },
  { id: 'accessory', label: '配件', multi: true, optional: true },
];

export const slotById = (id: SlotId) => SLOTS.find((s) => s.id === id)!;

export const CHARACTERS: { id: CharacterId; label: string }[] = [
  { id: 'letha', label: 'Letha' },
  { id: 'phicia', label: 'Phicia' },
];

/**
 * Placeholder part catalog. Status tags follow SPEC §7 verbatim; undecided
 * items stay 未定 — never promote them on our own.
 */
export const PLACEHOLDER_PARTS: Record<CharacterId, PartDef[]> = {
  letha: [
    { id: 'body', slot: 'body', label: '身体', status: '定', defaultOn: true,
      zones: [{ key: 'skin', label: '皮肤', default: '#F2DCCB' }] },
    { id: 'face', slot: 'face', label: '脸（半睁眼）', status: '倾向', defaultOn: true,
      zones: [{ key: 'iris', label: '虹膜', default: '#7E93A8' }] },
    { id: 'hair_bob', slot: 'hair', label: '外翘波波头 + 短碎刘海', status: '定', defaultOn: true,
      zones: [{ key: 'hair', label: '发色', default: '#D9B878' }],
      note: '发色金/浅棕未定，M2 加预设' },
    { id: 'bobby_pins', slot: 'headwear', label: '一字夹（X 交叉）', status: '定', defaultOn: true,
      zones: [{ key: 'pin', label: '发夹', default: '#3A3A40' }] },
    { id: 'headband', slot: 'headwear', label: '灰色钩针发带', status: '未定', defaultOn: false,
      zones: [{ key: 'band', label: '发带', default: '#8C8C8C' }] },
    { id: 'nightcap', slot: 'headwear', label: '睡帽', status: '倾向', defaultOn: false,
      zones: [{ key: 'cap', label: '睡帽', default: '#E8E2D2' }] },
    { id: 'dress_daily', slot: 'top', label: '日常连衣裙（泡泡袖·百褶）', status: '倾向', defaultOn: true,
      zones: [
        { key: 'dress', label: '裙身', default: '#2C3550' },
        { key: 'waistband', label: '腰带', default: '#232A40' },
      ] },
    { id: 'nightgown', slot: 'top', label: '睡裙', status: '未定', defaultOn: false,
      zones: [{ key: 'gown', label: '睡裙', default: '#E9DDD0' }] },
    { id: 'collar_dial', slot: 'collar', label: '刻度盘领（棉）', status: '定', defaultOn: true,
      zones: [
        { key: 'cotton', label: '棉布', default: '#F4F1E8' },
        { key: 'dial', label: '刻度', default: '#2A2A2A' },
      ] },
    { id: 'collar_organdy', slot: 'collar', label: '欧根纱层', status: '倾向', defaultOn: true,
      requires: ['collar_dial'],
      zones: [{ key: 'organdy', label: '欧根纱', default: '#FFFFFF' }] },
    { id: 'socks_crew', slot: 'socks', label: '白色翻边短袜', status: '定', defaultOn: true,
      zones: [{ key: 'sock', label: '袜子', default: '#F4F2EC' }] },
    { id: 'socks_unrest', slot: 'socks', label: 'Unrest 短袜', status: '定', defaultOn: false,
      zones: [
        { key: 'mesh', label: '网格底', default: '#D9D9D4' },
        { key: 'motif', label: '芥末黄竖纹', default: '#C9A227' },
      ] },
    { id: 'shoes_saddle', slot: 'shoes', label: '马鞍鞋', status: '定', defaultOn: true,
      zones: [
        { key: 'upper', label: '鞋头鞋跟', default: '#F3EFE6' },
        { key: 'saddle', label: '马鞍', default: '#1C1919' },
        { key: 'lace', label: '鞋带', default: '#F3EFE6' },
        { key: 'sole', label: '鞋底', default: '#8A3F2C' },
      ] },
    { id: 'ouija', slot: 'hand', label: '通灵板 + 占卜写板', status: '定', defaultOn: true,
      zones: [
        { key: 'wood', label: '木板', default: '#9C6B3E' },
        { key: 'glass', label: '粉色玻璃', default: '#F2A7C0' },
      ] },
    { id: 'radio', slot: 'accessory', label: '皮套收音机 + 斜挎带', status: '定', defaultOn: true,
      zones: [
        { key: 'leather', label: '皮套', default: '#6B4126' },
        { key: 'strap', label: '挎带', default: '#5A3720' },
      ] },
    { id: 'earphone', slot: 'accessory', label: '晶体耳机 + 耳机线', status: '定', defaultOn: true,
      requires: ['radio'],
      zones: [
        { key: 'ivory', label: '象牙白', default: '#EDE6D2' },
        { key: 'cord', label: '耳机线', default: '#2B2622' },
      ] },
    { id: 'bracelet', slot: 'accessory', label: 'PHICIA 字母手链', status: '未定', defaultOn: false,
      zones: [{ key: 'beads', label: '字母珠', default: '#F0EDE4' }] },
  ],
  phicia: [
    { id: 'body', slot: 'body', label: '身体（手捂嘴）', status: '倾向', defaultOn: true,
      zones: [{ key: 'skin', label: '皮肤', default: '#F1E4DE' }] },
    { id: 'face', slot: 'face', label: '脸（狡黠半睁眼）', status: '倾向', defaultOn: true,
      zones: [{ key: 'iris', label: '虹膜', default: '#B97A9C' }] },
    { id: 'hair_long', slot: 'hair', label: '灰白发 + 胸前长鬓发', status: '倾向', defaultOn: true,
      zones: [{ key: 'hair', label: '发色', default: '#D8D6D2' }], note: '发色未定' },
    { id: 'lace_cap', slot: 'headwear', label: '蕾丝帽 + 卷角', status: '定', defaultOn: true,
      zones: [
        { key: 'lace', label: '蕾丝', default: '#F6F4EF' },
        { key: 'horn', label: '角', default: '#2A2326' },
      ] },
    { id: 'shirt_white', slot: 'top', label: '白衬衫', status: '未定', defaultOn: true,
      zones: [{ key: 'shirt', label: '衬衫', default: '#F2F0EB' }] },
    { id: 'collar_shirt', slot: 'collar', label: '衬衫尖领 + 深色领带', status: '倾向', defaultOn: true,
      zones: [
        { key: 'collar', label: '领子', default: '#F7F6F2' },
        { key: 'tie', label: '领带', default: '#24222A' },
      ] },
    { id: 'collar_frill', slot: 'collar', label: '荷叶领（候选）', status: '未定', defaultOn: false,
      zones: [{ key: 'frill', label: '荷叶边', default: '#F7F6F2' }] },
    { id: 'cape_short', slot: 'outer', label: '短披肩（候选 1）', status: '未定', defaultOn: false,
      zones: [{ key: 'cape', label: '披肩', default: '#2B2530' }] },
    { id: 'cape_long', slot: 'outer', label: '长斗篷（候选 2）', status: '未定', defaultOn: false,
      zones: [{ key: 'cape', label: '斗篷', default: '#2B2530' }] },
    { id: 'skirt_long', slot: 'bottom', label: '深色长裙（试）', status: '试', defaultOn: true,
      zones: [{ key: 'skirt', label: '长裙', default: '#2E2A33' }] },
    { id: 'shoes_boots', slot: 'shoes', label: '短靴（试）', status: '试', defaultOn: true,
      zones: [{ key: 'boot', label: '靴', default: '#1E1B20' }] },
    { id: 'brooch_round', slot: 'accessory', label: '圆形胸针（候选 1）', status: '未定', defaultOn: false,
      zones: [{ key: 'gem', label: '宝石', default: '#B97A9C' }] },
    { id: 'brooch_star', slot: 'accessory', label: '星形胸针（候选 2）', status: '未定', defaultOn: false,
      zones: [{ key: 'gem', label: '宝石', default: '#7FA58A' }] },
    { id: 'fingertip_fade', slot: 'accessory', label: '右手指尖被遗忘', status: '倾向', defaultOn: false,
      note: 'SPEC：确认得比较仓促', zones: [] },
  ],
};

export function defaultLook(parts: PartDef[]): Look {
  const enabled: Record<string, boolean> = {};
  for (const p of parts) enabled[p.id] = p.defaultOn;
  return { enabled };
}

/**
 * Turn a part on/off while keeping slot rules: single-choice slots switch
 * the others off, `requires` pulls dependencies on, and turning a part off
 * also turns off parts that require it.
 */
export function togglePart(parts: PartDef[], look: Look, partId: string, on: boolean): Look {
  const enabled = { ...look.enabled };
  const part = parts.find((p) => p.id === partId);
  if (!part) return look;
  const slot = slotById(part.slot);
  if (slot.locked) return look;
  if (!on && !slot.optional && !slot.multi) return look; // can't empty a required slot

  enabled[partId] = on;
  if (on) {
    if (!slot.multi) for (const p of parts) if (p.slot === part.slot && p.id !== partId) enabled[p.id] = false;
    for (const r of part.requires ?? []) enabled[r] = true;
  }
  // cascade: anything whose requirement is now off goes off too
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of parts) {
      if (enabled[p.id] && (p.requires ?? []).some((r) => !enabled[r])) {
        enabled[p.id] = false;
        changed = true;
      }
    }
  }
  return { enabled };
}
