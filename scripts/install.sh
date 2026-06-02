#!/usr/bin/env bash
set -euo pipefail

REPO="https://github.com/mydisha/keirouter.git"
INSTALL_DIR="${KEIROUTER_DIR:-$HOME/.keirouter}"
BIN_DIR="${KEIROUTER_BIN_DIR:-/usr/local/bin}"

info()  { printf "\033[1;34m▸\033[0m %s\n" "$*"; }
ok()    { printf "\033[1;32m✓\033[0m %s\n" "$*"; }
die()   { printf "\033[1;31m✗ %s\033[0m\n" "$*" >&2; exit 1; }

# -- prerequisites --
for cmd in git go node npm; do
  command -v "$cmd" >/dev/null 2>&1 || die "$cmd is required but not found"
done

GO_VERSION=$(go version | grep -oE '[0-9]+\.[0-9]+' | head -1)
if [ "$(printf '%s\n' "1.22" "$GO_VERSION" | sort -V | head -1)" != "1.22" ]; then
  die "Go 1.22+ required (found $GO_VERSION)"
fi

# -- clone or update --
if [ -d "$INSTALL_DIR/.git" ]; then
  info "Updating KeiRouter in $INSTALL_DIR …"
  git -C "$INSTALL_DIR" pull --ff-only --quiet
else
  info "Cloning KeiRouter into $INSTALL_DIR …"
  git clone --depth 1 "$REPO" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"

# -- build frontend --
info "Building dashboard …"
cd frontend
npm ci --quiet
npm run build --silent
cd ..

# -- build backend --
info "Building keirouter binary …"
cd backend
CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o "$INSTALL_DIR/keirouter" ./cmd/keirouter
cd ..

# -- install binary --
if [ -w "$BIN_DIR" ]; then
  cp "$INSTALL_DIR/keirouter" "$BIN_DIR/keirouter"
  chmod +x "$BIN_DIR/keirouter"
else
  info "Need sudo to install to $BIN_DIR …"
  sudo cp "$INSTALL_DIR/keirouter" "$BIN_DIR/keirouter"
  sudo chmod +x "$BIN_DIR/keirouter"
fi

ok "KeiRouter installed to $BIN_DIR/keirouter"
echo ""
echo "  Quick start:"
echo "    keirouter                  # start the server on :20180"
echo "    keirouter -bootstrap       # create your first API key"
echo ""
echo "  Dashboard: http://localhost:20180  (default password: keirouter)"
echo "  Docs:      https://github.com/mydisha/keirouter"
