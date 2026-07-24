#!/usr/bin/env node
// =============================================================================
// NEXUS YT Bot — Startup Orchestrator
//
// Single entry point for the Spaceify/Pterodactyl panel. The panel runs:
//   npm install && node /home/container/${JS_FILE}
//
// This file is CommonJS (root package.json has no "type": "module") and uses
// only Node.js built-in modules — zero dependencies, zero build step.
// =============================================================================

'use strict';

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT_DIR = __dirname;
const BIN_DIR = path.join(ROOT_DIR, 'bin');

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------
function log(msg) {
  console.log(`[nexus] ${msg}`);
}

function exitErr(msg) {
  console.error(`[nexus] ERROR: ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// PATH helpers
// ---------------------------------------------------------------------------
function ensureBinDir() {
  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
  }
}

function addBinToPath() {
  if (!process.env.PATH.includes(BIN_DIR)) {
    process.env.PATH = `${BIN_DIR}:${process.env.PATH}`;
  }
}

// ---------------------------------------------------------------------------
// Architecture detection helpers
// Returns the correct release asset suffix for the current CPU arch.
// Deno and ffmpeg both publish per-arch builds; the generic "x86_64" won't
// work on arm64 or musl-based systems.
// ---------------------------------------------------------------------------

/**
 * Detect whether the system uses musl libc (Alpine Linux, etc.).
 * Checks for the musl dynamic linker path — reliable and fast.
 */
function isMusl() {
  return fs.existsSync('/lib/ld-musl-x86_64.so.1') ||
         fs.existsSync('/lib/ld-musl-aarch64.so.1') ||
         fs.existsSync('/lib/ld-musl-arm.so.1');
}

/**
 * Map os.arch() to the Deno release asset name for this system.
 * Deno publishes {arch}-unknown-linux-{libc}.zip builds.
 */
function denoAssetName() {
  const arch = os.arch();
  const libc = isMusl() ? 'musl' : 'gnu';
  switch (arch) {
    case 'x64':   return `deno-x86_64-unknown-linux-${libc}.zip`;
    case 'arm64': return `deno-aarch64-unknown-linux-${libc}.zip`;
    default:
      exitErr(`No Deno release available for architecture: ${arch}. ` +
              `Expected "x64" or "arm64". Cannot download Deno JS runtime.`);
  }
}

/**
 * Map os.arch() to the ffmpeg static build archive name from johnvansickle.com.
 */
function ffmpegAssetName() {
  const arch = os.arch();
  switch (arch) {
    case 'x64':   return 'ffmpeg-release-amd64-static.tar.xz';
    case 'arm64': return 'ffmpeg-release-arm64-static.tar.xz';
    default:
      exitErr(`No ffmpeg static build available for architecture: ${arch}. ` +
              `Expected "x64" or "arm64". Cannot download ffmpeg.`);
  }
}

/**
 * Log plus return the architecture string for diagnostic use in errors.
 */
function detectedArch() {
  const arch = os.arch();
  const plat = os.platform();
  const musl = isMusl() ? ' (musl)' : '';
  return `${arch}, ${plat}${musl}`;
}

// ---------------------------------------------------------------------------
// Binary helpers
// ---------------------------------------------------------------------------

/**
 * Check whether a command is available on the current system PATH.
 * Uses `command -v` which is POSIX-compliant (works in /bin/sh on any Linux).
 */
function commandExists(cmd) {
  try {
    execSync(`command -v "${cmd}"`, { stdio: 'pipe' });
    return true;
  } catch (_) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 1a. yt-dlp — download from GitHub if not on PATH or cached in ./bin
// ---------------------------------------------------------------------------
function ensureYtdlp() {
  if (commandExists('yt-dlp')) {
    const which = execSync('command -v yt-dlp', { encoding: 'utf8' }).trim();
    log(`yt-dlp found on PATH: ${which}`);
    return;
  }

  const target = path.join(BIN_DIR, 'yt-dlp');

  if (fs.existsSync(target)) {
  try {
    const ver = execSync(`"${target}" --version`, { encoding: 'utf8' }).trim();
    log(`yt-dlp cached at ${target} (v${ver})`);
    return;
  } catch (_) {
    log('yt-dlp binary invalid — re-downloading...');
    fs.unlinkSync(target);
  }
}

log('Downloading yt-dlp from GitHub...');
ensureBinDir();

// Note: yt-dlp's generic Linux binary is a zipimport/Python-based executable,
// not a standalone native binary, so it is NOT architecture-specific.
// It requires Python 3 on PATH. If Python is missing, the binary will fail
// with a different error (unrelated to CPU arch).
const url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

try {
  execSync(`curl -fsSL "${url}" -o "${target}"`, { stdio: 'inherit' });
} catch (_) {
  exitErr(`Failed to download yt-dlp from ${url}`);
}

fs.chmodSync(target, 0o755);

try {
  const ver = execSync(`"${target}" --version`, { encoding: 'utf8' }).trim();
  log(`yt-dlp downloaded → ${target} (v${ver})`);
} catch (_) {
  exitErr(`yt-dlp binary downloaded but --version failed (arch: ${detectedArch()})`);
}
}

// ---------------------------------------------------------------------------
// 1b. ffmpeg — download static Linux x64 build if not on PATH or cached
//      Source: johnvansickle.com (reliable static builds, same as shell script)
// ---------------------------------------------------------------------------
function ensureFfmpeg() {
  if (commandExists('ffmpeg')) {
    const which = execSync('command -v ffmpeg', { encoding: 'utf8' }).trim();
    log(`ffmpeg found on PATH: ${which}`);
    return;
  }

  const target = path.join(BIN_DIR, 'ffmpeg');

  if (fs.existsSync(target)) {
    try {
      const ver = execSync(`"${target}" -version`, { encoding: 'utf8' })
        .split('\n')[0]
        .trim();
      log(`ffmpeg cached at ${target} (${ver})`);
      return;
    } catch (_) {
      log('ffmpeg binary invalid — re-downloading...');
      fs.unlinkSync(target);
    }
  }

  log('Downloading ffmpeg static build from johnvansickle.com...');
  ensureBinDir();

  const assetName = ffmpegAssetName();
  const archive = `/tmp/${assetName}`;
  const url = `https://johnvansickle.com/ffmpeg/releases/${assetName}`;

  try {
    execSync(`curl -fsSL "${url}" -o "${archive}"`, { stdio: 'inherit' });
  } catch (_) {
    exitErr(`Failed to download ffmpeg from ${url}`);
  }

  // Extract just the ffmpeg binary — archive contains a dated directory
  const extractCmd =
    `tar -xJf "${archive}" -C "${BIN_DIR}" --strip-components=1 --wildcards '*/ffmpeg'`;
  try {
    execSync(extractCmd, { stdio: 'inherit' });
  } catch (_) {
    // Fallback: extract to temp dir and find ffmpeg manually
    log('Trying alternative extraction method...');
    const tmpdir = execSync('mktemp -d', { encoding: 'utf8' }).trim();
    try {
      execSync(`tar -xJf "${archive}" -C "${tmpdir}"`, { stdio: 'inherit' });
      execSync(`find "${tmpdir}" -name 'ffmpeg' -type f -exec cp {} "${target}" \\;`, {
        stdio: 'inherit',
      });
    } finally {
      execSync(`rm -rf "${tmpdir}"`, { stdio: 'pipe' });
    }
  }

  try {
    fs.unlinkSync(archive);
  } catch (_) {
    // non-fatal
  }

  if (!fs.existsSync(target)) {
    exitErr('ffmpeg extraction completed but ffmpeg binary not found in archive');
  }

  fs.chmodSync(target, 0o755);

  try {
    const ver = execSync(`"${target}" -version`, { encoding: 'utf8' })
      .split('\n')[0]
      .trim();
    log(`ffmpeg downloaded → ${target} (${ver})`);
  } catch (_) {
    exitErr(`ffmpeg binary downloaded but -version failed (arch: ${detectedArch()})`);
  }
}

// ---------------------------------------------------------------------------
// 1c. deno — download deno for yt-dlp's JS challenge solver
//      YouTube requires executing a JavaScript "n challenge" to unlock format
//      URLs. yt-dlp uses deno as its default JS runtime for this.
//      Source: GitHub releases (linux-x86_64 zip)
// ---------------------------------------------------------------------------
function ensureDeno() {
  if (commandExists('deno')) {
    const which = execSync('command -v deno', { encoding: 'utf8' }).trim();
    log(`deno found on PATH: ${which}`);
    return;
  }

  const target = path.join(BIN_DIR, 'deno');

  if (fs.existsSync(target)) {
    try {
      const ver = execSync(`"${target}" --version`, { encoding: 'utf8' })
        .split('\n')[0]
        .trim();
      log(`deno cached at ${target} (${ver})`);
      return;
    } catch (_) {
      log('deno binary invalid — re-downloading...');
      fs.unlinkSync(target);
    }
  }

  log('Downloading deno from GitHub...');
  ensureBinDir();

  const assetName = denoAssetName();
  const archive = `/tmp/${assetName}`;
  const url = `https://github.com/denoland/deno/releases/latest/download/${assetName}`;

  try {
    execSync(`curl -fsSL "${url}" -o "${archive}"`, { stdio: 'inherit' });
  } catch (_) {
    exitErr(`Failed to download deno from ${url}`);
  }

  // Extract just the deno binary from the zip
  try {
    execSync(`unzip -j "${archive}" "deno" -d "${BIN_DIR}"`, { stdio: 'inherit' });
  } catch (_) {
    exitErr('Failed to extract deno from zip archive');
  }

  try {
    fs.unlinkSync(archive);
  } catch (_) {
    // non-fatal
  }

  if (!fs.existsSync(target)) {
    exitErr('deno extraction completed but deno binary not found in archive');
  }

  fs.chmodSync(target, 0o755);

  try {
    const ver = execSync(`"${target}" --version`, { encoding: 'utf8' })
      .split('\n')[0]
      .trim();
    log(`deno downloaded → ${target} (${ver})`);
  } catch (_) {
    exitErr(`deno binary downloaded but --version failed (arch: ${detectedArch()})`);
  }
}

// ---------------------------------------------------------------------------
// 2. Build workspaces in dependency order
//    extraction → ai-summarization → bot-core
// ---------------------------------------------------------------------------
function runBuilds() {
  log('Building extraction...');
  execSync('npm run build --workspace=extraction', { cwd: ROOT_DIR, stdio: 'inherit' });

  log('Building ai-summarization...');
  execSync('npm run build --workspace=ai-summarization', { cwd: ROOT_DIR, stdio: 'inherit' });

  log('Building bot-core...');
  execSync('npm run build --workspace=bot-core', { cwd: ROOT_DIR, stdio: 'inherit' });

  log('All workspaces built successfully');
}

// ---------------------------------------------------------------------------
// 3. Start bot-core as long-running foreground process
//    Use spawn (not execSync) so the panel can track the PID correctly.
// ---------------------------------------------------------------------------
function startBot() {
  const entry = path.join(ROOT_DIR, 'bot-core', 'dist', 'index.js');

  if (!fs.existsSync(entry)) {
    exitErr(`bot-core entry not found at ${entry} — did the build step succeed?`);
  }

  log(`Starting bot-core: node ${entry}`);

  const child = spawn(process.execPath, [entry], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    env: { ...process.env },
  });

  // Forward termination signals so the panel can stop the bot cleanly
  process.on('SIGTERM', () => { child.kill('SIGTERM'); });
  process.on('SIGINT', () => { child.kill('SIGINT'); });

  child.on('exit', (code, signal) => {
    log(`bot-core exited (code: ${code}, signal: ${signal})`);
    process.exit(code != null ? code : 1);
  });
}

// =============================================================================
// Main
// =============================================================================
log('=== NEXUS YT Bot — Startup Orchestrator ===');
log(`Root: ${ROOT_DIR}`);
log(`Detected architecture: ${os.arch()}, platform: ${os.platform()}${isMusl() ? ' (musl)' : ''}`);

ensureYtdlp();
ensureFfmpeg();
ensureDeno();
addBinToPath();
runBuilds();
startBot();
