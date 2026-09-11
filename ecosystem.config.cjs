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
        DEPLOY_RUN_PORT: port,
        PORT: port,
      },
    },
  ],
};
