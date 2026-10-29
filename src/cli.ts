import { scanRepository } from "./scanner.ts";
import { generateWithMeta } from "./meta.ts";
import { offlinePlan } from "./plan.ts";
const [command, directory, ...flags] = process.argv.slice(2);
try {
  if (!directory || !["scan", "generate"].includes(command))
    throw new Error(
      "Usage: npm run scan -- <directory> OR npm run generate -- <directory> [--offline]",
    );
  if (flags.some((flag) => flag !== "--offline"))
    throw new Error("Unknown option. Only --offline is supported.");
  const snapshot = await scanRepository(directory);
  const result =
    command === "scan"
      ? snapshot
      : flags.includes("--offline")
        ? offlinePlan(snapshot)
        : await generateWithMeta(snapshot);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Command failed.");
  process.exitCode = 1;
}
