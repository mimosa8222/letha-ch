// Usage: node scripts/screenshot.mjs <baseUrl> <outDir> [vrmFile]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs';

const [base = 'http://localhost:4173/', out = 'shots', vrm] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

const shots = [
  { name: 'desktop-letha-full', vp: { width: 1440, height: 900 }, q: 'char=letha' },
  { name: 'desktop-letha-face', vp: { width: 1440, height: 900 }, q: 'char=letha&frame=face' },
  { name: 'desktop-phicia-full', vp: { width: 1440, height: 900 }, q: 'char=phicia' },
  { name: 'desktop-phicia-face', vp: { width: 1440, height: 900 }, q: 'char=phicia&frame=face' },
  { name: 'phone-letha-full', vp: { width: 390, height: 844 }, mobile: true, q: 'char=letha' },
  { name: 'phone-letha-face', vp: { width: 390, height: 844 }, mobile: true, q: 'char=letha&frame=face' },
  { name: 'phone-phicia-face', vp: { width: 390, height: 844 }, mobile: true, q: 'char=phicia&frame=face' },
];

for (const s of shots) {
  const ctx = await browser.newContext({ viewport: s.vp, deviceScaleFactor: s.mobile ? 3 : 1, isMobile: !!s.mobile, hasTouch: !!s.mobile });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error(s.name, 'pageerror', e.message));
  await page.goto(`${base}?${s.q}`);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${s.name}.png` });
  console.log('✓', s.name);
  await ctx.close();
}

if (vrm) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('vrm pageerror', e.message));
  await page.goto(`${base}?char=letha&tab=model`);
  await page.waitForSelector('body[data-ready="1"]');
  await page.setInputFiles('input[type=file]', vrm);
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !document.querySelector('.toast'), null, { timeout: 90000 });
  await page.waitForTimeout(2000);
  await page.click('.tabs button:first-child');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/desktop-vrm-test.png` });
  console.log('✓ vrm');
  await ctx.close();
}
await browser.close();
