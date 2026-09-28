import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { RedisModule } from '../../common/redis/redis.module';
import { MOMO_PROVIDER, VNPAY_PROVIDER } from './constants/payment.constants';
import { PaymentConfiguration } from './payment-config';
import { PaymentController } from './payment.controller';
import { PaymentFinalizerService } from './payment-finalizer.service';
import { PaymentService } from './payment.service';
import { MomoProvider } from './providers/momo.provider';
import { PaymentProvider } from './providers/payment-provider.interface';
import { VnpayProvider } from './providers/vnpay.provider';

@Module({
  imports: [DatabaseModule, RedisModule],
  controllers: [PaymentController],
  providers: [
    PaymentConfiguration,
    PaymentFinalizerService,
    PaymentService,
    {
      provide: VNPAY_PROVIDER,
      inject: [PaymentConfiguration],
      useFactory: (configuration: PaymentConfiguration): PaymentProvider => ({
        initiate: (context) =>
          new VnpayProvider(configuration.vnpay()).initiate(context),
        verifyCallback: (payload) =>
          new VnpayProvider(configuration.vnpay()).verifyCallback(payload),
        queryStatus: (transaction) =>
          new VnpayProvider(configuration.vnpay()).queryStatus(transaction),
      }),
    },
    {
      provide: MOMO_PROVIDER,
      inject: [PaymentConfiguration],
      useFactory: (configuration: PaymentConfiguration): PaymentProvider => ({
        initiate: (context) =>
          new MomoProvider(configuration.momo()).initiate(context),
        verifyCallback: (payload) =>
          new MomoProvider(configuration.momo()).verifyCallback(payload),
        queryStatus: (transaction) =>
          new MomoProvider(configuration.momo()).queryStatus(transaction),
      }),
    },
  ],
  exports: [PaymentService, PaymentFinalizerService],
})
export class PaymentModule {}
