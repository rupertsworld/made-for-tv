#!/bin/sh
# Install dependencies, build the servers, and link their CLIs onto PATH.
# Bellhop is built only when Go is installed.
# Usage: ./setup.sh [bin-dir]    (default: ~/.local/bin)
set -e
cd "$(dirname "$0")"
BIN="${1:-$HOME/.local/bin}"
mkdir -p "$BIN"

npm install
npm run build

# Bellhop is optional and needs Go; skip it when Go is not installed.
BELLHOP=
if command -v go >/dev/null 2>&1; then
  mkdir -p bellhop/bin
  (cd bellhop && go build -o bin/bellhop ./cmd/bellhop)
  BELLHOP=1
else
  echo "skipped bellhop: Go is not installed (file-server and vault-server do not need it)"
fi

link() {
  ln -sf "$PWD/$1" "$BIN/$2"
  echo "linked $2 -> $1"
}
link file-server/dist/src/cli.js file-server
link vault-server/dist/src/cli.js vault-server
if [ -n "$BELLHOP" ]; then link bellhop/bin/bellhop bellhop; fi

case ":$PATH:" in
  *":$BIN:"*) ;;
  *) echo "note: $BIN is not on your PATH" ;;
esac
