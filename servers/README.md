# Servers

These servers let a Television artifact read and change files on your computer, and update when the files change.

- [file-server](file-server/README.md) serves any folder over HTTP and WebSocket. The npm package is `@rupertsworld/file-server`.
- [vault-server](vault-server/README.md) serves a folder of Markdown notes and gives each note as JSON. The npm package is `@rupertsworld/vault-server`.

Follow [Get started with the servers](../README.md#get-started-with-the-servers) to run a server and install its skill. The [specification](spec/index.md) defines the server contracts.

## Develop

From a clone of made-for-tv, run these commands in `servers/` to install dependencies, build both servers, and run their tests:

```sh
npm install
npm run build
npm test
```

The [repository MIT licence](../LICENSE) covers these servers.
