# Servers

These servers let a Television artifact read and change files on your computer, and update as soon as the files change.

- [file-server](file-server/README.md) serves any folder over HTTP and WebSocket.
- [vault-server](vault-server/README.md) serves a folder of Markdown notes, and also gives each note as JSON.
- [Bellhop](bellhop/README.md) is optional: it runs several servers under one address.

To install one and use it from an artifact, follow [Get started with the servers](../README.md#get-started-with-the-servers) in the repository README. The [specification](spec/index.md) describes the file-server and vault-server contracts and links to the Bellhop contract.

## Build and install

From a clone of made-for-tv:

```sh
cd made-for-tv/servers
./setup.sh
```

`setup.sh` needs Node.js 24 or later. It installs the npm dependencies, builds file-server and vault-server, and links the `file-server` and `vault-server` commands into `~/.local/bin`. When [Go](https://go.dev) 1.22 or later is installed, it also builds Bellhop and links `bellhop`. To put the links in another folder on your PATH, pass it as the first argument: `./setup.sh ~/bin`.

After pulling changes, run `npm run build` here to rebuild the Node servers, and `go build -o bin/bellhop ./cmd/bellhop` in `bellhop/` to rebuild Bellhop. The links keep working.

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

Each server's skill is in its `skill/` folder. Install one with the skills CLI:

```sh
npx skills add rupertsworld/made-for-tv --skill file-server
npx skills add rupertsworld/made-for-tv --skill vault-server
```

Without `--skill`, the CLI lists every made-for-tv skill, with these two under Server Skills.

The [repository MIT licence](../LICENSE) covers these servers.
