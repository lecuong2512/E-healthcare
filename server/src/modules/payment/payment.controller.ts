import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@shared/enums';
import {
  InitiatePaymentResponse,
  PaymentStatusResponse,
} from '@shared/interfaces';
import { Public, Roles } from '../../common/decorators/auth.decorators';
import { AuthenticatedRequest } from '../../common/guards/authenticated-request';
import { InitiatePaymentDto } from './dto';
import { PaymentService } from './payment.service';

@Controller('payments')
export class PaymentController {
  constructor(private readonly payments: PaymentService) {}

  @Roles(Role.PATIENT)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':appointmentId/initiate')
  @HttpCode(HttpStatus.CREATED)
  initiate(
    @Param('appointmentId', new ParseUUIDPipe()) appointmentId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: InitiatePaymentDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<InitiatePaymentResponse> {
    return this.payments.initiate(
      appointmentId,
      request.auth!.userId,
      idempotencyKey || '',
      dto,
      request.ip || request.socket.remoteAddress || '127.0.0.1',
    );
  }

  @Roles(Role.PATIENT)
  @Get(':appointmentId/status')
  status(
    @Param('appointmentId', new ParseUUIDPipe()) appointmentId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<PaymentStatusResponse> {
    return this.payments.status(appointmentId, request.auth!.userId);
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('vnpay/ipn')
  async vnpayIpn(
    @Query() payload: Record<string, string>,
  ): Promise<{ RspCode: string; Message: string }> {
    try {
      const outcome = await this.payments.handleVnpayIpn(payload);
      if (outcome === 'ALREADY_FINALIZED') {
        return { RspCode: '02', Message: 'Order already confirmed' };
      }
      if (outcome === 'RECONCILIATION_REQUIRED' || outcome === 'LATE_SUCCESS') {
        return { RspCode: '99', Message: 'Reconciliation required' };
      }
      return { RspCode: '00', Message: 'Confirm Success' };
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (/signature|checksum/i.test(message)) {
        return { RspCode: '97', Message: 'Invalid signature' };
      }
      if (/not found/i.test(message)) {
        return { RspCode: '01', Message: 'Order not found' };
      }
      if (/amount/i.test(message)) {
        return { RspCode: '04', Message: 'Invalid amount' };
      }
      return { RspCode: '99', Message: 'Unknown error' };
    }
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('momo/ipn')
  @HttpCode(HttpStatus.OK)
  async momoIpn(
    @Body() payload: Record<string, unknown>,
  ): Promise<{ resultCode: number; message: string }> {
    try {
      const outcome = await this.payments.handleMomoIpn(payload);
      if (outcome === 'RECONCILIATION_REQUIRED' || outcome === 'LATE_SUCCESS') {
        return { resultCode: 99, message: 'Reconciliation required' };
      }
      return { resultCode: 0, message: 'Success' };
    } catch {
      return { resultCode: 99, message: 'Invalid payment notification' };
    }
  }
}
