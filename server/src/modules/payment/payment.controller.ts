import {
  BadRequestException,
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
  CancelPendingPaymentResponse,
  PaymentStatusResponse,
} from '@shared/interfaces';
import { Public, Roles } from '../../common/decorators/auth.decorators';
import { AuthenticatedRequest } from '../../common/guards/authenticated-request';
import { InitiatePaymentDto, ResolveReconciliationDto, ResolveRefundDto } from './dto';
import { PaymentService } from './payment.service';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import { extractClientIp } from '../audit/audit-context';

@Controller('payments')
export class PaymentController {
  constructor(
    private readonly payments: PaymentService,
    private readonly reconciliation: PaymentReconciliationService,
  ) {}

  @Roles(Role.ADMIN)
  @Get('reconciliation/manual-review')
  manualReviewTransactions() {
    return this.reconciliation.manualReviewTransactions();
  }

  @Roles(Role.ADMIN)
  @Post(':transactionId/reconcile')
  reconcile(
    @Param('transactionId', new ParseUUIDPipe()) transactionId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.reconciliation.manualReconcile(transactionId, request.auth!.userId);
  }

  @Roles(Role.ADMIN)
  @Post(':transactionId/resolve-reconciliation')
  resolveReconciliation(
    @Param('transactionId', new ParseUUIDPipe()) transactionId: string,
    @Body() dto: ResolveReconciliationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.reconciliation.resolveManual(
      transactionId,
      request.auth!.userId,
      dto.outcome,
      dto.note,
    );
  }

  @Roles(Role.ADMIN)
  @Get('refunds/pending')
  pendingRefunds() {
    return this.payments.pendingRefunds();
  }

  @Roles(Role.ADMIN)
  @Post('refunds/:refundId/resolve')
  resolveRefund(
    @Param('refundId', new ParseUUIDPipe()) refundId: string,
    @Body() dto: ResolveRefundDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.payments.resolveRefund(refundId, request.auth!.userId, dto);
  }

  @Roles(Role.PATIENT)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':appointmentId/initiate')
  @HttpCode(HttpStatus.CREATED)
  initiate(
    @Param('appointmentId') appointmentId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: InitiatePaymentDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<InitiatePaymentResponse> {
    return this.payments.initiate(
      appointmentId,
      request.auth!.userId,
      idempotencyKey || '',
      dto,
      extractClientIp(request) || '127.0.0.1',
    );
  }

  @Roles(Role.PATIENT)
  @Get(':appointmentId/status')
  status(
    @Param('appointmentId') appointmentId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<PaymentStatusResponse> {
    return this.payments.status(appointmentId, request.auth!.userId);
  }

  @Roles(Role.PATIENT)
  @Post(':appointmentId/cancel-pending')
  @HttpCode(HttpStatus.OK)
  cancelPending(
    @Param('appointmentId') appointmentId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<CancelPendingPaymentResponse> {
    return this.payments.cancelPending(appointmentId, request.auth!.userId);
  }

  @Roles(Role.PATIENT)
  @Post([':appointmentId/fallback-to-clinic', ':appointmentId/fallback-clinic'])
  @HttpCode(HttpStatus.OK)
  fallbackToClinic(
    @Param('appointmentId') appointmentId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.payments.fallbackToClinic(appointmentId, request.auth!.userId);
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
  @HttpCode(HttpStatus.NO_CONTENT)
  async momoIpn(
    @Body() payload: Record<string, unknown>,
  ): Promise<void> {
    await this.payments.handleMomoIpn(payload);
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('verify-return')
  @HttpCode(HttpStatus.OK)
  async verifyReturn(
    @Body() payload: { provider?: string; params: Record<string, string> },
  ): Promise<{ outcome: string }> {
    const params = payload?.params || {};
    const hasVnpay = Boolean(params['vnp_TxnRef'] || params['vnp_ResponseCode'] || params['vnp_SecureHash']);
    const hasMomo = Boolean(params['orderId'] || params['resultCode'] || params['signature']);
    const provider = payload?.provider?.toUpperCase() || (hasVnpay ? 'VNPAY' : hasMomo ? 'MOMO' : null);

    if (provider === 'VNPAY') {
      const outcome = await this.payments.handleVnpayIpn(params);
      return { outcome };
    }
    if (provider === 'MOMO') {
      const outcome = await this.payments.handleMomoIpn(params);
      return { outcome };
    }
    throw new BadRequestException('Không tìm thấy tham số xác thực cổng thanh toán hợp lệ.');
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('vnpay/return')
  async vnpayReturn(
    @Query() params: Record<string, string>,
  ): Promise<{ outcome: string }> {
    const outcome = await this.payments.handleVnpayIpn(params);
    return { outcome };
  }
}
