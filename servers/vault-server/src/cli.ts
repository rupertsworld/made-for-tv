#!/usr/bin/env node
/** Parses the small CLI surface and starts vault-server. */
import { realpathSync, readFileSync } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { VaultServer } from "./server.ts";

export type CliOptions = { host: string; port?: number; vaultRoot: string };

const usage = `Usage: vault-server [path] [options]

Serve a live vault as files and structured markdown records.

  path         vault root (default: current directory)
  --host       bind address (default: 127.0.0.1)
  --port       port (default: 4747, or the next free port up to 4846; 0 for any free port)
  --help       show this help
  --version    print the version
`;
const version = readPackageVersion();

export function parseCliArguments(argumentsList: readonly string[]): CliOptions {
  let host = "127.0.0.1";
  let portText: string | undefined;
  let vaultRoot: string | undefined;

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--host") host = requireValue(argumentsList, ++index, argument);
    else if (argument === "--port") portText = requireValue(argumentsList, ++index, argument);
    else if (argument.startsWith("--")) throw new CliArgumentError(`unknown argument ${argument}`, true);
    else if (vaultRoot === undefined) vaultRoot = argument;
    else throw new CliArgumentError(`unknown argument ${argument}`, true);
  }

  if (portText !== undefined && !/^\d+$/.test(portText)) {
    throw new CliArgumentError("port must be a decimal integer from 0 to 65535");
  }
  const port = portText === undefined ? undefined : Number(portText);
  if (port !== undefined && port > 65_535) {
    throw new CliArgumentError("port must be a decimal integer from 0 to 65535");
  }
  return {
    host,
    ...(port === undefined ? {} : { port }),
    vaultRoot: resolve(expandLeadingTilde(vaultRoot ?? process.cwd())),
  };
}

export async function main(argumentsList = process.argv.slice(2)): Promise<void> {
  if (argumentsList.includes("--help")) { process.stdout.write(usage); return; }
  if (argumentsList.includes("--version")) { process.stdout.write(`${version}\n`); return; }

  const options = parseCliArguments(argumentsList);
  const canonicalRoot = await canonicalDirectory(options.vaultRoot);
  if (canonicalRoot === undefined) throw new Error(`${options.vaultRoot} is not a directory`);
  const vaultServer = new VaultServer({ root: canonicalRoot });
  try {
    await vaultServer.listen(options.port === undefined ? { host: options.host } : { host: options.host, port: options.port });
  } catch (error) {
    await vaultServer.close();
    if (isErrorCode(error, "EADDRINUSE")) throw new Error(`port ${options.port ?? 4747} is already in use`);
    throw error;
  }

  let recordCount = 0;
  for (const path of vaultServer.paths) if (path.endsWith(".md")) recordCount += 1;
  writeStartup(canonicalRoot, vaultServer.url as string, recordCount);
  const shutdown = (): void => {
    void vaultServer.close().catch(() => undefined).then(() => { process.exitCode = 0; });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

class CliArgumentError extends Error {
  readonly showUsage: boolean;
  constructor(message: string, showUsage = false) { super(message); this.showUsage = showUsage; }
}

function safeRealpath(path: string): string {
  try { return realpathSync(path); } catch { return path; }
}

function requireValue(values: readonly string[], index: number, flag: string): string {
  const value = values[index];
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new CliArgumentError(`${flag} requires a value`);
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

function writeStartup(vaultRoot: string, url: string, noteCount: number): void {
  const color = process.stdout.isTTY === true && process.env.NO_COLOR === undefined;
  const bold = (value: string): string => color ? `\x1b[1m${value}\x1b[22m` : value;
  const dim = (value: string): string => color ? `\x1b[2m${value}\x1b[22m` : value;
  const cyan = (value: string): string => color ? `\x1b[36m${value}\x1b[39m` : value;
  const count = noteCount.toLocaleString("en-US");
  process.stdout.write(`${bold("vault-server")} ${version}\n${dim("vault:")}  ${vaultRoot} ${dim(`(${count} records)`)}\n${dim("url:")}    ${cyan(url)}\n`);
}

function writeError(error: unknown): void {
  const color = process.stderr.isTTY === true && process.env.NO_COLOR === undefined;
  const prefix = color ? "\x1b[31mvault-server:\x1b[39m" : "vault-server:";
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${prefix} ${message}\n`);
  if (error instanceof CliArgumentError && error.showUsage) process.stderr.write(usage);
}

function readPackageVersion(): string {
  let directory = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    try {
      const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8")) as { name?: string; version?: string };
      if (manifest.name === "@rupertsworld/vault-server" && typeof manifest.version === "string") return manifest.version;
    } catch { /* Keep looking upward from source and built entry points. */ }
    const parent = dirname(directory);
    if (parent === directory) throw new Error("could not read vault-server version");
    directory = parent;
  }
}

function isErrorCode(error: unknown, code: string): boolean {
  return error !== null && typeof error === "object" && "code" in error && error.code === code;
}

// argv[1] is the bin symlink under npm link / global installs; realpath it,
// or the main-module check fails and the CLI silently does nothing.
if (import.meta.url === pathToFileURL(safeRealpath(process.argv[1] ?? "")).href) {
  void main().catch((error: unknown) => {
    writeError(error);
    process.exitCode = 1;
  });
}
