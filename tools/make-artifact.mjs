// Turns the Vite build (dist/) into one self-contained page for claude.ai
// Artifact hosting: JS + CSS inlined, models served as published side files.
import fs from 'node:fs';
const html = fs.readFileSync('dist/index.html', 'utf8');
const js = html.match(/src="\.\/(assets\/[^"]+\.js)"/)[1];
const css = html.match(/href="\.\/(assets\/[^"]+\.css)"/)[1];
const code = fs.readFileSync(`dist/${js}`, 'utf8').replace(/<\/script/gi, '<\\/script');
const style = fs.readFileSync(`dist/${css}`, 'utf8');
fs.mkdirSync('artifact', { recursive: true });
fs.writeFileSync('artifact/index.html', `<title>Letha 捏人工坊</title>
<meta name="theme-color" content="#16141c">
<style>${style}
html, body, #root { height: 100%; } body { background: #16141c; }</style>
<div id="root"></div>
<script type="module">${code}</script>
`);
console.log('artifact/index.html', (fs.statSync('artifact/index.html').size / 1024).toFixed(0), 'KB');
