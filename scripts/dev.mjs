import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd: root,
      stdio: "inherit",
      shell: true,
      env: process.env,
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with ${code ?? "unknown"}`));
    });
  });
}

await run("npm run build -w @reference-studio/core");

const child = spawn(
  'npx concurrently -k -n core,server,web "npm run dev -w @reference-studio/core" "npm run dev:server -w @reference-studio/web" "npm run dev:client -w @reference-studio/web"',
  {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: process.env,
  },
);

const stop = (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
