import { Module } from "@nestjs/common";
import { AuthModule } from "./modules/auth/auth.module";
import { BookingModule } from "./modules/booking/booking.module";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AccessTokenGuard } from "./common/guards/access-token.guard";
import { RolesGuard } from "./common/guards/roles.guard";

@Module({
  imports: [
    AuthModule,
    BookingModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
  ],
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
