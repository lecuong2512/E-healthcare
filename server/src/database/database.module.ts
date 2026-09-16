import { Module, OnApplicationShutdown, Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { createDataSource } from "./database-options";
import { requiredEnvironment } from "../config/environment";

@Injectable()
class DatabaseShutdown implements OnApplicationShutdown {
  constructor(private readonly dataSource: DataSource) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.dataSource.isInitialized) await this.dataSource.destroy();
  }
}

@Module({
  providers: [
    {
      provide: DataSource,
      useFactory: async () =>
        createDataSource(requiredEnvironment("DATABASE_URL")).initialize(),
    },
    DatabaseShutdown,
  ],
  exports: [DataSource],
})
export class DatabaseModule {}
