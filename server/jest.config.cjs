module.exports = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/test/**/*.spec.ts"],
  transform: { "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.spec.json" }] },
  moduleNameMapper: { "^@shared/(.*)$": "<rootDir>/../shared/src/$1" },
};
