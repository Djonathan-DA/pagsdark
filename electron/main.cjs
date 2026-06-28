// Empacotamento como APLICATIVO DESKTOP (Electron).
// O Electron sobe o mesmo servidor local (src/server.js) num processo filho e
// abre uma janela apontando para ele. Ou seja: o app continua sendo o mesmo
// site — você edita os arquivos normalmente e as mudanças aparecem ao reabrir.
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

// Silencia o ruido do Chromium no terminal (ex.: "trust_store_mac.cc ... Error
// parsing certificate"): sao avisos inofensivos ao ler o chaveiro do macOS, nao
// afetam o app. log-level=3 mostra apenas erros fatais.
app.commandLine.appendSwitch('log-level', '3');
app.commandLine.appendSwitch('disable-features', 'MacKeychainLookup');

const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 4310;
const URL = `http://localhost:${PORT}`;
let serverProc = null;
let win = null;

function startServer() {
  // Usa o Node do sistema (a versão instalada no Mac tem o node:sqlite que o app usa).
  serverProc = spawn('node', [path.join(ROOT, 'src', 'server.js')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  serverProc.on('error', (e) => console.error('[electron] falha ao subir o servidor (Node instalado?):', e));
}

function waitForServer(cb, tries = 0) {
  http.get(URL + '/auth/config', () => cb())
    .on('error', () => {
      if (tries > 80) return cb(); // ~40s; abre mesmo assim
      setTimeout(() => waitForServer(cb, tries + 1), 500);
    });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 980, minHeight: 640,
    backgroundColor: '#0c0a09', title: 'PagsDark',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.loadURL(URL);
}

app.whenReady().then(() => {
  startServer();
  waitForServer(createWindow);
});

// Reabrir pelo Dock (macOS): garante o servidor de pé e recria a janela.
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length > 0) return;
  if (!serverProc) { startServer(); waitForServer(createWindow); }
  else createWindow();
});

function stopServer() { if (serverProc) { try { serverProc.kill(); } catch {} serverProc = null; } }
app.on('window-all-closed', () => {
  // No macOS o app continua no Dock; mantemos o servidor vivo para reabrir a
  // janela sem backend morto. Em Windows/Linux, encerra tudo.
  if (process.platform !== 'darwin') { stopServer(); app.quit(); }
});
app.on('quit', stopServer);
app.on('before-quit', stopServer);
