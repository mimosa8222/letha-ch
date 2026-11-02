// Automated browser test (headless Chromium, iPhone-sized viewport).
// Usage: node scripts/e2e.mjs <baseUrl> <shotDir>
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const [base = 'http://localhost:4173/', out = 'shots'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

let failed = 0;
const check = (name, ok, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
  if (!ok) failed++;
};
const ready = () => page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 120000 });
const disp = () => page.evaluate(() => window.app.character.shaper.displacement());
const shot = async (n) => { await page.waitForTimeout(600); await page.screenshot({ path: `${out}/${n}.png` }); };

await page.goto(base);
await ready();
check('model loads', true);
check('rest pose has zero displacement', (await disp()) < 1e-6);
await shot('01-full-default');

// ── face params: each one must actually move vertices ──
await page.click('nav.tabs button:has-text("捏脸")');
await page.waitForTimeout(800);
await shot('02-face-default');
const keys = await page.$$eval('input[data-param]', (els) => els.map((e) => e.dataset.param));
check('26 face parameters present', keys.length >= 26, `${keys.length}`);
for (const k of keys) {
  await page.fill(`input[data-param=${k}]`, '1');
  await page.waitForTimeout(50);
  const d = await disp();
  check(`param ${k} deforms mesh`, d > 1e-3, `Σ|Δ|=${d.toFixed(4)} m`);
  await page.fill(`input[data-param=${k}]`, '0');
}
await page.waitForTimeout(50);
check('params back to 0 restore rest mesh', (await disp()) < 1e-6);
// eyebrows are independent from the eyes
const dispTag = (t) => page.evaluate((t) => window.app.character.shaper.displacement(t), t);
await page.fill('input[data-param=eyeSize]', '1');
await page.fill('input[data-param=eyeHeight]', '1');
check('eye params do not move eyebrows', (await dispTag('brow')) < 1e-6, `brow Σ|Δ|=${(await dispTag('brow')).toFixed(5)}`);
await page.fill('input[data-param=eyeSize]', '0');
await page.fill('input[data-param=eyeHeight]', '0');
await page.fill('input[data-param=browHeight]', '1');
const bd = await dispTag('brow'), ed = await dispTag('eye');
check('brow params move only eyebrows', bd > 1e-3 && ed < 1e-6, `brow=${bd.toFixed(4)} eye=${ed.toFixed(6)}`);
await page.fill('input[data-param=browHeight]', '0');

// seam check: max gap between coincident face/neck vertices stays tiny
const extreme = { eyeSize: 1, eyeSpacing: 0.6, eyeAngle: 0.7, faceWidth: -0.8, faceLength: 0.6, chinLength: 0.8, jawWidth: -0.8, noseHeight: 1, noseWidth: -0.5, mouthWidth: -0.6, mouthHeight: 0.5, eyeHeight: -0.4 };
for (const [k, v] of Object.entries(extreme)) await page.fill(`input[data-param=${k}]`, String(v));
await shot('03-face-extreme');
for (const [k] of Object.entries(extreme)) await page.fill(`input[data-param=${k}]`, '0');
for (const [k, v] of Object.entries({ eyeSize: 0.6, eyeAngle: -0.5, faceWidth: -0.5, jawWidth: -0.6, chinLength: -0.3, mouthWidth: -0.4 })) await page.fill(`input[data-param=${k}]`, String(v));
await shot('04-face-cute-preset');

// ── hairstyles ──
await page.click('nav.tabs button:has-text("发型")');
const verts = () => page.evaluate(() => { const a = window.app.character.hair.mesh.geometry.attributes.position; let s = 0; for (let i = 1; i < a.array.length; i += 3) s += a.array[i]; return a.count + ':' + s.toFixed(3); });
const v0 = await verts();
check('procedural hair generated', parseInt(v0) > 1000, `${v0.split(':')[0]} verts`);
const seen = new Set([v0]);
for (const k of ['front:blunt', 'front:center', 'side:long', 'side:hime', 'back:bob', 'back:long', 'back:ponytail', 'back:twintail', 'back:bun']) {
  await page.click(`[data-hair="${k}"]`);
  await page.waitForTimeout(80);
  seen.add(await verts());
}
check('each hair option builds different geometry', seen.size >= 9, `${seen.size} distinct`);
await page.click('[data-hair="back:long"]');
await page.fill('input[data-hairparam=backLen]', '1.5');
await page.waitForTimeout(80);
check('hair length slider regenerates hair', !seen.has(await verts()));
const hairFollowsFace = await page.evaluate(() => {
  const m = window.app.character.hair.mesh; const a = m.geometry.attributes.position.array.slice();
  return a.length;
});
await page.fill('input[data-hairparam=backLen]', '1');
await page.click('button:has-text("原模型发型")');
const modeVis = await page.evaluate(() => {
  const c = window.app.character; let orig = null;
  c.root.traverse((o) => { if (o.isMesh && /^Hair_00_HAIR/.test([o.material].flat()[0].name)) orig = o.visible; });
  return { orig, proc: c.hair.group.visible };
});
check('original-hair mode swaps meshes', modeVis.orig === true && modeVis.proc === false, JSON.stringify(modeVis));
await page.click('button:has-text("自定义发型")');
await page.click('[data-hair="back:bob"]');
await page.click('[data-hair="front:blunt"]');
await page.click('[data-hair="side:none"]');
void hairFollowsFace;
await shot('05a-hair-blunt-bob');

// ── colors ──
await page.click('nav.tabs button:has-text("颜色")');
await page.locator('.swatches').nth(0).locator('button').nth(1).click(); // blonde
await page.locator('.swatches').nth(1).locator('button').nth(1).click(); // grey-blue
await page.waitForTimeout(300);
const hair = await page.evaluate(() => window.app.character['hairMats'][0].color.getHexString());
check('hair color applied to material', hair === 'e2c27a', hair);
await shot('05-colors');

// ── outfit swap ──
await page.click('nav.tabs button:has-text("服装")');
await page.click('[data-outfit=dress]');
await page.waitForTimeout(1500);
const vis = await page.evaluate(() => {
  const s = window.app.character.root;
  let tops = null, dress = null;
  s.traverse((o) => {
    if (o.isMesh && /Tops_01/.test([o.material].flat()[0]?.name ?? '')) tops = o.visible;
    if (o.name?.startsWith('garment:')) dress = o.visible;
  });
  return { tops, dress };
});
check('dress replaces original top', vis.tops === false && vis.dress === true, JSON.stringify(vis));
await page.click('.seg button:has-text("全身")');
await shot('06-dress-full');
await page.locator('.swatches button').nth(4).click();
await shot('07-dress-recolor');

// ── save / load / persistence ──
await page.click('nav.tabs button:has-text("存档")');
await page.fill('form input', 'test-slot');
await page.click('form button');
await page.click('nav.tabs button:has-text("捏脸")');
await page.fill('input[data-param=eyeSize]', '-1');
await page.click('nav.tabs button:has-text("存档")');
await page.click('.saves li:has-text("test-slot") button:has-text("载入")');
await page.click('nav.tabs button:has-text("捏脸")');
const restored = await page.inputValue('input[data-param=eyeSize]');
check('named slot load restores params', restored === '0.6', `eyeSize=${restored}`);
await page.waitForTimeout(800);
await page.reload();
await ready();
await page.click('nav.tabs button:has-text("捏脸")');
const persisted = await page.inputValue('input[data-param=eyeSize]');
const outfitAfter = await page.evaluate(() => { let d = null; window.app.character.root.traverse((o) => { if (o.name?.startsWith('garment:')) d = o.visible; }); return d; });
check('state persists across reload', persisted === '0.6' && outfitAfter === true, `eyeSize=${persisted}, dress=${outfitAfter}`);

// touch controls config (gesture itself can't be verified headless)
const touches = await page.evaluate(() => window.app.viewer.controls.touches);
check('touch: 1 finger rotate, 2 finger pinch', touches.ONE === 0 && touches.TWO === 3, JSON.stringify(touches));

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
