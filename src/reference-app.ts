import { spawn, execFile, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import type { Dataset } from "./data.ts";
const exec = promisify(execFile);
// Explicitly executes the pinned public application only in a disposable test checkout/database.
export async function startReferenceApp(
  directory: string,
  expectedCommit: string
) {
  const root = resolve(directory),
    mainFile = join(root, "src/main.ts"),
    schema = join(root, "src/prisma/schema.prisma");
  if (
    (await exec("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim() !==
    expectedCommit
  )
    throw new Error("Unexpected upstream commit.");
  if (
    (await exec("git", ["status", "--porcelain"], { cwd: root })).stdout.trim()
  )
    throw new Error("Upstream checkout must start clean.");
  const database = process.env.DATABASE_URL;
  if (!database)
    throw new Error(
      "DATABASE_URL is required for the disposable test database."
    );
  const db = new URL(database);
  if (
    db.protocol !== "postgresql:" ||
    db.hostname !== "127.0.0.1" ||
    db.pathname !== "/honeyweb_case"
  )
    throw new Error("Only loopback honeyweb_case PostgreSQL is allowed.");
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    NODE_ENV: "test",
    DATABASE_URL: database,
    JWT_SECRET: randomBytes(32).toString("hex"),
  };
  const main = await readFile(mainFile, "utf8");
  if (!main.includes("app.listen(PORT, () => {"))
    throw new Error("Unexpected upstream listener.");
  let child: ChildProcess | undefined;
  const close = async () => {
    if (child && child.exitCode === null) {
      const process = child;
      await new Promise<void>((done) => {
        const timeout = setTimeout(() => process.kill("SIGKILL"), 3000);
        process.once("exit", () => {
          clearTimeout(timeout);
          done();
        });
        process.kill("SIGTERM");
      });
    }
    await writeFile(mainFile, main);
  };
  const command = async (args: string[]) => {
    try {
      return await exec(process.execPath, args, {
        cwd: root,
        env,
        timeout: 120000,
        maxBuffer: 512000,
      });
    } catch (e) {
      throw new Error(
        `Reference subprocess failed: ${(
          (e as { stderr?: string }).stderr ?? "see setup"
        ).slice(-1200)}`
      );
    }
  };
  try {
    await writeFile(
      mainFile,
      main.replace(
        "app.listen(PORT, () => {",
        "app.listen(Number(PORT), '127.0.0.1', () => {"
      )
    );
    const prisma = join(root, "node_modules/prisma/build/index.js");
    await command([prisma, "generate", "--schema", schema]);
    await command([prisma, "migrate", "deploy", "--schema", schema]);
    const socket = createServer();
    await new Promise<void>((done) => socket.listen(0, "127.0.0.1", done));
    const port = (socket.address() as { port: number }).port;
    await new Promise<void>((done) => socket.close(() => done()));
    const url = `http://127.0.0.1:${port}`;
    let errors = "";
    child = spawn(
      process.execPath,
      [resolve("node_modules/tsx/dist/cli.mjs"), join(root, "src/main.ts")],
      {
        cwd: root,
        env: { ...env, PORT: String(port) },
        stdio: ["ignore", "ignore", "pipe"],
      }
    );
    child.stderr?.on("data", (chunk) => {
      errors = (errors + chunk).slice(-1200);
    });
    let ready = false;
    for (let i = 0; i < 150; i++) {
      if (child.exitCode !== null)
        throw new Error(`Reference app failed: ${errors}`);
      try {
        if ((await fetch(url + "/", { signal: AbortSignal.timeout(500) })).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((done) => setTimeout(done, 100));
    }
    if (!ready) throw new Error("Reference app readiness timed out.");
    const api = async (path: string, body?: unknown, token?: string) => {
      const response = await fetch(url + path, {
        method: body ? "POST" : "GET",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Token ${token}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      });
      if (!response.ok)
        throw new Error(`Reference ${path} returned ${response.status}`);
      return (await response.json()) as any;
    };
    const handles = ["mira_chen", "leo_martin", "anya_shah", "sam_ortiz"];
    const titles = [
      "Keeping editorial handoffs predictable",
      "A small guide to useful release notes",
      "Reviewing comments without losing context",
      "Planning a reliable publishing calendar",
    ];
    const tags = ["editing", "releases", "moderation", "planning"];
    for (let i = 0; i < 4; i++) {
      const user = (
        await api("/api/users", {
          user: {
            username: handles[i],
            email: `${handles[i]}@example.invalid`,
            password: randomBytes(24).toString("hex"),
            bio: `Contributor focusing on ${tags[i]} and practical publishing workflows.`,
            image: "/assets/images/demo-avatar.png",
          },
        })
      ).user;
      const article = (
        await api(
          "/api/articles",
          {
            article: {
              title: titles[i],
              description: `Notes from the content team's ${tags[i]} review.`,
              body: `We reviewed the ${tags[i]} workflow with the editorial team. Assigning an owner and recording the next action made handoffs easier to follow. The next review is scheduled for the following week.`,
              tagList: [tags[i]],
            },
          },
          user.token
        )
      ).article;
      await api(
        `/api/articles/${article.slug}/comments`,
        {
          comment: {
            body: "The ownership checklist makes this easier to review. Please include it in the next team update.",
          },
        },
        user.token
      );
    }
    await command([
      "-e",
      "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.updateMany({data:{demo:true}}).finally(()=>p.$disconnect());",
    ]);
    const query = await command([
      "-e",
      "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();Promise.all([p.article.findMany({orderBy:{id:'asc'}}),p.comment.findMany({orderBy:{id:'asc'}}),p.tag.findMany({orderBy:{id:'asc'}}),p.user.findMany({orderBy:{id:'asc'}})]).then(([Article,Comment,Tag,User])=>console.log(JSON.stringify({Article,Comment,Tag,User}))).finally(()=>p.$disconnect());",
    ]);
    const data = JSON.parse(query.stdout.trim()) as Dataset;
    if (
      Object.values(data).some((rows) => rows.length !== 4) ||
      (await api("/api/articles")).articlesCount !== 4
    )
      throw new Error("Reference seed/read checks failed.");
    return {
      url,
      data,
      close,
      checks: {
        pinnedCommit: true,
        actualApplication: true,
        publicArticles: 4,
        rowsPerModel: 4,
        loopbackBinding: true,
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}
