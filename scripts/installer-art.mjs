#!/usr/bin/env node
// Imagens do instalador Windows (NSIS), desenhadas em HTML com as fontes e as cores da app.
// Uso: node scripts/installer-art.mjs  → build/installerSidebar.bmp (164×314) e build/installerHeader.bmp (150×57)
import { chromium } from 'playwright-core';
import { readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const font = (await readFile('web/fonts/newsreader.woff2')).toString('base64');
const icon = `data:image/png;base64,${(await readFile('web/icon-512.png')).toString('base64')}`;
const page = (body, bg) => `<!doctype html><style>@font-face{font-family:N;src:url(data:font/woff2;base64,${font})}
  *{margin:0;box-sizing:border-box}body{background:${bg};font-family:"Segoe UI",system-ui,sans-serif;overflow:hidden}</style>${body}`;
const art = {
  installerSidebar: [164, 314, page(`<div style="height:314px;padding:30px 18px;display:flex;flex-direction:column;
      background:radial-gradient(120% 60% at 0 0,#1f3335 0,#111b1c 70%);color:#eef1ea">
    <img src="${icon}" width="58" height="58">
    <p style="margin-top:22px;font:500 33px/1 N;letter-spacing:-.02em">caderno<span style="color:#d8b56b">.</span></p>
    <p style="margin-top:12px;font-size:12px;line-height:1.45;color:#a9bab5">Os materiais das tuas cadeiras e o que estudar a seguir.</p>
    <div style="margin-top:auto;display:grid;gap:7px;font-size:11.5px;color:#a9bab5">
      ${['Moodle e PDFs', 'Plano para cada dia', 'IA opcional'].map((text) =>
        `<p style="display:flex;gap:8px;align-items:center"><span style="width:6px;height:6px;border-radius:2px;background:#d8b56b"></span>${text}</p>`).join('')}
    </div></div>`, '#111b1c')],
  installerHeader: [150, 57, page(`<div style="height:57px;display:flex;align-items:center;justify-content:flex-end;gap:9px;padding-right:10px">
    <p style="font:500 24px/1 N;letter-spacing:-.02em;color:#1c2b2b">caderno<span style="color:#b08a3a">.</span></p>
    <img src="${icon}" width="36" height="36"></div>`, '#ffffff')],
};
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(), headless: true });
try {
  for (const [name, [width, height, html]] of Object.entries(art)) {
    const tab = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await tab.setContent(html);
    await tab.evaluate(() => document.fonts.ready);
    await tab.screenshot({ path: `build/${name}.png` });
    // O NSIS só aceita BMP de 24 bits sem compressão.
    execFileSync('magick', [`build/${name}.png`, '-alpha', 'off', '-type', 'TrueColor', `BMP3:build/${name}.bmp`]);
    await rm(`build/${name}.png`);
  }
} finally { await browser.close(); }
