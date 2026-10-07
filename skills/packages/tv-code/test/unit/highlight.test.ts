/** Syntax roles, text fidelity, and cancellation for Shiki highlighting. */
import { expect, test } from "vitest";
import { highlightElement } from "../../src/highlight.js";

test("TypeScript keywords and strings get syntax roles", async () => {
  const code = document.createElement("code");
  code.textContent = 'const x = "a"';
  await highlightElement(code, "typescript");
  expect(code.querySelector(".cv-t-keyword")?.textContent).toContain("const");
  expect(code.querySelector(".cv-t-string")?.textContent).toContain("a");
  expect(code.textContent).toBe('const x = "a"');
});

test("JSON keys get the property role", async () => {
  const code = document.createElement("code");
  code.textContent = '{"name": 42}';
  await highlightElement(code, "json");
  expect(code.querySelector(".cv-t-property")?.textContent).toContain("name");
});

test.each([
  ["javascript", 'const x = "a";', "string", "a"],
  ["css", "body { color: red; }", "property", "color"],
  ["html", '<div class="x">', "tag", "div"],
  ["python", "# note", "comment", "note"],
  ["markdown", "# Heading", "heading", "Heading"],
  ["rust", "fn main() { let x = 1; }", "keyword", "fn"],
  ["go", "func main() {}", "keyword", "func"],
  ["bash", "# note", "comment", "note"],
  ["yaml", "name: value", "property", "name"],
  ["diff", "+added\n-deleted", "inserted", "added"],
])("%s maps representative syntax to %s", async (language, source, role, token) => {
  const code = document.createElement("code");
  code.textContent = source;
  await highlightElement(code, language);
  expect(code.querySelector(`.cv-t-${role}`)?.textContent).toContain(token);
  expect(code.textContent).toBe(source);
});

test("a later highlight request wins when an earlier grammar finishes afterward", async () => {
  const code = document.createElement("code");
  code.textContent = 'const value = "text";';
  const older = highlightElement(code, "powershell");
  const newer = highlightElement(code, "typescript");
  await Promise.all([older, newer]);
  expect(code.querySelector(".cv-t-keyword")?.textContent).toContain("const");
  expect(code.querySelector(".cv-t-string")?.textContent).toContain("text");
});

test("multi-line grammar state survives a portion boundary", async () => {
  const code = document.createElement("code");
  code.textContent = [...Array.from({ length: 149 }, () => "const x = 1;"),
    "/* open", "inside comment", "*/", "const done = true;"].join("\n");
  await highlightElement(code, "typescript");
  expect([...code.querySelectorAll(".cv-t-comment")].some(node => node.textContent?.includes("inside comment"))).toBe(true);
  expect(code.textContent).toContain("const done = true;");
});

test("empty lines at portion boundaries retain their positions", async () => {
  const source = [...Array.from({ length: 24 }, () => "const x = 1;"), "", "const after = 2;"].join("\n");
  const code = document.createElement("code");
  code.textContent = source;
  await highlightElement(code, "typescript");
  expect(code.textContent).toBe(source);
  expect(code.querySelectorAll(".cv-t-keyword")).toHaveLength(25);
});

test("long lines retain every source character when tokenization is capped", async () => {
  const source = `const value = "${"x".repeat(5000)}";`;
  const code = document.createElement("code");
  code.textContent = source;
  await highlightElement(code, "typescript");
  expect(code.textContent).toBe(source);
});

test("Windows line endings survive highlighting", async () => {
  const source = "const first = 1;\r\nconst second = 2;\r\n";
  const code = document.createElement("code");
  code.textContent = source;
  await highlightElement(code, "typescript");
  expect(code.textContent).toBe(source);
});

test("aborting between portions leaves a code block unchanged", async () => {
  const code = document.createElement("code");
  code.textContent = Array.from({ length: 500 }, () => "const x = 1;").join("\n");
  const source = code.textContent;
  const controller = new AbortController();
  const pending = highlightElement(code, "typescript", controller.signal);
  setTimeout(() => controller.abort(), 0);
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(code.textContent).toBe(source);
});

test.each([
  ["typescript", 'type Box<T> = { value: T }; const box: Box<string> = { value: "hi" };',
    [["keyword", "type"], ["type", "Box"], ["property", "value"], ["string", "hi"]]],
  ["tsx", 'const Card = ({name}: {name: string}) => <div title="hey">{name}</div>;',
    [["tag", "div"], ["attribute", "title"], ["parameter", "name"], ["string", "hey"]]],
  ["json", '{"name": true, "count": 42}', [["property", "name"], ["number", "42"]]],
  ["css", '.card:hover { color: red; margin: 2px; }',
    [["type", "card"], ["property", "color"], ["string", "red"], ["number", "2"]]],
  ["html", '<div class="x"><script>const x = "hey";</script></div>',
    [["tag", "script"], ["attribute", "class"], ["keyword", "const"], ["string", "hey"]]],
  ["markdown", '# Heading\n[link](https://example.com)\n```ts\nconst n = 1;\n```',
    [["heading", "Heading"], ["link", "link"], ["keyword", "const"]]],
  ["python", 'def hello(name: str):\n    return f"Hi {name}"',
    [["function", "hello"], ["parameter", "name"], ["string", "Hi"]]],
  ["rust", 'fn main() { let x: Vec<String> = vec!["hi"]; }',
    [["keyword", "fn"], ["function", "main"], ["type", "Vec"], ["string", "hi"]]],
  ["go", 'func main() { value := "hi"; fmt.Println(value) }',
    [["keyword", "func"], ["function", "Println"], ["string", "hi"]]],
  ["bash", 'echo "$HOME" # comment', [["function", "echo"], ["string", "$HOME"], ["comment", "comment"]]],
  ["yaml", 'name: value\ncount: 42', [["property", "name"], ["string", "value"], ["number", "42"]]],
  ["diff", '+added\n-deleted\n context', [["inserted", "added"], ["deleted", "deleted"]]],
] as [string, string, [string, string][]][])("%s assigns editor roles and preserves source text", async (language, source, expected) => {
  const code = document.createElement("code");
  code.textContent = source;
  await highlightElement(code, language);
  for (const [role, token] of expected)
    expect([...code.querySelectorAll(`.cv-t-${role}`)].some(span => span.textContent?.includes(token)), `${language}: ${token} should be ${role}`).toBe(true);
  expect(code.textContent).toBe(source);
});
