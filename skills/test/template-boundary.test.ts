/** Keep specification templates separate from production code and dependencies. */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { expect, test } from 'vitest';

type ImportedModule = { name: string; typeOnly: boolean };

function importedModules(file: string): ImportedModule[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest, true);
  const modules: ImportedModule[] = [];
  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      modules.push({ name: node.moduleSpecifier.text, typeOnly: node.importClause?.isTypeOnly ?? false });
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      modules.push({ name: node.moduleSpecifier.text, typeOnly: node.isTypeOnly });
    }
    if (ts.isCallExpression(node)
      && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      const [argument] = node.arguments;
      modules.push({ name: argument && ts.isStringLiteral(argument)
        ? argument.text : '<dynamic import or require>', typeOnly: false });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return modules;
}

const specRoot = path.resolve('spec');
const typesPath = path.join(specRoot, 'types.ts');
const stylesOnlyPaths = new Set(['tv-book-catalog', 'tv-code']
  .map(skill => path.join(specRoot, skill, 'templates', 'base.ts')));
const templates = readdirSync('spec', { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .flatMap(entry => {
    const skill = path.join(specRoot, entry.name);
    const parts = path.join(skill, 'templates');
    return [path.join(skill, 'template.ts'), ...(existsSync(parts)
      ? readdirSync(parts).filter(name => name.endsWith('.ts') && name !== 'base.ts')
        .map(name => path.join(parts, name)) : [])];
  })
  .filter(existsSync);
const templatePaths = new Set(templates);

test('tv-markdown specifies rendering in prose and CSS without a template', () => {
  expect(readdirSync(path.join(specRoot, 'tv-markdown')).sort()).toEqual(['index.md', 'style.css']);
});

function resolvedImport(file: string, module: string): string | null {
  if (!module.startsWith('.')) return null;
  const resolved = path.resolve(path.dirname(file), module.replace(/\.js$/, '.ts'));
  return path.extname(resolved) ? resolved : `${resolved}.ts`;
}

test('specification templates import only other templates, base CSS or shared types', () => {
  expect(templates.length).toBeGreaterThan(0);
  for (const file of templates) {
    for (const module of importedModules(file)) {
      const target = resolvedImport(file, module.name);
      expect(target !== null && target !== file && (templatePaths.has(target)
        || stylesOnlyPaths.has(target)
        || (target === typesPath && module.typeOnly)),
        `${file} imports ${module.name}`).toBe(true);
    }
  }
});

test('specification templates have one default export and no named exports', () => {
  for (const file of templates) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const exported = source.statements.filter(statement =>
      ts.isExportAssignment(statement) || ts.isExportDeclaration(statement)
      || (ts.canHaveModifiers(statement)
        && ts.getModifiers(statement)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)));
    expect(exported.length, file).toBe(1);
    expect(ts.isExportAssignment(exported[0]), file).toBe(true);
  }
});

test('build configuration imports only its own template and shared types', () => {
  for (const packageName of readdirSync('packages')) {
    const buildConfig = path.join('packages', packageName, 'vite.config.ts');
    for (const module of importedModules(buildConfig)) {
      const target = resolvedImport(buildConfig, module.name);
      if (target?.startsWith(`${specRoot}${path.sep}`)) {
        const ownTemplate = path.join(specRoot, packageName, 'templates', `${packageName}.ts`);
        expect((packageName === 'tv-book-catalog' || packageName === 'tv-code')
          && (target === ownTemplate || target === typesPath),
          `${buildConfig} imports ${module.name}`).toBe(true);
      }
    }
  }
});

test('production source imports no specification files', () => {
  for (const packageName of readdirSync('packages')) {
    const directory = path.join('packages', packageName, 'src');
    for (const entry of readdirSync(directory, { recursive: true })) {
      if (typeof entry !== 'string' || !/\.[cm]?[jt]s$/.test(entry)) continue;
      const file = path.join(directory, entry);
      for (const module of importedModules(file)) {
        const target = resolvedImport(file, module.name);
        expect(module.name !== '<dynamic import or require>'
          && !target?.startsWith(`${specRoot}${path.sep}`)
          && !/(?:^|\/)spec\//.test(module.name), `${file} imports ${module.name}`).toBe(true);
      }
    }
  }
});
