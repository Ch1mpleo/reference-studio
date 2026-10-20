import { startService, type RunningService } from "./run.js";

let running: RunningService;

try {
  running = await startService();
} catch {
  process.exit(1);
}

let shuttingDown = false;

process.on("exit", () => {
  running.releaseConnection();
});

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  running.app.log.info({ signal }, "shutting down");
  await running.shutdown();
}

process.on("SIGINT", () => {
  void shutdown("SIGINT").then(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM").then(() => process.exit(0));
});

running.app.log.info(
  {
    baseUrl: `http://${running.config.host}:${running.config.port}`,
    contractVersion: running.config.contractVersion,
  },
  "reference studio listening",
);
