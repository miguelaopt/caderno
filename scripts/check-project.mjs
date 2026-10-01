import { readdir, readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const mode = process.argv[2];
const sources = [...(await readdir('lib')).filter((name) => name.endsWith('.mjs')).map((name) => join('lib', name)),
  ...(await readdir('scripts')).filter((name) => name.endsWith('.mjs')).map((name) => join('scripts', name)),
  'web/product.js'];

if (mode === 'typecheck') {
  const result = spawnSync('node_modules/.bin/tsc', ['--project', 'tsconfig.json'], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

for (const file of sources) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status) process.exit(result.status);
}

if (mode === 'lint') {
  const productFiles = ['lib/product-db.mjs', 'lib/product-security.mjs', 'lib/product-sync.mjs', 'scripts/product.mjs', 'web/product.js'];
  for (const file of productFiles) {
    const source = await readFile(file, 'utf8');
    if (/MOODLE_PASSWORD|MOODLE_USER|eval\s*\(/.test(source)) throw new Error(`Uso proibido em ${file}`);
  }
  console.log(`Sintaxe e regras de segurança verificadas em ${sources.length} ficheiros.`);
} else if (mode === 'build') {
  const html = await readFile('web/product.html', 'utf8');
  for (const asset of ['/product.css', '/product.js', '/manifest.webmanifest']) {
    if (!html.includes(asset)) throw new Error(`O HTML não referencia ${asset}.`);
    await access(`web${asset}`);
  }
  JSON.parse(await readFile('web/manifest.webmanifest', 'utf8'));
  console.log('Aplicação estática e servidor prontos.');
} else throw new Error(`Modo desconhecido: ${mode}`);
