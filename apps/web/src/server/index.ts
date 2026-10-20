import { createApp } from "./app.js";
import { loadConfig, removeConnectionFile, writeConnectionFile } from "./config.js";
import { openDatabase } from "./db.js";

const config = loadConfig();
const database = openDatabase(config.dataDir);
const app = await createApp({ config, database });

let shuttingDown = false;

process.on("exit", () => {
  removeConnectionFile(config.dataDir);
});

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  app.log.info({ signal }, "shutting down");
  await app.close();
  database.close();
}

process.on("SIGINT", () => {
  void shutdown("SIGINT").then(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM").then(() => process.exit(0));
});

try {
  await app.listen({ host: config.host, port: config.port });
  writeConnectionFile(config);
  app.log.info(
    { baseUrl: `http://${config.host}:${config.port}`, contractVersion: config.contractVersion },
    "reference studio listening",
  );
} catch (error) {
  app.log.error({ err: error }, "could not start reference studio");
  removeConnectionFile(config.dataDir);
  database.close();
  process.exit(1);
}
