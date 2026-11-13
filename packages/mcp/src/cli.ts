#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createServer } from "./server.js";

serveStdio(() => createServer(), {
  onerror: (error) => {
    process.stderr.write(`reference-studio-mcp: ${error.message}\n`);
  },
});
