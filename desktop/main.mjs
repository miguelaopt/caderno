import { app, BrowserWindow, dialog, session, shell } from 'electron';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

app.setName('Caderno');
app.setAppUserModelId('pt.caderno.desktop');

let server;
let mainWindow;

function localKey(dataDir) {
  const path = join(dataDir, 'encryption.key');
  if (!existsSync(path)) writeFileSync(path, randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
  const value = readFileSync(path, 'utf8').trim();
  if (!/^[0-9a-f]{64}$/i.test(value)) throw new Error('A chave local de proteção de dados está danificada.');
  return value;
}

function secureWindow(origin) {
  const window = new BrowserWindow({
    width: 1280, height: 850, minWidth: 760, minHeight: 580, title: 'Caderno',
    backgroundColor: '#111b1c', icon: fileURLToPath(new URL('../web/icon-512.png', import.meta.url)),
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true },
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    let target;
    try { target = new URL(url); } catch { return { action: 'deny' }; }
    if (target.origin === origin && target.pathname === '/material')
      return { action: 'allow', overrideBrowserWindowOptions: {
        title: 'PDF · Caderno', width: 1100, height: 800,
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, plugins: true },
      } };
    if (target.protocol === 'https:') shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== origin) event.preventDefault();
  });
  window.loadURL(`${origin}/app`);
  return window;
}

async function start() {
  const dataDir = join(app.getPath('userData'), 'Dados');
  const materialsDir = join(app.getPath('documents'), 'Caderno', 'Materiais');
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  mkdirSync(materialsDir, { recursive: true, mode: 0o700 });
  process.env.TOKEN_ENCRYPTION_KEY = localKey(dataDir);
  process.env.PRODUCT_DB_PATH = join(dataDir, 'product.db');
  process.env.PRODUCT_FILES_DIR = materialsDir;
  process.env.HOST = '127.0.0.1';
  process.env.PORT = '0';
  process.env.NODE_ENV = 'desktop';
  process.env.ENABLE_HOSTED_BILLING = 'false';
  const configPath = join(dataDir, 'config.json');
  process.env.DESKTOP_CONFIG_PATH = configPath;
  if (existsSync(configPath)) {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    if (typeof config.moodleUrl === 'string') process.env.MOODLE_URL = config.moodleUrl;
  }
  process.chdir(process.resourcesPath);
  const product = await import('../scripts/product.mjs');
  server = product.server;
  const address = await product.ready;
  const origin = `http://127.0.0.1:${address.port}`;
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  mainWindow = secureWindow(origin);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) mainWindow = secureWindow(origin); });
}

if (app.requestSingleInstanceLock()) {
  app.on('second-instance', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
  app.whenReady().then(start).catch((error) => {
    dialog.showErrorBox('Não foi possível abrir o Caderno', error.message);
    app.quit();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => server?.close());
} else app.quit();
