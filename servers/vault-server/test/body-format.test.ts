import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { noteWrite, startVault } from "./helpers.ts";

test("bodyFormat raw settles the vault and round-trips bodies byte-exact under both link formats", async () => {
  for (const linkFormat of ["wikilink", "markdown"] as const) {
    const body = '<article><a href="/inbox">[Open](/Page) [[Page]]</a></article>\n';
    const fieldLink = linkFormat === "wikilink" ? "[[Page]]" : "[Page](../Page)";
    const source = `---\nkind: email\ncontact: '${fieldLink}'\n---\n${body}`;
    const validated: Array<{ fields: unknown; body?: string }> = [];
    const vault = await startVault({
      "Page.md": "page",
      "emails/message.md": source,
    }, {
      linkFormat,
      bodyFormat: "raw",
      validate: ({ fields, body: candidateBody }) => { validated.push({ fields, body: candidateBody }); },
    });

    const fetched = await (await fetch(`${vault.baseUrl}/emails/message`)).json() as {
      fields: Record<string, unknown>;
      body?: string;
    };
    assert.deepEqual(fetched.fields, { kind: "email", contact: { $type: "ref", path: "Page" } });
    assert.equal(fetched.body, body, linkFormat);

    const echoed = await noteWrite(vault.baseUrl, "PUT", "/emails/message", {
      fields: fetched.fields,
      body: fetched.body,
    });
    assert.equal(echoed.status, 200);
    assert.equal(await readFile(join(vault.root, "emails/message.md"), "utf8"), source, linkFormat);

    const editedBody = body.replace("Open", "Open!");
    const edited = await noteWrite(vault.baseUrl, "PUT", "/emails/message", {
      fields: fetched.fields,
      body: editedBody,
    });
    assert.equal(edited.status, 200);
    assert.equal((await edited.json() as { body?: string }).body, editedBody, linkFormat);
    assert.equal(await readFile(join(vault.root, "emails/message.md"), "utf8"), `---\nkind: email\ncontact: '${fieldLink}'\n---\n${editedBody}`, linkFormat);
    assert.deepEqual(validated, [
      { fields: { kind: "email", contact: fieldLink }, body },
      { fields: { kind: "email", contact: fieldLink }, body: editedBody },
    ]);
  }
});

test("bodyFormat is asked per extensionless record path and can keep markdown inside a raw folder", async () => {
  const rawBody = "[[Page]]\n[Open](/Page)";
  const seen: string[] = [];
  const vault = await startVault({
    "Page.md": "page",
    "emails/raw.md": rawBody,
    "emails/nested/markdown.md": rawBody,
  }, {
    bodyFormat: (path) => {
      seen.push(path);
      return path === "emails/raw" ? "raw" : "markdown";
    },
  });

  const expected = new Map([
    ["emails/raw", rawBody],
    ["emails/nested/markdown", "[Page](../../Page)\n[Open](/Page)"],
  ]);
  for (const [path, body] of expected) {
    const record = await (await fetch(`${vault.baseUrl}/${path}`)).json() as { body?: string };
    assert.equal(record.body, body, path);
  }

  for (const [path, body] of expected) {
    const separator = path.lastIndexOf("/");
    const directory = path.slice(0, separator);
    const name = path.slice(separator + 1);
    const listing = await (await fetch(`${vault.baseUrl}/${directory}/`)).json() as {
      entries: Array<{ name: string; type: string; body?: string }>;
    };
    const entry = listing.entries.find(({ name: entryName, type }) => type === "record" && entryName === name);
    assert.equal(entry?.body, body, path);
  }

  assert.deepEqual(new Set(seen), new Set(["Page", "emails/raw", "emails/nested/markdown"]));
  assert.ok(seen.every((path) => !path.endsWith(".md")), "the resolver only sees API paths");
});

test("configure rebuilds prose links in both directions when bodyFormat changes", async () => {
  const vault = await startVault({
    "folder/source.md": "[[one]] and [Two](../two)",
    "one.md": "one",
    "two.md": "two",
  });
  const links = async (path: string): Promise<Array<{ path: string; backlink?: true }>> => {
    return (await (await fetch(`${vault.baseUrl}/${path}`)).json() as { links: Array<{ path: string; backlink?: true }> }).links;
  };

  assert.deepEqual(await links("folder/source"), [{ path: "one" }, { path: "two" }]);
  assert.deepEqual(await links("one"), [{ path: "folder/source", backlink: true }]);
  assert.deepEqual(await links("two"), [{ path: "folder/source", backlink: true }]);

  vault.server.configure({ bodyFormat: (path) => path.startsWith("folder/") ? "raw" : "markdown" });
  assert.deepEqual(await links("folder/source"), [], "the raw record loses its outbound prose links");
  assert.deepEqual(await links("one"), [], "the first target loses the stale backlink");
  assert.deepEqual(await links("two"), [], "every target loses the stale backlink");

  vault.server.configure({ bodyFormat: "markdown" });
  assert.deepEqual(await links("folder/source"), [{ path: "one" }, { path: "two" }], "outbound links return");
  assert.deepEqual(await links("one"), [{ path: "folder/source", backlink: true }], "the first backlink returns");
  assert.deepEqual(await links("two"), [{ path: "folder/source", backlink: true }], "every backlink returns");
});

test("configure keeps omitted settings and an empty configuration changes nothing", async () => {
  const rawBody = "[[target]]";
  const vault = await startVault({
    "raw/source.md": rawBody,
    "target.md": "target",
  }, { linkFormat: "markdown", bodyFormat: "raw" });

  vault.server.configure({});
  const unchanged = await (await fetch(`${vault.baseUrl}/raw/source`)).json() as { body?: string; links: unknown[] };
  assert.equal(unchanged.body, rawBody, "the empty configuration keeps bodyFormat");
  assert.deepEqual(unchanged.links, []);
  const emptyConfigWrite = await noteWrite(vault.baseUrl, "PUT", "/after-empty-config", {
    fields: { link: { $type: "ref", path: "target" } },
  });
  assert.equal(emptyConfigWrite.status, 201);
  assert.match(await readFile(join(vault.root, "after-empty-config.md"), "utf8"), /link: ['"]\[target\]\(target\)['"]/, "the empty configuration keeps linkFormat");

  vault.server.configure({ linkFormat: "wikilink" });
  const stillRaw = await (await fetch(`${vault.baseUrl}/raw/source`)).json() as { body?: string; links: unknown[] };
  assert.equal(stillRaw.body, rawBody, "omitting bodyFormat keeps it raw");
  assert.deepEqual(stillRaw.links, []);

  vault.server.configure({ bodyFormat: "markdown" });
  const response = await noteWrite(vault.baseUrl, "PUT", "/written", {
    fields: { link: { $type: "ref", path: "target" } },
  });
  assert.equal(response.status, 201);
  assert.match(await readFile(join(vault.root, "written.md"), "utf8"), /link: ['"]\[\[target\]\]['"]/, "omitting linkFormat keeps wikilinks");
});
