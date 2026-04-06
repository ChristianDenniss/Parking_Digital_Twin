import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleFileExtensions: ["ts", "js"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "./tsconfig.test.json" }],
  },
  // Each test file gets its own isolated DB — no real DB calls are made in unit tests
  clearMocks: true,
};

export default config;
