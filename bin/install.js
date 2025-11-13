#!/usr/bin/env node

/**
 * @format
 *
 * Minimal uWebSockets.js installer
 * - Downloads and extracts uWS binary
 * - Tolerates missing optional dependencies
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import https from 'node:https';
import {pipeline} from 'node:stream/promises';

const VERSION = 'v20.56.0';
const GIT_REPO = 'uNetworking/uWebSockets.js';
const DOWNLOAD_URL = `https://codeload.github.com/${GIT_REPO}/tar.gz/refs/tags/${VERSION}`;
const TARGET_FILE = `uws_${process.platform}_${process.arch}_${process.versions.modules}.node`;

const __dirname = import.meta.dirname;
const ROOT = path.join(__dirname, '..');
const UWS_DIR = path.join(ROOT, 'uws');
const TGZ_PATH = path.join(ROOT, 'uws.tar.gz');

// If binary already exists, skip installation (helps Docker cache)
if (fs.existsSync(path.join(UWS_DIR, TARGET_FILE))) {
  console.log(`✓ uWebSockets.js already installed: ${TARGET_FILE}`);
  process.exit(0);
}

/** Files we want to keep */
const KEEP_FILES = new Set([
  'ESM_wrapper.mjs',
  'index.d.ts',
  // 'LICENSE',
  'package.json',
  'uws.js',
  TARGET_FILE,
]);

const ensureDir = dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive: true});
};

/** Native HTTPS downloader */
const downloadFile = async (url, dest) => {
  console.log(`⬇️  Downloading ${url}`);
  const file = fs.createWriteStream(dest);
  const response = await new Promise((resolve, reject) => {
    https.get(url, resolve).on('error', reject);
  });
  if (response.statusCode !== 200) {
    fs.unlinkSync(dest);
    throw new Error(`Download failed: ${response.statusCode}`);
  }
  await pipeline(response, file);
  console.log('✅ Download complete');
};

/** Minimal TAR extractor */
const extractTarGz = async (file, outDir) => {
  console.log('📦 Extracting package...');
  const gunzip = zlib.createGunzip();
  const chunks = [];
  await pipeline(fs.createReadStream(file), gunzip, async function* (src) {
    for await (const chunk of src) chunks.push(chunk);
  });
  const tarBuffer = Buffer.concat(chunks);
  const tempDir = path.join(outDir, '__temp__');
  fs.mkdirSync(tempDir, {recursive: true});

  // Manual TAR extraction
  let offset = 0;
  const BLOCK = 512;
  while (offset < tarBuffer.length) {
    const header = tarBuffer.slice(offset, offset + BLOCK);
    const name = header.toString('utf8', 0, 100).replace(/\0.*$/, '');
    if (!name) break;
    const size = parseInt(
      header.toString('utf8', 124, 136).replace(/\0.*$/, ''),
      8,
    );
    const type = header[156];
    const fileStart = offset + BLOCK;
    const fileEnd = fileStart + size;
    const target = path.join(tempDir, name);
    if (type === 53) {
      fs.mkdirSync(target, {recursive: true});
    } else if (type === 48) {
      fs.mkdirSync(path.dirname(target), {recursive: true});
      fs.writeFileSync(target, tarBuffer.slice(fileStart, fileEnd));
    }
    offset = fileEnd + (BLOCK - (size % BLOCK || BLOCK));
  }

  // Move only allowed files
  const nested = fs.readdirSync(tempDir)[0];
  const nestedPath = path.join(tempDir, nested);
  for (const fileName of fs.readdirSync(nestedPath)) {
    if (KEEP_FILES.has(fileName)) {
      fs.renameSync(
        path.join(nestedPath, fileName),
        path.join(outDir, fileName),
      );
    }
  }
  fs.rmSync(tempDir, {recursive: true, force: true});
};

/** Main installer — arrow function */
const installUws = async () => {
  try {
    console.log('🔧 Installing uWebSockets.js...');
    // Cleanup previous install
    fs.rmSync(UWS_DIR, {recursive: true, force: true});
    fs.rmSync(TGZ_PATH, {force: true});
    ensureDir(UWS_DIR);
    await downloadFile(DOWNLOAD_URL, TGZ_PATH);
    await extractTarGz(TGZ_PATH, UWS_DIR);
    fs.unlinkSync(TGZ_PATH);
    const finalBinary = path.join(UWS_DIR, TARGET_FILE);
    if (!fs.existsSync(finalBinary))
      throw new Error(`Missing binary: ${TARGET_FILE}`);
    console.log(`✅ Installed uWS binary: ${finalBinary}`);
  } catch (err) {
    console.error('❌ Installation failed:', err.message);
    process.exit(1);
  }
};

void installUws();
