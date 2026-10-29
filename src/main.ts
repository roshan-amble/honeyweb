import { startWorkspace } from "./server.ts";
const workspace = await startWorkspace();
console.log(
  `\nHoneyweb\n  Dashboard  ${workspace.adminURL}\n  Decoys     ${workspace.decoyURL}\n\nOffline fixture active. Select Meta in the dashboard to make a real model call.\n`,
);
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await workspace.close();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
