import { Module, OnApplicationShutdown, Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { createDataSource } from "./database-options";
import { requiredEnvironment } from "../config/environment";
import { assertLeastPrivilegeRuntimeRole } from './runtime-database-role.guard';

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
      useFactory: async () => {
        const dataSource = await createDataSource(
          requiredEnvironment("DATABASE_URL"),
        ).initialize();
        try {
          await assertLeastPrivilegeRuntimeRole(dataSource);
          return dataSource;
        } catch (error) {
          await dataSource.destroy();
          throw error;
        }
      },
    },
    DatabaseShutdown,
  ],
  exports: [DataSource],
})
export class DatabaseModule {}
