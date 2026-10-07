# Servers

These local servers give Television artifacts live access to files and notes. Bellhop starts services and mounts them under one address.

- [file-server](file-server/README.md) serves a directory over HTTP and WebSocket.
- [vault-server](vault-server/README.md) serves files and structured Markdown records.
- [Bellhop](bellhop/README.md) starts and mounts local HTTP services.

The [specification](spec/index.md) describes the Node server contracts and links to the Bellhop contract.

## Build and install

The Node packages are private npm workspaces, and the binaries are not published to npm. Node 24 and Go 1.22 are required. From a clone of made-for-tv:

```sh
cd made-for-tv/servers
./setup.sh
```

`setup.sh` installs npm dependencies, builds all three servers, and links `file-server`, `vault-server`, and `bellhop` into `~/.local/bin`. Pass another directory on your PATH as the first argument to put the links there. Run `npm run build` after pulling changes to rebuild the Node servers; run `go build -o bin/bellhop ./cmd/bellhop` in `bellhop/` to rebuild Bellhop.

To build and test without linking commands:

```sh
cd made-for-tv/servers
npm install
npm run build
npm test
cd bellhop
go build ./...
go test ./...
```

## Install the server skills

The skills CLI searches `skills/` when given the repository root. Point it at each server skill folder:

```sh
npx skills add https://github.com/rupertsworld/made-for-tv/tree/main/servers/file-server/skill
npx skills add https://github.com/rupertsworld/made-for-tv/tree/main/servers/vault-server/skill
```

The [repository MIT licence](../LICENSE) covers these servers.
