/** @type {import('jest').Config} */
const config = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
  // 钉住测试进程的 store：别让漏传 store 的代码连上真 OSS（见 tests/setup-env.ts）
  setupFiles: ["<rootDir>/tests/setup-env.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
};

module.exports = config;
