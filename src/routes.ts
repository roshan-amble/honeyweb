import ts from "typescript";
import { posix } from "node:path";
import type { Route } from "./scanner.ts";
interface RouterNode {
  app: boolean;
  routes: Route[];
  mounts: { prefix: string; child: RouterNode }[];
}
interface Module {
  ast: ts.SourceFile;
  factories: Set<string>;
  routerFactories: Set<string>;
  imports: Map<string, string>;
  vars: Map<string, ts.Expression>;
  exported?: ts.Expression;
}
const pathPattern = /^\/[A-Za-z0-9/_:-]{0,119}$/;
export function mountedRoutes(sources: Map<string, string>) {
  const modules = new Map<string, Module>();
  for (const [file, source] of sources) {
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const mod: Module = {
      ast,
      factories: new Set(),
      routerFactories: new Set(),
      imports: new Map(),
      vars: new Map(),
    };
    for (const stmt of ast.statements) {
      if (
        ts.isImportDeclaration(stmt) &&
        ts.isStringLiteral(stmt.moduleSpecifier)
      ) {
        const spec = stmt.moduleSpecifier.text,
          clause = stmt.importClause;
        if (spec === "express") {
          if (clause?.name) mod.factories.add(clause.name.text);
          if (
            clause?.namedBindings &&
            ts.isNamespaceImport(clause.namedBindings)
          )
            mod.factories.add(clause.namedBindings.name.text);
          if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings))
            for (const binding of clause.namedBindings.elements)
              if (
                (binding.propertyName?.text ?? binding.name.text) === "Router"
              )
                mod.routerFactories.add(binding.name.text);
        } else if (spec.startsWith(".") && clause?.name) {
          const base = posix.normalize(posix.join(posix.dirname(file), spec));
          const resolved = [
            base,
            base + ".ts",
            base + ".tsx",
            posix.join(base, "index.ts"),
          ].find((p) => sources.has(p));
          if (resolved) mod.imports.set(clause.name.text, resolved);
        }
      }
      if (ts.isVariableStatement(stmt))
        for (const decl of stmt.declarationList.declarations)
          if (ts.isIdentifier(decl.name) && decl.initializer)
            mod.vars.set(decl.name.text, decl.initializer);
      if (ts.isExportAssignment(stmt) && !stmt.isExportEquals)
        mod.exported = stmt.expression;
    }
    modules.set(file, mod);
  }
  const cache = new Map<ts.Node, RouterNode | null>(),
    active = new Set<ts.Node>(),
    nodes: RouterNode[] = [];
  const warnings = new Set<string>();
  function evaluate(expr: ts.Expression, file: string): RouterNode | null {
    if (cache.has(expr)) return cache.get(expr)!;
    if (active.has(expr)) {
      warnings.add("Cyclic router expression was not resolved.");
      return null;
    }
    active.add(expr);
    const mod = modules.get(file)!;
    let result: RouterNode | null = null;
    if (ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr))
      result = evaluate(expr.expression, file);
    else if (ts.isIdentifier(expr)) {
      const initializer = mod.vars.get(expr.text),
        imported = mod.imports.get(expr.text);
      if (initializer) result = evaluate(initializer, file);
      else if (imported) {
        const exported = modules.get(imported)?.exported;
        if (exported) result = evaluate(exported, imported);
      }
    } else if (ts.isCallExpression(expr)) {
      const callee = expr.expression;
      const app = ts.isIdentifier(callee) && mod.factories.has(callee.text);
      const router =
        (ts.isIdentifier(callee) && mod.routerFactories.has(callee.text)) ||
        (ts.isPropertyAccessExpression(callee) &&
          ts.isIdentifier(callee.expression) &&
          mod.factories.has(callee.expression.text) &&
          callee.name.text === "Router");
      if (app || router) {
        result = { app, routes: [], mounts: [] };
        nodes.push(result);
      } else if (ts.isPropertyAccessExpression(callee)) {
        result = evaluate(callee.expression, file);
        if (result) {
          const method = callee.name.text.toUpperCase(),
            first = expr.arguments[0];
          if (
            /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(method) &&
            first &&
            ts.isStringLiteral(first) &&
            pathPattern.test(first.text)
          )
            result.routes.push({ method, path: first.text, file });
          else if (method === "USE") {
            const hasPrefix = first && ts.isStringLiteral(first);
            const prefix = hasPrefix ? first.text : "";
            if (hasPrefix && !pathPattern.test(prefix))
              warnings.add(`Unsupported router prefix in ${file}.`);
            else {
              const children = expr.arguments
                .slice(hasPrefix ? 1 : 0)
                .map((arg) => evaluate(arg, file));
              // An unresolved leading value could be a dynamic prefix. Do not silently invent a root mount.
              if (!hasPrefix && !children[0] && children.some(Boolean))
                warnings.add(
                  `Unresolved leading mount argument in ${file}; mount omitted.`
                );
              else
                for (const child of children)
                  if (child) result.mounts.push({ prefix, child });
            }
          }
        }
      }
    }
    active.delete(expr);
    cache.set(expr, result);
    return result;
  }
  for (const [file, mod] of modules) {
    const walk = (node: ts.Node) => {
      if (ts.isCallExpression(node)) evaluate(node, file);
      ts.forEachChild(node, walk);
    };
    walk(mod.ast);
  }
  let roots = nodes.filter((n) => n.app);
  if (!roots.length) {
    const mounted = new Set(nodes.flatMap((n) => n.mounts.map((m) => m.child)));
    roots = nodes.filter((n) => !mounted.has(n));
  }
  const routes: Route[] = [];
  const seen = new Set<RouterNode>();
  function visit(node: RouterNode, prefix: string, trail: Set<RouterNode>) {
    if (trail.has(node)) {
      warnings.add("Cyclic router mount omitted.");
      return;
    }
    seen.add(node);
    const next = new Set(trail).add(node);
    for (const route of node.routes) {
      const path =
        (prefix + "/" + route.path).replace(/\/+/g, "/").replace(/\/$/, "") ||
        "/";
      routes.push({ ...route, path });
      if (routes.length > 200) throw new Error("Too many mounted routes.");
    }
    for (const mount of node.mounts)
      visit(
        mount.child,
        (prefix + "/" + mount.prefix).replace(/\/+/g, "/").replace(/\/$/, ""),
        next
      );
  }
  for (const root of roots) visit(root, "", new Set());
  if (nodes.some((n) => n.routes.length && !seen.has(n)))
    warnings.add(
      "Some router declarations were not reachable from an Express app and were omitted."
    );
  const unique = [
    ...new Map(
      routes.map((r) => [`${r.method}:${r.path}:${r.file}`, r])
    ).values(),
  ];
  return { routes: unique, warnings: [...warnings] };
}
