import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { BookingService } from './booking.service';
import {
  ReserveSlotDto,
  ReleaseSlotDto,
  ConfirmBookingDto,
} from './dto';
import { Public, Roles } from '../../common/decorators/auth.decorators';
import { Role } from '@shared/enums';
import { AuthenticatedRequest } from '../../common/guards/authenticated-request';
import {
  ReserveSlotResponse,
  ReleaseSlotResponse,
  AppointmentResponse,
} from '@shared/interfaces';

@Controller('appointments')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  /**
   * Endpoint giữ chỗ khung giờ khám bệnh (Slot Reservation).
   * Lệnh nguyên tử Redis: SET lock:doctor:{doctorId}:slot:{slotId} {userId} NX EX 600
   * Xử lý tranh chấp: trả về HTTP 409 Conflict nếu slot đã bị khóa.
   */
  @Public()
  @Post('reserve-slot')
  @HttpCode(HttpStatus.CREATED)
  async reserveSlot(
    @Body() dto: ReserveSlotDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ReserveSlotResponse> {
    const authenticatedUserId = req.auth?.userId;
    return this.bookingService.reserveSlot(dto, authenticatedUserId);
  }

  /**
   * Endpoint giải phóng giữ chỗ khi người dùng hủy thao tác.
   */
  @Public()
  @Post('release-slot')
  @HttpCode(HttpStatus.OK)
  async releaseSlot(
    @Body() dto: ReleaseSlotDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ReleaseSlotResponse> {
    const authenticatedUserId = req.auth?.userId;
    return this.bookingService.releaseSlot(dto, authenticatedUserId);
  }

  /**
   * Endpoint xác nhận đặt khám và thanh toán sau tại phòng khám (Pay at Clinic).
   * Dùng DB Transaction với SELECT ... FOR UPDATE chốt slot sang BOOKED,
   * tạo Appointment CONFIRMED và giải phóng khóa Redis.
   */
  @Roles(Role.PATIENT)
  @Post('confirm-booking')
  @HttpCode(HttpStatus.CREATED)
  async confirmBooking(
    @Body() dto: ConfirmBookingDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<AppointmentResponse> {
    const authenticatedUserId = req.auth?.userId;
    return this.bookingService.confirmBooking(dto, authenticatedUserId);
  }

  /**
   * Kiểm tra trạng thái khóa của khung giờ khám.
   */
  @Public()
  @Get('slot-lock/:doctorId/:slotId')
  async getSlotLock(
    @Param('doctorId') doctorId: string,
    @Param('slotId') slotId: string,
  ): Promise<{ isLocked: boolean; holder: string | null; ttlSeconds: number }> {
    return this.bookingService.getSlotLockStatus(doctorId, slotId);
  }
}
