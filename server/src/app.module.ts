import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AccessTokenGuard, RolesGuard } from "./auth/auth.guards";

@Module({
  imports: [AuthModule, ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }])],
  providers: [
    ThrottlerGuard,
    { provide: APP_GUARD, useExisting: ThrottlerGuard },
    AccessTokenGuard,
    RolesGuard,
    { provide: APP_GUARD, useExisting: AccessTokenGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
  ],
})
export class AppModule {}
