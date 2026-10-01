#!/usr/bin/env node
// Capturas reais da aplicação com a base fictícia criada por seed-screenshot.mjs.
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { strictEqual } from 'node:assert';

const [base, token, output] = process.argv.slice(2);
if (!base?.startsWith('http://127.0.0.1:') || !token || !output?.startsWith('/tmp/caderno-shot.'))
  throw new Error('Uso: capture-screenshots <url-local> <sessao-ficticia> </tmp/caderno-shot...>');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, locale: 'pt-PT' });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Chegas a casa e já sabes o que estudar.' }).waitFor();
  await page.screenshot({ path: `${output}/landing.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/landing-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.context().addCookies([{ name: 'caderno_session', value: token,
    url: base, httpOnly: true, sameSite: 'Lax' }]);
  await page.goto(`${base}/app`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Hoje', exact: true }).waitFor();
  await page.screenshot({ path: `${output}/hoje.png`, fullPage: true });
  await page.locator('[data-screen="files"]').click();
  await page.getByRole('heading', { name: 'Materiais' }).waitFor();
  await page.locator('#file-search').fill('normalizacao');
  strictEqual(await page.locator('.material-item:visible').count(), 1, 'pesquisa ignora acentos');
  await page.locator('#file-search').fill('');
  const favorite = page.locator('.material-item [data-favorite-file]').first();
  if (await favorite.getAttribute('aria-pressed') !== 'true') await favorite.click();
  await page.locator('.material-item [data-favorite-file][aria-pressed="true"]').waitFor();
  await page.locator('#favorites-only').check();
  strictEqual(await page.locator('.material-item:visible').count(), 1, 'filtro de favoritos');
  await page.locator('#favorites-only').uncheck();
  await page.screenshot({ path: `${output}/materiais.png`, fullPage: true });
  await page.locator('[data-screen="courses"]').click();
  await page.getByRole('heading', { name: 'Cadeiras', exact: true }).waitFor();
  await page.screenshot({ path: `${output}/cadeiras.png`, fullPage: true });
  await page.locator('[data-screen="explain"]').click();
  await page.getByRole('heading', { name: 'Explicações', exact: true }).waitFor();
  await page.screenshot({ path: `${output}/explicacoes.png`, fullPage: true });
  await page.locator('[data-screen="cards"]').click();
  await page.getByRole('heading', { name: 'Flashcards', exact: true }).waitFor();
  await page.locator('[data-action="reveal"]').click();
  await page.screenshot({ path: `${output}/flashcards.png`, fullPage: true });
  await page.locator('[data-screen="practice"]').click();
  await page.getByRole('heading', { name: 'Treino', exact: true }).waitFor();
  await page.locator('#practice-answer').fill('Identifico os elementos do problema.');
  await page.locator('[data-action="practice-reveal"]').click();
  await page.getByText('Resposta de referência').waitFor();
  await page.screenshot({ path: `${output}/treino.png`, fullPage: true });
  await page.locator('[data-screen="focus"]').click();
  await page.getByRole('heading', { name: 'Foco', exact: true }).waitFor();
  await page.locator('[data-action="focus-start"]').click();
  await page.waitForTimeout(1200);
  strictEqual(await page.locator('#focus-clock').textContent() !== '25:00', true, 'o temporizador avança');
  await page.locator('[data-action="focus-pause"]').click();
  await page.screenshot({ path: `${output}/foco.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-screen="today"]').click();
  await page.getByRole('heading', { name: 'Hoje', exact: true }).waitFor();
  await page.screenshot({ path: `${output}/hoje-mobile.png`, fullPage: true });
  await page.locator('[data-screen="files"]').click();
  await page.getByRole('heading', { name: 'Materiais' }).waitFor();
  await page.screenshot({ path: `${output}/materiais-mobile.png`, fullPage: true });
  await page.locator('[data-screen="explain"]').click();
  await page.getByRole('heading', { name: 'Explicações', exact: true }).waitFor();
  await page.screenshot({ path: `${output}/explicacoes-mobile.png`, fullPage: true });
  await page.locator('[data-screen="focus"]').click();
  await page.getByRole('heading', { name: 'Foco', exact: true }).waitFor();
  await page.screenshot({ path: `${output}/foco-mobile.png`, fullPage: true });
} finally { await browser.close(); }
