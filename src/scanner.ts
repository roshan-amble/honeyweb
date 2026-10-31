import ts from "typescript";
import { extractPrisma, type SourceRelation } from "./prisma.ts";
import { mountedRoutes } from "./routes.ts";
import { readdir, readFile, lstat, realpath } from "node:fs/promises";
import { relative, join, extname } from "node:path";
import { createHash } from "node:crypto";

export interface Field {
  name: string;
  type: string;
}
export interface Entity {
  name: string;
  fields: Field[];
  file: string;
}
export interface Route {
  method: string;
  path: string;
  file: string;
}
export interface Snapshot {
  hash: string;
  files: number;
  routes: Route[];
  entities: Entity[];
  warnings: string[];
  relationships?: SourceRelation[];
  entitySource?: "interfaces" | "prisma";
}
const identifier = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const ignored = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  "vendor",
]);

function fieldType(node?: ts.TypeNode): string {
  if (!node) return "unknown";
  if (node.kind === ts.SyntaxKind.StringKeyword) return "string";
  if (node.kind === ts.SyntaxKind.NumberKeyword) return "number";
  if (node.kind === ts.SyntaxKind.BooleanKeyword) return "boolean";
  if (ts.isArrayTypeNode(node)) return "array";
  if (
    ts.isTypeReferenceNode(node) &&
    ts.isIdentifier(node.typeName) &&
    identifier.test(node.typeName.text)
  )
    return node.typeName.text;
  return "unknown"; // Never copy literal types, defaults, comments, or source bodies.
}

export function extract(
  source: string,
  file: string
): { routes: Route[]; entities: Entity[] } {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const factories = new Set<string>();
  const routers = new Set<string>();
  const apps = new Set<string>();
  const routes: Route[] = [];
  const entities: Entity[] = [];
  for (const stmt of ast.statements) {
    if (
      ts.isImportDeclaration(stmt) &&
      ts.isStringLiteral(stmt.moduleSpecifier) &&
      stmt.moduleSpecifier.text === "express"
    ) {
      if (stmt.importClause?.name) factories.add(stmt.importClause.name.text);
      const bindings = stmt.importClause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings))
        factories.add(bindings.name.text);
      if (bindings && ts.isNamedImports(bindings))
        for (const e of bindings.elements) {
          if ((e.propertyName?.text ?? e.name.text) === "Router")
            routers.add(e.name.text);
        }
    }
  }
  const walk = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isCallExpression(node.initializer)
    ) {
      const expression = node.initializer.expression;
      if (
        (ts.isIdentifier(expression) &&
          (factories.has(expression.text) || routers.has(expression.text))) ||
        (ts.isPropertyAccessExpression(expression) &&
          ts.isIdentifier(expression.expression) &&
          factories.has(expression.expression.text) &&
          expression.name.text === "Router")
      )
        apps.add(node.name.text);
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression)
    ) {
      const call = node.expression;
      const method = call.name.text.toUpperCase();
      const path = node.arguments[0];
      if (
        ts.isIdentifier(call.expression) &&
        apps.has(call.expression.text) &&
        /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(method) &&
        path &&
        ts.isStringLiteral(path) &&
        /^\/[A-Za-z0-9/_:-]{0,119}$/.test(path.text)
      ) {
        routes.push({ method, path: path.text, file });
      }
    }
    if (ts.isInterfaceDeclaration(node) && identifier.test(node.name.text)) {
      const fields = node.members
        .flatMap((member) => {
          if (
            !ts.isPropertySignature(member) ||
            !member.name ||
            !ts.isIdentifier(member.name) ||
            !identifier.test(member.name.text)
          )
            return [];
          return [{ name: member.name.text, type: fieldType(member.type) }];
        })
        .slice(0, 40);
      if (fields.length) entities.push({ name: node.name.text, fields, file });
    }
    ts.forEachChild(node, walk);
  };
  walk(ast);
  return { routes, entities };
}

export async function scanRepository(directory: string): Promise<Snapshot> {
  const root = await realpath(directory);
  if (!(await lstat(root)).isDirectory())
    throw new Error("Scan target must be a directory.");
  let files = 0;
  let bytes = 0;
  let entries = 0;
  const routes: Route[] = [];
  const entities: Entity[] = [];
  const warnings: string[] = [];
  const sources = new Map<string, string>();
  const prismaEntities: Entity[] = [];
  const relationships: SourceRelation[] = [];
  async function walk(dir: string, depth = 0): Promise<void> {
    if (depth > 12)
      throw new Error(
        "Repository exceeds 12 directory levels. Scan a smaller source directory."
      );
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name)
    )) {
      if (++entries > 5000)
        throw new Error(
          "Repository exceeds 5,000 entries. Scan a smaller source directory."
        );
      if (
        entry.name.startsWith(".") ||
        ignored.has(entry.name) ||
        entry.isSymbolicLink()
      )
        continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path, depth + 1);
        continue;
      }
      if (
        !entry.isFile() ||
        ![".ts", ".tsx", ".prisma"].includes(extname(path)) ||
        path.endsWith(".d.ts")
      )
        continue;
      const stat = await lstat(path);
      if (stat.size > 256_000) {
        warnings.push(`Skipped oversized source file: ${relative(root, path)}`);
        continue;
      }
      if (++files > 256 || (bytes += stat.size) > 2_000_000)
        throw new Error(
          "Repository exceeds scan limits (256 files / 2 MB). Scan a smaller source directory."
        );
      const file = relative(root, path).split("\\").join("/");
      const source = await readFile(path, "utf8");
      if (extname(path) === ".prisma") {
        const result = extractPrisma(source, file);
        prismaEntities.push(...result.entities);
        relationships.push(...result.relationships);
        warnings.push(...result.warnings);
      } else {
        sources.set(file, source);
        entities.push(...extract(source, file).entities);
      }
    }
  }
  await walk(root);
  const mounted = mountedRoutes(sources);
  routes.push(...mounted.routes);
  warnings.push(...mounted.warnings);
  const entitySource = prismaEntities.length ? "prisma" : "interfaces";
  if (prismaEntities.length) {
    entities.splice(0, entities.length, ...prismaEntities);
    warnings.push(
      "Prisma scalar models selected as domain entities; TypeScript DTO interfaces and object relation fields are omitted."
    );
  }
  if (routes.length > 200 || entities.length > 100)
    throw new Error(
      "Too many routes or entities. Scan a smaller source directory."
    );
  if (new Set(entities.map((e) => e.name)).size !== entities.length)
    throw new Error(
      "Duplicate interface names are ambiguous. Scan a narrower source directory."
    );
  if (!routes.length) warnings.push("No supported Express routes found.");
  if (!entities.length)
    warnings.push("No supported TypeScript interfaces or Prisma models found.");
  warnings.push(
    "Static subset: Express literal routes, chained mounts and relative default router imports; interface fields or Prisma scalar models and explicit id references. Dynamic mounts, named router exports, application behavior, composite keys and implicit many-to-many relations are not resolved."
  );
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        routes,
        entities,
      ...(prismaEntities.length ? { relationships } : {}),
      })
    )
    .digest("hex");
  return {
    hash,
    files,
    routes,
    entities,
    warnings,
    entitySource,
    ...(prismaEntities.length ? { relationships } : {}),
  };
}

export function drift(previous: Snapshot, current: Snapshot) {
  const changes = <T>(before: T[], after: T[]) => {
    const a = new Set(before.map((x) => JSON.stringify(x)));
    const b = new Set(after.map((x) => JSON.stringify(x)));
    return {
      added: after.filter((x) => !a.has(JSON.stringify(x))),
      removed: before.filter((x) => !b.has(JSON.stringify(x))),
    };
  };
  return {
    changed: previous.hash !== current.hash,
    routes: changes(previous.routes, current.routes),
    entities: changes(previous.entities, current.entities),
  };
}
