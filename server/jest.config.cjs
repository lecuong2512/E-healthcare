module.exports = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/test/**/*.spec.ts"],
  transform: { "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.json" }] },
  moduleNameMapper: {
    "^@shared/(.*)$": "<rootDir>/../shared/src/$1",
    "^@shared$": "<rootDir>/../shared/src/index",
  },
};

