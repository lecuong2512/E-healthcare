import "reflect-metadata";
import { requiredEnvironment } from "../config/environment";
import { createDataSource } from "./database-options";

export default createDataSource(requiredEnvironment("DATABASE_URL"));
