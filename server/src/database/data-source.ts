import "reflect-metadata";
import { environment, requiredEnvironment } from "../config/environment";
import { createDataSource } from "./database-options";

export default createDataSource(
  environment.DATABASE_MIGRATION_URL ?? requiredEnvironment("DATABASE_URL"),
);
