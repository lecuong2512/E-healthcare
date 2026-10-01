import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { PhrController } from "./phr.controller";
import { PhrService } from "./phr.service";

@Module({
  imports: [DatabaseModule],
  controllers: [PhrController],
  providers: [PhrService],
  exports: [PhrService],
})
export class PhrModule {}