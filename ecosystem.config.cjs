const path = require("node:path");

const appRoot = __dirname;
const port = process.env.DEPLOY_RUN_PORT || "3010";

module.exports = {
  apps: [
    {
      name: "poem-rpg",
      cwd: appRoot,
      script: path.join(appRoot, "node_modules/next/dist/bin/next"),
      args: `start -p ${port}`,
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      error_file: path.join(appRoot, "logs", "err.log"),
      out_file: path.join(appRoot, "logs", "out.log"),
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      env: {
        NODE_ENV: "production",
        INGEST_ASYNC_ENABLED: "1",
        INGEST_DATA_DIR: path.join(appRoot, ".cache", "ingest"),
        DEPLOY_RUN_PORT: port,
        PORT: port,
      },
    },
    {
      name: "poem-ingest-worker",
      cwd: appRoot,
      script: path.join(appRoot, "node_modules/tsx/dist/cli.mjs"),
      args: "scripts/ingest-worker.ts",
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      kill_timeout: 360000,
      error_file: path.join(appRoot, "logs", "ingest-worker-err.log"),
      out_file: path.join(appRoot, "logs", "ingest-worker-out.log"),
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      env: {
        NODE_ENV: "production",
        INGEST_DATA_DIR: path.join(appRoot, ".cache", "ingest"),
        INGEST_WORKER_CONCURRENCY: process.env.INGEST_WORKER_CONCURRENCY || "2",
      },
    },
  ],
};
