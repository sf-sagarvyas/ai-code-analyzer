// Downloads and unzips PMD 7 into ./bin/pmd so the static analyzer can shell
// out to it. Idempotent: skips if PMD is already present.
import { createWriteStream, existsSync, mkdirSync, rmSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

const PMD_VERSION = '7.7.0';
const PMD_URL = `https://github.com/pmd/pmd/releases/download/pmd_releases%2F${PMD_VERSION}/pmd-dist-${PMD_VERSION}-bin.zip`;

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const binDir = join(root, 'bin');
const pmdDir = join(binDir, 'pmd');
const zipPath = join(binDir, `pmd-${PMD_VERSION}.zip`);

if (existsSync(pmdDir)) {
  console.log(`PMD already present at ${pmdDir}. Skipping.`);
  process.exit(0);
}

await mkdir(binDir, { recursive: true });

console.log(`Downloading PMD ${PMD_VERSION} ...`);
await download(PMD_URL, zipPath);

console.log('Unzipping ...');
const tempExtract = join(binDir, '_pmd_extract');
if (existsSync(tempExtract)) rmSync(tempExtract, { recursive: true, force: true });
mkdirSync(tempExtract);

// Use PowerShell's Expand-Archive on Windows; fall back to `unzip` elsewhere.
if (process.platform === 'win32') {
  execFileSync('powershell.exe', [
    '-NoProfile',
    '-Command',
    `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${tempExtract}' -Force`,
  ], { stdio: 'inherit' });
} else {
  execFileSync('unzip', ['-q', zipPath, '-d', tempExtract], { stdio: 'inherit' });
}

// PMD zips into pmd-bin-<version>/. Rename to bin/pmd.
const { readdirSync, renameSync } = await import('node:fs');
const extracted = readdirSync(tempExtract).find((d) => d.startsWith('pmd-bin-'));
if (!extracted) {
  console.error('Could not find pmd-bin-* directory inside the zip.');
  process.exit(1);
}
renameSync(join(tempExtract, extracted), pmdDir);
rmSync(tempExtract, { recursive: true, force: true });
rmSync(zipPath, { force: true });

console.log(`PMD ${PMD_VERSION} installed at ${pmdDir}.`);

function download(url, dest) {
  return new Promise((resolveDone, reject) => {
    const get = (u) =>
      https.get(u, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${u}`));
        }
        pipeline(res, createWriteStream(dest)).then(resolveDone).catch(reject);
      });
    get(url).on('error', reject);
  });
}
