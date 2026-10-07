#!/bin/sh
# Install dependencies, build all three servers, and link their CLIs onto PATH.
# Usage: ./setup.sh [bin-dir]    (default: ~/.local/bin)
set -e
cd "$(dirname "$0")"
BIN="${1:-$HOME/.local/bin}"
mkdir -p "$BIN"

npm install
npm run build
mkdir -p bellhop/bin
(cd bellhop && go build -o bin/bellhop ./cmd/bellhop)

link() {
  ln -sf "$PWD/$1" "$BIN/$2"
  echo "linked $2 -> $1"
}
link file-server/dist/src/cli.js file-server
link vault-server/dist/src/cli.js vault-server
link bellhop/bin/bellhop bellhop

case ":$PATH:" in
  *":$BIN:"*) ;;
  *) echo "note: $BIN is not on your PATH" ;;
esac
