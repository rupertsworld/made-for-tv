#!/usr/bin/env node
import { realpathSync, readFileSync } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { readConfig } from "./config.ts";
import { FileServer } from "./server.ts";

export type CliOptions = { host: string; port?: number; root: string; ignore: string[] };

const usage = `Usage: file-server [path] [options]

Serve a live directory over HTTP and WebSocket: read, list, write, edit, delete.

  path         directory to serve (default: current directory)
  --host       bind address (default: 127.0.0.1)
  --port       port (default: 8765, or the next free port up to 8864; 0 for any free port)
  --ignore     hide paths matching a .gitignore pattern; repeatable (added to the config's ignore list)
  --help       show this help
  --version    print the version
`;
const version = readPackageVersion();

export function parseCliArguments(argumentsList: readonly string[]): CliOptions {
  let host = "127.0.0.1";
  let portText: string | undefined;
  let rootArgument: string | undefined;
  const ignore: string[] = [];

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--host") host = requireValue(argumentsList, ++index, argument);
    else if (argument === "--port") portText = requireValue(argumentsList, ++index, argument);
    else if (argument === "--ignore") ignore.push(requireValue(argumentsList, ++index, argument));
    else if (argument.startsWith("--")) throw new CliArgumentError(`unknown argument ${argument}`, true);
    else if (rootArgument === undefined) rootArgument = argument;
    else throw new CliArgumentError(`unknown argument ${argument}`, true);
  }

  if (host.length === 0) throw new CliArgumentError("host must be non-empty");
  if (portText !== undefined && !/^\d+$/.test(portText)) throw new CliArgumentError("port must be a decimal integer from 0 to 65535");
  const port = portText === undefined ? undefined : Number(portText);
  if (port !== undefined && port > 65_535) {
    throw new CliArgumentError("port must be a decimal integer from 0 to 65535");
  }
  return {
    host,
    ...(port === undefined ? {} : { port }),
    root: resolve(expandLeadingTilde(rootArgument ?? process.cwd())),
    ignore,
  };
}

export async function main(argumentsList = process.argv.slice(2)): Promise<void> {
  if (argumentsList.includes("--help")) { process.stdout.write(usage); return; }
  if (argumentsList.includes("--version")) { process.stdout.write(`${version}\n`); return; }

  const options = parseCliArguments(argumentsList);
  const config = await readConfig();
  const canonicalRoot = await canonicalDirectory(options.root);
  if (canonicalRoot === undefined) throw new Error(`${options.root} is not a directory`);

  // Flag patterns add to the config's for this run; neither replaces the other.
  const fileServer = new FileServer({ root: canonicalRoot, ignore: [...(config.ignore ?? []), ...options.ignore] });
  try {
    await fileServer.listen(options.port === undefined ? { host: options.host } : { host: options.host, port: options.port });
  } catch (error) {
    if (hasErrorCode(error, "EADDRINUSE")) throw new Error(`port ${options.port ?? 8765} is already in use`);
    throw error;
  }

  writeStartup(canonicalRoot, fileServer.url as string);
  const shutdown = (): void => {
    void fileServer.close().catch(() => undefined).then(() => { process.exitCode = 0; });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

class CliArgumentError extends Error {
  readonly showUsage: boolean;
  constructor(message: string, showUsage = false) { super(message); this.showUsage = showUsage; }
}

function requireValue(values: readonly string[], index: number, flag: string): string {
  const value = values[index];
  if (value === undefined || value.length === 0 || value.startsWith("--")) {
    throw new CliArgumentError(`${flag} requires a value`);
  }
  return value;
}

function expandLeadingTilde(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

async function canonicalDirectory(path: string): Promise<string | undefined> {
  try {
    const canonicalPath = await realpath(path);
    return (await stat(canonicalPath)).isDirectory() ? canonicalPath : undefined;
  } catch {
    return undefined;
  }
}

function writeStartup(root: string, url: string): void {
  const color = process.stdout.isTTY === true && process.env.NO_COLOR === undefined;
  const bold = (value: string): string => color ? `\x1b[1m${value}\x1b[22m` : value;
  const dim = (value: string): string => color ? `\x1b[2m${value}\x1b[22m` : value;
  const cyan = (value: string): string => color ? `\x1b[36m${value}\x1b[39m` : value;
  process.stdout.write(`${bold("file-server")} ${version}\n${dim("root:")}   ${root}\n${dim("url:")}    ${cyan(url)}\n`);
}

function writeError(error: unknown): void {
  const color = process.stderr.isTTY === true && process.env.NO_COLOR === undefined;
  const prefix = color ? "\x1b[31mfile-server:\x1b[39m" : "file-server:";
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${prefix} ${message}\n`);
  if (error instanceof CliArgumentError && error.showUsage) process.stderr.write(usage);
}

function readPackageVersion(): string {
  let directory = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    try {
      const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8")) as { name?: string; version?: string };
      if (manifest.name === "file-server" && typeof manifest.version === "string") return manifest.version;
    } catch { /* Search upward from both source and built entry points. */ }
    const parent = dirname(directory);
    if (parent === directory) throw new Error("could not read file-server version");
    directory = parent;
  }
}

function safeRealpath(path: string): string {
  try { return realpathSync(path); } catch { return path; }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return error !== null && typeof error === "object" && "code" in error && error.code === code;
}

if (import.meta.url === pathToFileURL(safeRealpath(process.argv[1] ?? "")).href) {
  void main().catch((error: unknown) => {
    writeError(error);
    process.exitCode = 1;
  });
}
