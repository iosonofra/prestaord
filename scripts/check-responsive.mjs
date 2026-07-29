import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const debugPort = Number(process.env.CHROME_DEBUG_PORT || 9333);
const targetUrl = process.argv[2] || 'http://127.0.0.1:3000/';
const widths = (process.argv[3] || '320,375,414,768,1024,1440')
  .split(',')
  .map(Number)
  .filter(Number.isFinite);
const targetNavigationLabel = process.argv[4] || '';
const targetActionLabel = process.argv[5] || '';
const targetInputId = process.argv[6] || '';
const targetInputValue = process.argv[7] || '';

if (typeof WebSocket === 'undefined') {
  throw new Error('Questo controllo richiede Node.js 22 o successivo.');
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function findPage(maxAttempts = 30) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const pages = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
      const page = pages.find((item) => item.type === 'page');
      if (page) return page;
    } catch {
      // Chrome may still be starting.
    }
    await delay(100);
  }
  throw new Error(`Chrome DevTools non disponibile sulla porta ${debugPort}.`);
}

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

let browserProcess = null;
let browserProfile = '';
let page;

try {
  page = await findPage(1);
} catch {
  const chromeExecutable = await findChromeExecutable();
  browserProfile = await fs.mkdtemp(path.join(os.tmpdir(), 'renamepresta-cdp-'));
  browserProcess = spawn(chromeExecutable, [
    '--headless=new',
    '--disable-gpu',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${browserProfile}`,
    'about:blank',
  ], { stdio: 'ignore' });
  process.on('exit', () => browserProcess?.kill());
  page = await findPage();
}

const socket = new WebSocket(page.webSocketDebuggerUrl);
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
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

const outputDirectory = path.join(os.tmpdir(), 'renamepresta-responsive');
await fs.mkdir(outputDirectory, { recursive: true });

const results = [];
for (const width of widths) {
  const height = width < 700 ? 812 : 900;
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 700,
  });
  await send('Page.navigate', { url: targetUrl });
  await delay(1200);
  if (targetNavigationLabel) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const target = [...document.querySelectorAll('.nav button')]
          .find((button) => button.getAttribute('aria-label') === ${JSON.stringify(targetNavigationLabel)});
        if (!target) return false;
        target.click();
        return true;
      })()`,
      returnByValue: true,
    });
    await delay(700);
  }
  if (targetActionLabel) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const target = [...document.querySelectorAll('button')]
          .find((button) => button.textContent.trim() === ${JSON.stringify(targetActionLabel)});
        if (!target) return false;
        target.click();
        return true;
      })()`,
      returnByValue: true,
    });
    await delay(300);
  }
  if (targetInputId && targetInputValue) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const input = document.getElementById(${JSON.stringify(targetInputId)});
        if (!input) return false;
        input.focus();
        const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        valueSetter.call(input, '');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`,
      returnByValue: true,
    });
    await delay(100);
    await send('Input.insertText', { text: targetInputValue });
    await delay(1200);
  }

  const evaluation = await send('Runtime.evaluate', {
    expression: `(() => {
      const viewportWidth = window.innerWidth;
      const selectors = [
        '.appShell', '.main', '.topbar', '.operationHeader',
        '.operationFilters', '.consoleGrid', '.productTemplatesPage',
        '.templateCatalogToolbar', '.templateTableWrap', '.templatePagination',
        'button:not([hidden])', 'input:not([hidden])', 'select:not([hidden])'
      ];
      const clipped = [...document.querySelectorAll(selectors.join(','))]
        .filter((element) => {
          const style = getComputedStyle(element);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && (rect.left < -1 || rect.right > viewportWidth + 1);
        })
        .map((element) => ({
          node: element.tagName.toLowerCase(),
          className: element.className || '',
          text: (element.textContent || '').trim().slice(0, 60),
          rect: {
            left: Math.round(element.getBoundingClientRect().left),
            right: Math.round(element.getBoundingClientRect().right)
          }
        }));
      const navigation = [...document.querySelectorAll('.nav button')].map((button) => ({
        ariaLabel: button.getAttribute('aria-label') || '',
        title: button.getAttribute('title') || '',
        ariaCurrent: button.getAttribute('aria-current') || '',
        iconsDecorative: [...button.querySelectorAll('svg')]
          .every((icon) => icon.getAttribute('aria-hidden') === 'true')
      }));
      const navigationPass = navigation.length >= 3
        && navigation.every((item) => item.ariaLabel && item.title && item.iconsDecorative)
        && navigation.filter((item) => item.ariaCurrent === 'page').length === 1;
      return {
        width: viewportWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        clipped,
        navigation,
        navigationPass
      };
    })()`,
    returnByValue: true,
  });

  const screenshot = await send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const screenshotPath = path.join(outputDirectory, `${width}.png`);
  await fs.writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));

  results.push({
    ...evaluation.result.value,
    screenshot: screenshotPath,
  });
}

socket.close();
if (browserProcess) {
  const exited = new Promise((resolve) => browserProcess.once('exit', resolve));
  browserProcess.kill();
  await exited;
}
if (browserProfile) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await fs.rm(browserProfile, { recursive: true, force: true });
      break;
    } catch (error) {
      if (error.code !== 'EBUSY' || attempt === 9) throw error;
      await delay(100);
    }
  }
}

for (const result of results) {
  const pass = result.documentScrollWidth <= result.width
    && result.clipped.length === 0
    && result.navigationPass;
  console.log(JSON.stringify({ pass, ...result }));
}

if (results.some((result) => (
  result.documentScrollWidth > result.width
  || result.clipped.length > 0
  || !result.navigationPass
))) {
  process.exitCode = 1;
}
