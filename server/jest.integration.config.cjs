module.exports = {
  ...require("./jest.config.cjs"),
  testMatch: ["<rootDir>/test/**/*.integration.ts"],
  testTimeout: 30000,
};
