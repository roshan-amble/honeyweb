import { createServer } from "node:http";
import { DecoyRuntime } from "./runtime.ts";
import type { Generation } from "./plan.ts";
import type { Snapshot } from "./scanner.ts";
// Dedicated decoy process. The parent gives it source metadata and a plan, never the API key or DB credentials.
let runtime: DecoyRuntime;
const server = createServer((req, res) => runtime.handle(req, res));
process.on(
  "message",
  (message: {
    id: string;
    operation: string;
    generation?: Generation;
    snapshot?: Snapshot;
  }) => {
    try {
      if (message.operation === "deploy") {
        if (runtime) runtime.deploy(message.generation!, message.snapshot!);
        else runtime = new DecoyRuntime(message.generation!, message.snapshot!);
        const reply = () =>
          process.send?.({
            id: message.id,
            url: `http://127.0.0.1:${
              (server.address() as { port: number }).port
            }`,
            entryPath: runtime.entryPath,
            checks: runtime.audit(message.snapshot!),
            deploymentId: runtime.deploymentId,
          });
        if (server.listening) reply();
        else server.listen(0, "127.0.0.1", reply);
      } else if (message.operation === "audit")
        process.send?.({
          id: message.id,
          checks: runtime.audit(message.snapshot!),
        });
      else if (message.operation === "events")
        process.send?.({ id: message.id, events: runtime.events });
    } catch {
      process.send?.({
        id: message.id,
        error: "Decoy worker rejected the operation.",
      });
    }
  }
);
process.on("disconnect", () => {
  server.closeAllConnections();
  server.close(() => process.exit(0));
});
