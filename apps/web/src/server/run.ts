import type { FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { type AppConfig, loadConfig, removeOwnedConnectionFile, writeConnectionFile } from "./config.js";
import { createApp } from "./app.js";
import { openDatabase } from "./db.js";

export type RunningService = {
  app: FastifyInstance;
  database: DatabaseSync;
  config: AppConfig;
  releaseConnection: () => void;
  shutdown: () => Promise<void>;
};

export async function startService(config: AppConfig = loadConfig()): Promise<RunningService> {
  const database = openDatabase(config.dataDir);
  const app = await createApp({ config, database });

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    app.log.error({ err: error }, "could not start reference studio");
    await app.close();
    database.close();
    throw error;
  }

  writeConnectionFile(config);
  let released = false;
  const releaseConnection = () => {
    if (released) {
      return;
    }
    released = true;
    removeOwnedConnectionFile(config.dataDir, process.pid);
  };

  return {
    app,
    database,
    config,
    releaseConnection,
    async shutdown() {
      await app.close();
      database.close();
      releaseConnection();
    },
  };
}
