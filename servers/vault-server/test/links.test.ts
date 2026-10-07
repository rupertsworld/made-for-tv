import assert from "node:assert/strict";
import { readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { noteWrite, startVault } from "./helpers.ts";

type LinkEntry = { path: string; field?: string; backlink?: true };

test("single reads list each resolved field and prose link in both directions", async () => {
  const vault = await startVault({
    "a.md": "---\nfirst: '[[b]]'\nsecond: '[b](b)'\nnested:\n  contact: '[[c]]'\nmissing: '[[Missing]]'\nurl: https://example.test\n---\n[[c]] [Away](https://example.test) [[Missing]]",
    "b.md": "---\nrelated: '[[a]]'\n---",
    "c.md": "c",
  });

  assert.deepEqual(linkKeys(await readLinks(vault.baseUrl, "a")), [
    "backlink:b:related",
    "outbound:b:first",
    "outbound:b:second",
    "outbound:c:",
    "outbound:c:nested",
  ]);
  assert.deepEqual(linkKeys(await readLinks(vault.baseUrl, "b")), [
    "backlink:a:first",
    "backlink:a:second",
    "outbound:a:related",
  ]);
  assert.deepEqual(linkKeys(await readLinks(vault.baseUrl, "c")), [
    "backlink:a:",
    "backlink:a:nested",
  ]);

  const listing = await (await fetch(`${vault.baseUrl}/`)).json() as { entries: Array<Record<string, unknown>> };
  assert.equal(listing.entries.every((entry) => !("links" in entry)), true);
});

test("raw bodies contribute no prose links but their fields and other records still do", async () => {
  const vault = await startVault({
    "raw/source.md": "---\ntarget: '[[target]]'\n---\n[[target]]",
    "target.md": "[[raw/source]]",
  }, { bodyFormat: (path) => path === "raw/source" ? "raw" : "markdown" });

  assert.deepEqual(linkKeys(await readLinks(vault.baseUrl, "raw/source")), [
    "backlink:target:",
    "outbound:target:target",
  ]);
  assert.deepEqual(linkKeys(await readLinks(vault.baseUrl, "target")), [
    "backlink:raw/source:target",
    "outbound:raw/source:",
  ]);
});

test("deleting either end removes its indexed edges", async () => {
  const vault = await startVault({
    "source.md": "[[target]]",
    "target.md": "target",
    "source-two.md": "[[target-two]]",
    "target-two.md": "target",
  });
  assert.deepEqual(linkKeys(await readLinks(vault.baseUrl, "target")), ["backlink:source:"]);
  assert.equal((await fetch(`${vault.baseUrl}/source`, { method: "DELETE" })).status, 204);
  assert.deepEqual(await readLinks(vault.baseUrl, "target"), []);

  assert.deepEqual(linkKeys(await readLinks(vault.baseUrl, "source-two")), ["outbound:target-two:"]);
  assert.equal((await fetch(`${vault.baseUrl}/target-two`, { method: "DELETE" })).status, 204);
  assert.deepEqual(await readLinks(vault.baseUrl, "source-two"), []);
});

test("a watcher rename replaces backlink sources without leaving stale edges", async () => {
  const vault = await startVault({ "old.md": "[[target]]", "target.md": "target" });
  assert.deepEqual(linkKeys(await readLinks(vault.baseUrl, "target")), ["backlink:old:"]);

  await rename(join(vault.root, "old.md"), join(vault.root, "moved.md"));
  const links = await pollLinks(vault.baseUrl, "target", (entries) => {
    return JSON.stringify(linkKeys(entries)) === JSON.stringify(["backlink:moved:"]);
  });
  assert.deepEqual(linkKeys(links), ["backlink:moved:"]);
});

test("writes ignore submitted links and return the freshly derived link list", async () => {
  const vault = await startVault({ "a.md": "---\ntarget: '[[b]]'\n---", "b.md": "b" });
  const response = await noteWrite(vault.baseUrl, "PUT", "/a", {
    fields: { target: { $type: "ref", path: "b" } },
    links: [{ path: "forged", backlink: true }],
  });
  assert.equal(response.status, 200);
  const record = await response.json() as { links: LinkEntry[] };
  assert.deepEqual(linkKeys(record.links), ["outbound:b:target"]);
  assert.doesNotMatch(await readFile(join(vault.root, "a.md"), "utf8"), /forged|links:/);
});

test("link edges follow targets appearing, disappearing, and reappearing", async () => {
  const vault = await startVault({ "source.md": "[[target#section]]" });
  assert.deepEqual(await readLinks(vault.baseUrl, "source"), []);

  assert.equal((await noteWrite(vault.baseUrl, "PUT", "/target", { body: "target" })).status, 201);
  assert.deepEqual(linkKeys(await readLinks(vault.baseUrl, "source")), ["outbound:target:"]);
  assert.deepEqual(linkKeys(await readLinks(vault.baseUrl, "target")), ["backlink:source:"]);

  assert.equal((await fetch(`${vault.baseUrl}/target`, { method: "DELETE" })).status, 204);
  assert.deepEqual(await readLinks(vault.baseUrl, "source"), []);

  assert.equal((await noteWrite(vault.baseUrl, "PUT", "/target", { body: "target again" })).status, 201);
  assert.deepEqual(linkKeys(await readLinks(vault.baseUrl, "source")), ["outbound:target:"]);
});

test("link-list paths identify records without fragments or queries", async () => {
  const vault = await startVault({
    "source.md": "---\nfragment: '[[target#section]]'\nquery: '[[target?view=short]]'\n---\n[[target#body]]",
    "target.md": "target",
  });
  assert.deepEqual(linkKeys(await readLinks(vault.baseUrl, "source")), [
    "outbound:target:",
    "outbound:target:fragment",
    "outbound:target:query",
  ]);
});

async function readLinks(baseUrl: string, path: string): Promise<LinkEntry[]> {
  const record = await (await fetch(`${baseUrl}/${path}`)).json() as { links: LinkEntry[] };
  return record.links;
}

function linkKeys(links: LinkEntry[]): string[] {
  return links.map(({ path, field, backlink }) => `${backlink ? "backlink" : "outbound"}:${path}:${field ?? ""}`).sort();
}

async function pollLinks(baseUrl: string, path: string, predicate: (links: LinkEntry[]) => boolean): Promise<LinkEntry[]> {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const links = await readLinks(baseUrl, path);
    if (predicate(links)) return links;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("timed out waiting for links to update");
}
