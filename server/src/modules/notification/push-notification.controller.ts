import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../../common/guards/authenticated-request';
import { Public } from '../../common/decorators/auth.decorators';
import { PushSubscribeDto } from './dto/push-subscribe.dto';
import { WebPushService } from './services/web-push.service';

@Controller('notifications/push')
export class PushNotificationController {
  constructor(private readonly webPushService: WebPushService) {}

  @Public()
  @Get('vapid-public-key')
  getVapidPublicKey(): { publicKey: string } {
    return {
      publicKey: this.webPushService.getPublicKey(),
    };
  }

  @Post('subscribe')
  async subscribe(
    @Req() req: AuthenticatedRequest,
    @Body() dto: PushSubscribeDto,
  ): Promise<{ success: boolean; message: string }> {
    const p256dh = dto.keys?.p256dh || dto.p256dh;
    const auth = dto.keys?.auth || dto.auth;

    if (!p256dh || !auth) {
      throw new BadRequestException('Thông tin khóa bảo mật p256dh và auth là bắt buộc.');
    }

    await this.webPushService.saveSubscription(
      req.auth!.userId,
      dto.endpoint,
      p256dh,
      auth,
    );

    return {
      success: true,
      message: 'Đăng ký nhận thông báo đẩy Web Push thành công.',
    };
  }

  @Post('test')
  async testPush(
    @Req() req: AuthenticatedRequest,
  ): Promise<{ success: boolean; sent: number }> {
    const sent = await this.webPushService.sendToUser(req.auth!.userId, {
      title: 'E-Healthcare Web Push',
      body: 'Thông báo đẩy thử nghiệm hoạt động tốt!',
      icon: '/assets/doctor.png',
      url: '/',
    });

    return { success: true, sent };
  }
}
