// The file-server config file, ~/.config/file-server/config.json (spec/cli.md#config
// and spec/file-server/cli.md#config). The binary only reads it. Its one optional
// member, `ignore`, is an array of .gitignore patterns whose paths the server
// hides.
//
// A missing file is an empty config. A file that cannot be read, is not JSON,
// or is not exactly the documented shape is an error naming the file, never a
// silent fallback: a mistyped config that quietly ignored nothing would expose
// paths the user meant to hide and watch trees the user meant to skip.
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/** The stored file-server config; every member is optional. */
export type FilesConfig = { ignore?: string[] };

/**
 * Reads the config from the invoking user's home directory. Resolves with an
 * empty config when the file does not exist, and throws an error naming the
 * file when it is unreadable, malformed, or not the documented shape.
 */
export async function readConfig(): Promise<FilesConfig> {
  const path = join(homedir(), ".config", "file-server", "config.json");
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return {};
    throw new Error(`could not read ${path} (${errorCode(error) ?? "unknown error"})`);
  }
  return parseConfig(path, text);
}

function parseConfig(path: string, text: string): FilesConfig {
  let document: unknown;
  try { document = JSON.parse(text); }
  catch { throw new Error(`${path} is not valid JSON`); }
  if (!isRecord(document)) throw new Error(`${path} must hold a JSON object`);
  const unknownMember = Object.keys(document).find((member) => member !== "ignore");
  if (unknownMember !== undefined) throw new Error(`${path} has an unknown member ${JSON.stringify(unknownMember)}`);
  const { ignore } = document;
  if (ignore === undefined) return {};
  if (!Array.isArray(ignore) || !ignore.every((glob): glob is string => typeof glob === "string")) {
    throw new Error(`${path}: ignore must be an array of strings`);
  }
  return { ignore };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasErrorCode(error: unknown, code: string): boolean {
  return errorCode(error) === code;
}

/** The system error code, such as `EACCES`, which names the failure without repeating the path as the message does. */
function errorCode(error: unknown): string | undefined {
  return error !== null && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : undefined;
}
