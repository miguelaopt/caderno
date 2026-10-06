import { app, BrowserWindow, dialog, session, shell } from 'electron';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import updater from 'electron-updater';

app.setName('Caderno');
app.setAppUserModelId('pt.caderno.desktop');

let server;
let mainWindow;
let product;
let ssoProtocol;

// Login pela página da instituição: no fim o browser devolve a chave ao Caderno por moodlemobile://,
// o protocolo da app móvel oficial. Só fica registado enquanto um login espera resposta.
function protocolClient(scheme) {
  let registered = false;
  // Em desenvolvimento (electron .) o Windows tem de abrir o Electron com o caminho da app.
  const set = () => process.defaultApp ? app.setAsDefaultProtocolClient(scheme, process.execPath, [app.getAppPath()])
    : app.setAsDefaultProtocolClient(scheme);
  const remove = () => process.defaultApp ? app.removeAsDefaultProtocolClient(scheme, process.execPath, [app.getAppPath()])
    : app.removeAsDefaultProtocolClient(scheme);
  return {
    register: () => (registered = set()),
    unregister: () => { if (registered) remove(); registered = false; },
  };
}

function localKey(dataDir) {
  const path = join(dataDir, 'encryption.key');
  if (!existsSync(path)) writeFileSync(path, randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
  const value = readFileSync(path, 'utf8').trim();
  if (!/^[0-9a-f]{64}$/i.test(value)) throw new Error('A chave local de proteção de dados está danificada.');
  return value;
}

function secureWindow(origin) {
  const window = new BrowserWindow({
    width: 1280, height: 850, minWidth: 820, minHeight: 600, title: 'Caderno', autoHideMenuBar: true,
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
    // mailto: abre o programa de email predefinido (ligação «Enviar email» no Sobre).
    if (target.protocol === 'https:' || target.protocol === 'mailto:') shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== origin) event.preventDefault();
  });
  window.loadURL(`${origin}/app`);
  return window;
}

// Atualizações a partir das releases do GitHub (só na app instalada). Os dados ficam em
// %APPDATA%\Caderno\Dados e Documentos\Caderno, que o instalador não toca.
function watchUpdates() {
  if (!app.isPackaged) return;
  const { autoUpdater } = updater;
  let asked = false;
  autoUpdater.on('error', (error) => console.error('Atualização:', error.message));
  autoUpdater.on('update-downloaded', async (info) => {
    if (asked) return;
    asked = true;
    const { response } = await dialog.showMessageBox(mainWindow, { type: 'info', buttons: ['Reiniciar agora', 'Mais tarde'],
      defaultId: 0, cancelId: 1, title: 'Atualização pronta', message: `O Caderno ${info.version} está pronto a instalar.`,
      detail: 'Os teus dados e materiais ficam onde estão. Se escolheres Mais tarde, a atualização é instalada quando fechares o Caderno.' });
    if (response === 0) autoUpdater.quitAndInstall();
  });
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  check();
  setInterval(check, 4 * 3600 * 1000).unref();
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
  process.env.CADERNO_VERSION = app.getVersion();
  const configPath = join(dataDir, 'config.json');
  process.env.DESKTOP_CONFIG_PATH = configPath;
  if (existsSync(configPath)) {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    if (typeof config.moodleUrl === 'string') process.env.MOODLE_URL = config.moodleUrl;
  }
  process.chdir(process.resourcesPath);
  product = await import('../scripts/product.mjs');
  server = product.server;
  ssoProtocol = protocolClient(product.SSO_SCHEME);
  product.useSsoProtocol(ssoProtocol);
  const address = await product.ready;
  const origin = `http://127.0.0.1:${address.port}`;
  // Perfil único: a sessão só existe nesta janela, nunca noutro browser do computador.
  await session.defaultSession.cookies.set({ url: origin, name: 'caderno_session', value: product.localSession(),
    httpOnly: true, sameSite: 'lax' });
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  mainWindow = secureWindow(origin);
  watchUpdates();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) mainWindow = secureWindow(origin); });
}

if (app.requestSingleInstanceLock()) {
  app.on('second-instance', (_event, commandLine) => {
    // O Windows abre uma segunda instância com o endereço moodlemobile://token=… do login.
    const ssoUrl = product && commandLine.find((arg) => arg.startsWith(`${product.SSO_SCHEME}://`));
    if (ssoUrl) product.finishSsoLogin(ssoUrl).catch((error) => console.error('Login pela instituição:', error.message));
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); }
  });
  app.whenReady().then(start).catch((error) => {
    dialog.showErrorBox('Não foi possível abrir o Caderno', error.message);
    app.quit();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { server?.close(); ssoProtocol?.unregister(); });
} else app.quit();
