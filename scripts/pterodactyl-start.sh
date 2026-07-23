#!/usr/bin/env bash
# =============================================================================
# NEXUS YT Bot — Pterodactyl Startup Script
#
# Handles binary dependencies (yt-dlp, ffmpeg) on first run, then builds and
# starts the bot-core Telegram process. Designed for the same Pterodactyl panel
# that runs the Solus Rift worker — no Docker image needed, just raw binaries
# downloaded on demand into ./bin.
#
# Pattern: download → verify → cache → add to PATH → npm install → build → start
# Same binary-fetch approach used by the Solus Rift worker (ytplay.js).
# =============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BIN_DIR="$ROOT_DIR/bin"
PATH="$BIN_DIR:$PATH"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log()  { echo "[nexus] $*"; }
err()  { echo "[nexus] ERROR: $*" >&2; exit 1; }

ensure_bin_dir() {
  mkdir -p "$BIN_DIR"
}

# ---------------------------------------------------------------------------
# 1a. yt-dlp — download from GitHub if not already on PATH
# ---------------------------------------------------------------------------
ensure_ytdlp() {
  if command -v yt-dlp &>/dev/null; then
    log "yt-dlp found on PATH: $(command -v yt-dlp)"
    return 0
  fi

  local target="$BIN_DIR/yt-dlp"

  if [[ -x "$target" ]]; then
    # Cache hit — verify it still works (same approach as Solus Rift's verifyBinary)
    local ver
    ver="$("$target" --version 2>/dev/null)" || true
    if [[ -n "$ver" ]]; then
      log "yt-dlp cached at $target (v$ver)"
      return 0
    fi
    log "yt-dlp binary invalid — re-downloading..."
    rm -f "$target"
  fi

  log "Downloading yt-dlp from GitHub..."
  ensure_bin_dir

  # Direct download — same URL pattern as Solus Rift's direct GitHub fallback
  local url="https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp"
  if ! curl -fsSL "$url" -o "$target"; then
    err "Failed to download yt-dlp from $url"
  fi

  chmod +x "$target"

  # Verify
  local ver
  ver="$("$target" --version 2>/dev/null)" || err "yt-dlp binary downloaded but --version failed"
  log "yt-dlp downloaded → $target (v$ver)"
}

# ---------------------------------------------------------------------------
# 1b. ffmpeg — download a static Linux x64 build if not already on PATH
#     Source: johnvansickle.com — reliable static builds used by many workers
# ---------------------------------------------------------------------------
ensure_ffmpeg() {
  if command -v ffmpeg &>/dev/null; then
    log "ffmpeg found on PATH: $(command -v ffmpeg)"
    return 0
  fi

  local target="$BIN_DIR/ffmpeg"

  if [[ -x "$target" ]]; then
    local ver
    ver="$("$target" -version 2>/dev/null | head -1)" || true
    if [[ -n "$ver" ]]; then
      log "ffmpeg cached at $target ($ver)"
      return 0
    fi
    log "ffmpeg binary invalid — re-downloading..."
    rm -f "$target"
  fi

  log "Downloading ffmpeg static build from johnvansickle.com..."
  ensure_bin_dir

  local archive="/tmp/ffmpeg-release-amd64-static.tar.xz"
  local url="https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"

  if ! curl -fsSL "$url" -o "$archive"; then
    err "Failed to download ffmpeg from $url"
  fi

  # Extract just the ffmpeg binary — archive contains a dated directory
  if ! tar -xJf "$archive" -C "$BIN_DIR" --strip-components=1 --wildcards '*/ffmpeg' 2>/dev/null; then
    # Fallback: try extracting without wildcards if the above fails
    local tmpdir
    tmpdir="$(mktemp -d)"
    tar -xJf "$archive" -C "$tmpdir"
    find "$tmpdir" -name 'ffmpeg' -type f -exec cp {} "$target" \;
    rm -rf "$tmpdir"
  fi

  rm -f "$archive"

  if [[ ! -f "$target" ]]; then
    err "ffmpeg extraction completed but ffmpeg binary not found in archive"
  fi

  chmod +x "$target"

  local ver
  ver="$("$target" -version 2>/dev/null | head -1)" || err "ffmpeg binary downloaded but -version failed"
  log "ffmpeg downloaded → $target ($ver)"
}

# ---------------------------------------------------------------------------
# 1c. npm install
# ---------------------------------------------------------------------------
run_npm_install() {
  log "Installing npm dependencies (workspaces)..."
  cd "$ROOT_DIR"
  if ! npm install --no-audit --no-fund; then
    err "npm install failed"
  fi
  log "npm install complete"
}

# ---------------------------------------------------------------------------
# 1d. Build workspaces in dependency order
# ---------------------------------------------------------------------------
run_build() {
  log "Building extraction..."
  cd "$ROOT_DIR"
  if ! npm run build --workspace=extraction 2>&1; then
    err "Build failed for extraction"
  fi

  log "Building ai-summarization..."
  if ! npm run build --workspace=ai-summarization 2>&1; then
    err "Build failed for ai-summarization"
  fi

  log "Building bot-core..."
  if ! npm run build --workspace=bot-core 2>&1; then
    err "Build failed for bot-core"
  fi

  log "All workspaces built successfully"
}

# ---------------------------------------------------------------------------
# 1e. Start bot-core
# ---------------------------------------------------------------------------
start_bot() {
  local entry="$ROOT_DIR/bot-core/dist/index.js"

  if [[ ! -f "$entry" ]]; then
    err "bot-core entry not found at $entry — did the build step succeed?"
  fi

  log "Starting bot-core: node $entry"
  cd "$ROOT_DIR"
  exec node "$entry"
}

# =============================================================================
# Main
# =============================================================================
log "=== NEXUS YT Bot — Pterodactyl Startup ==="
log "Root: $ROOT_DIR"

ensure_ytdlp
ensure_ffmpeg
run_npm_install
run_build
start_bot
