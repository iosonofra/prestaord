import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const distRoot = path.join(root, 'dist');
const packageName = 'prestashop-order-product-swapper-alpine';
const stage = path.join(distRoot, packageName);
const destination = path.join(distRoot, `${packageName}.zip`);

const sourceDirectories = [
  'deploy',
  'docs',
  'frontend',
  'integrations',
  'public',
  'scripts',
  'src',
];

const sourceFiles = [
  '.env.example',
  '.gitignore',
  'INSTALL_ALPINE.md',
  'README.md',
  'package-lock.json',
  'package.json',
  'templates_export.csv',
];

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

async function listFiles(directory, prefix = '') {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(absolutePath, relativePath));
    else if (entry.isFile()) files.push({ absolutePath, relativePath });
  }
  return files;
}

async function zipFolder(folder, zipPath) {
  const entries = await listFiles(folder);
  const localParts = [];
  const centralParts = [];
  const stamp = dosTimestamp();
  let offset = 0;

  for (const entry of entries) {
    const file = await fs.readFile(entry.absolutePath);
    const fileName = Buffer.from(entry.relativePath.replaceAll('\\', '/'));
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
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  await fs.writeFile(zipPath, Buffer.concat([...localParts, ...centralParts, end]));
  return entries.length;
}

await fs.rm(stage, { recursive: true, force: true });
await fs.rm(destination, { force: true });
await fs.mkdir(stage, { recursive: true });

for (const directory of sourceDirectories) {
  await fs.cp(path.join(root, directory), path.join(stage, directory), { recursive: true });
}
for (const file of sourceFiles) {
  await fs.copyFile(path.join(root, file), path.join(stage, file));
}

await fs.mkdir(path.join(stage, 'dist'), { recursive: true });
await fs.cp(path.join(distRoot, 'app'), path.join(stage, 'dist', 'app'), { recursive: true });
await fs.cp(path.join(distRoot, 'integrations'), path.join(stage, 'dist', 'integrations'), { recursive: true });

await fs.writeFile(path.join(stage, 'RELEASE_ALPINE.txt'), [
  'PrestaShop Order Console - pacchetto Alpine',
  `Generato: ${new Date().toISOString()}`,
  'Integrazioni browser: 1.3.3',
  '',
  'Aggiornamento di una installazione Git esistente:',
  '  git pull --ff-only',
  '  npm ci --omit=dev',
  '  rc-service prestashop-order-console restart',
  '',
  'Non estrarre questo ZIP sopra una installazione Git esistente.',
  'I dati locali (.env, app-config.json, cache, log e backup) non sono inclusi.',
  '',
].join('\n'), 'utf8');

const fileCount = await zipFolder(stage, destination);
console.log(`Pacchetto Alpine creato: ${destination}`);
console.log(`File inclusi: ${fileCount}`);
