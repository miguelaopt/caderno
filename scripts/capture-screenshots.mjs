#!/usr/bin/env node
// Capturas reais da app para o site, com a base fictícia criada por seed-screenshot.mjs.
// Uso: node scripts/capture-screenshots.mjs http://127.0.0.1:<porta> <sessao> /tmp/caderno-shot.<x>
// O servidor deve correr com NODE_ENV=desktop. Depois converte para WebP:
//   for f in /tmp/caderno-shot.<x>/*.png; do magick "$f" -resize 1400x\> -quality 80 "site/screenshots/$(basename "${f%.png}").webp"; done
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';

const [base, token, output] = process.argv.slice(2);
if (!base?.startsWith('http://127.0.0.1:') || !token || !output?.startsWith('/tmp/caderno-shot.'))
  throw new Error('Uso: capture-screenshots <url-local> <sessao-ficticia> </tmp/caderno-shot...>');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(), headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2, locale: 'pt-PT' });
  await context.addCookies([{ name: 'caderno_session', value: token, url: base, httpOnly: true, sameSite: 'Lax' }]);
  const page = await context.newPage();
  const open = async (screen, heading) => {
    await page.locator(`.sidebar [data-screen="${screen}"]`).first().click();
    await page.getByRole('heading', { name: heading, exact: true }).first().waitFor();
    await page.waitForTimeout(200);
  };
  await page.goto(`${base}/app`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  if (await page.locator('.guide').count()) {
    await page.locator('[data-guide-step="1"]').click();
    await page.screenshot({ path: `${output}/guia.png` });
    await page.locator('.guide-index [data-action="guide-done"]').click();
  }
  await page.getByRole('heading', { name: 'Hoje', exact: true }).waitFor();
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.screenshot({ path: `${output}/hoje-hero.png` });
  await page.setViewportSize({ width: 1280, height: 820 });
  await open('files', 'Materiais');
  await page.screenshot({ path: `${output}/materiais.png` });
  // Posições das anotações do site, em percentagem da captura.
  const pins = await page.evaluate(() => {
    const at = (selector, side = 'left') => {
      const box = document.querySelector(selector)?.getBoundingClientRect();
      if (!box) throw new Error(`Elemento em falta: ${selector}`);
      const x = side === 'left' ? box.left : box.right;
      return { left: +(x / innerWidth * 100).toFixed(1), top: +((box.top + box.height / 2) / innerHeight * 100).toFixed(1) };
    };
    return [at('#file-search'), at('.favorite-button', 'right'), at('.materials .meta'), at('#upload-form')];
  });
  await writeFile(`${output}/pins.json`, JSON.stringify(pins, null, 2));
  await open('cards', 'Flashcards');
  await page.locator('[data-action="reveal"]').click();
  await page.locator('.app-main').screenshot({ path: `${output}/flashcards.png` });
  await open('practice', 'Treino');
  await page.locator('#practice-answer').fill('Identifico os elementos do problema.');
  await page.locator('[data-action="practice-reveal"]').click();
  await page.locator('.app-main').screenshot({ path: `${output}/treino.png` });
  await open('exam', 'Simulado');
  await page.locator('.app-main').screenshot({ path: `${output}/simulado.png` });
  await open('focus', 'Foco');
  await page.locator('.app-main').screenshot({ path: `${output}/foco.png` });
  await open('explain', 'Explicações');
  await page.locator('.explain-layout').screenshot({ path: `${output}/explicacoes.png` });
  await open('settings', 'Definições');
  await page.locator('.panel', { has: page.getByRole('heading', { name: 'A tua chave de IA' }) }).screenshot({ path: `${output}/chave-ia.png` });
} finally { await browser.close(); }
