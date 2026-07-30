import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const source = path.join(root, 'integrations');
const output = path.join(root, 'dist', 'integrations');
const extensionFiles = ['background.js', 'content.js', 'options.html', 'options.css', 'options.js'];

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTimestamp(date = new Date()) {
  const year = Math.max(date.getFullYear(), 1980);
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

async function zipFolder(folder, destination) {
  const names = (await fs.readdir(folder)).sort();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const stamp = dosTimestamp();
  for (const name of names) {
    const file = await fs.readFile(path.join(folder, name));
    const fileName = Buffer.from(name.replaceAll('\\', '/'));
    const crc = crc32(file);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(file.length, 18);
    local.writeUInt32LE(file.length, 22);
    local.writeUInt16LE(fileName.length, 26);
    localParts.push(local, fileName, file);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(stamp.time, 12);
    central.writeUInt16LE(stamp.date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(file.length, 20);
    central.writeUInt32LE(file.length, 24);
    central.writeUInt16LE(fileName.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, fileName);
    offset += local.length + fileName.length + file.length;
  }
  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  await fs.writeFile(destination, Buffer.concat([...localParts, ...centralParts, end]));
}

await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });
const chromeManifestPath = path.join(source, 'extension', 'manifest.chrome.json');
const firefoxManifestPath = path.join(source, 'extension', 'manifest.firefox.json');
const chromeManifest = JSON.parse(await fs.readFile(chromeManifestPath, 'utf8'));
const firefoxManifest = JSON.parse(await fs.readFile(firefoxManifestPath, 'utf8'));
if (chromeManifest.version !== firefoxManifest.version) {
  throw new Error(
    `Versioni integrazioni non allineate: Chrome ${chromeManifest.version}, Firefox ${firefoxManifest.version}.`,
  );
}
const integrationVersion = chromeManifest.version;
const panelTemplate = await fs.readFile(path.join(source, 'shared', 'panel.js'), 'utf8');
if (!panelTemplate.includes('__INTEGRATION_VERSION__')) {
  throw new Error('Segnaposto __INTEGRATION_VERSION__ mancante nel pannello condiviso.');
}
const panel = panelTemplate.replaceAll('__INTEGRATION_VERSION__', integrationVersion);

for (const browser of ['chrome', 'firefox']) {
  const folder = path.join(output, browser);
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, 'panel.js'), panel);
  await fs.copyFile(path.join(source, 'extension', `manifest.${browser}.json`), path.join(folder, 'manifest.json'));
  for (const file of extensionFiles) await fs.copyFile(path.join(source, 'extension', file), path.join(folder, file));
  await zipFolder(folder, path.join(output, `${browser}.zip`));
}

const userscriptHeader = `// ==UserScript==
// @name         PrestaShop Order Console
// @namespace    https://github.com/iosonofra/prestaord
// @version      ${integrationVersion}
// @description  Modifica i prodotti dell'ordine dalla pagina PrestaShop
// @match        http://*/*
// @match        https://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        window.onurlchange
// @connect      *
// @run-at       document-idle
// ==/UserScript==
`;
const bootstrap = await fs.readFile(path.join(source, 'userscript', 'bootstrap.js'), 'utf8');
await fs.writeFile(path.join(output, 'prestashop-order-console.user.js'), `${userscriptHeader}\n${panel}\n${bootstrap}\n`);
console.log(`Integrazioni generate in ${output}`);
