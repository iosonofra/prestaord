import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const port = Number(process.env.DIALOG_CHECK_PORT || 3137);
const debugPort = Number(process.env.DIALOG_CHECK_DEBUG_PORT || 9444);
const projectRoot = path.resolve(import.meta.dirname, '..');
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function findChromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : '',
    process.platform === 'win32' ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' : '',
    process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '',
    process.platform === 'linux' ? '/usr/bin/google-chrome' : '',
    process.platform === 'linux' ? '/usr/bin/chromium' : '',
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next known browser path.
    }
  }
  throw new Error('Chrome/Edge non trovato. Imposta CHROME_PATH con il percorso del browser.');
}

async function waitForServer(url, maxAttempts = 50) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The isolated server may still be starting.
    }
    await delay(100);
  }
  throw new Error(`Server di test non disponibile su ${url}.`);
}

async function findPage(maxAttempts = 40) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const pages = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
      const page = pages.find((item) => item.type === 'page');
      if (page) return page;
    } catch {
      // The browser may still be starting.
    }
    await delay(100);
  }
  throw new Error(`Chrome DevTools non disponibile sulla porta ${debugPort}.`);
}

async function removeDirectory(directory) {
  if (!directory) return;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await fs.rm(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      if (error.code !== 'EBUSY' || attempt === 9) throw error;
      await delay(100);
    }
  }
}

const dataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'renamepresta-dialog-data-'));
const browserProfile = await fs.mkdtemp(path.join(os.tmpdir(), 'renamepresta-dialog-cdp-'));
let serverProcess;
let browserProcess;
let socket;

try {
  await fs.writeFile(
    path.join(dataDirectory, 'app-config.json'),
    `${JSON.stringify({ appPassword: 'dialog-test-password' }, null, 2)}\n`,
    'utf8',
  );

  serverProcess = spawn(process.execPath, ['src/server.js'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      APP_DATA_DIR: dataDirectory,
    },
    stdio: 'ignore',
  });
  await waitForServer(`http://127.0.0.1:${port}/api/health`);

  const chromeExecutable = await findChromeExecutable();
  browserProcess = spawn(chromeExecutable, [
    '--headless=new',
    '--disable-gpu',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${browserProfile}`,
    'about:blank',
  ], { stdio: 'ignore' });

  const page = await findPage();
  socket = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map();
  let messageId = 0;

  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });

  function send(method, params = {}) {
    const id = ++messageId;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  }

  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true });
    return result.result.value;
  }

  async function pressTab(shift = false) {
    const modifiers = shift ? 8 : 0;
    await send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      key: 'Tab',
      code: 'Tab',
      windowsVirtualKeyCode: 9,
      modifiers,
    });
    await send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Tab',
      code: 'Tab',
      windowsVirtualKeyCode: 9,
      modifiers,
    });
    await delay(50);
  }

  await send('Page.navigate', { url: `http://127.0.0.1:${port}/` });
  await delay(1200);

  const semantics = await evaluate(`(() => {
    const backdrop = document.querySelector('.modalBackdrop');
    const dialog = document.querySelector('[role="dialog"]');
    const input = document.querySelector('#unlockPassword');
    return {
      dialogPresent: Boolean(dialog),
      modal: dialog?.getAttribute('aria-modal') === 'true',
      labelled: dialog?.getAttribute('aria-labelledby') === 'unlockTitle',
      described: dialog?.getAttribute('aria-describedby') === 'unlockDescription',
      neutralBackdrop: Boolean(backdrop)
        && !backdrop.hasAttribute('role')
        && !backdrop.hasAttribute('aria-hidden'),
      initialFocus: document.activeElement === input
    };
  })()`);

  await pressTab();
  const forwardFocus = await evaluate(`document.activeElement?.type === 'submit'`);
  await pressTab();
  const forwardWrap = await evaluate(`document.activeElement?.id === 'unlockPassword'`);
  await pressTab(true);
  const backwardWrap = await evaluate(`document.activeElement?.type === 'submit'`);
  const escapedFocusRecovered = await evaluate(`(() => {
    const outside = document.createElement('button');
    outside.id = 'outsideFocusTarget';
    document.body.append(outside);
    outside.focus();
    const recovered = document.querySelector('[role="dialog"]')?.contains(document.activeElement);
    outside.remove();
    return Boolean(recovered);
  })()`);

  const result = {
    ...semantics,
    forwardFocus,
    forwardWrap,
    backwardWrap,
    escapedFocusRecovered,
  };
  const pass = Object.values(result).every(Boolean);
  console.log(JSON.stringify({ pass, ...result }));
  if (!pass) process.exitCode = 1;
} finally {
  socket?.close();
  browserProcess?.kill();
  serverProcess?.kill();
  await delay(100);
  await removeDirectory(browserProfile);
  await removeDirectory(dataDirectory);
}
