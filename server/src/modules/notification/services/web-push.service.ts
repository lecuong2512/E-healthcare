import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import webpush from 'web-push';
import { PushSubscriptionEntity } from '../../../database/entities/push-subscription.entity';
import { environment } from '../../../config/environment';

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  data?: Record<string, unknown>;
}

@Injectable()
export class WebPushService implements OnModuleInit {
  private readonly logger = new Logger(WebPushService.name);
  private publicKey!: string;
  private privateKey!: string;
  private subject!: string;

  constructor(
    @Optional() private readonly dataSource?: DataSource,
  ) {}

  onModuleInit() {
    this.subject = environment.VAPID_SUBJECT?.trim() || 'mailto:admin@ehealth.vn';

    const envPublic = environment.VAPID_PUBLIC_KEY?.trim();
    const envPrivate = environment.VAPID_PRIVATE_KEY?.trim();

    if (envPublic && envPrivate) {
      this.publicKey = envPublic;
      this.privateKey = envPrivate;
      this.logger.log('VAPID keys loaded from environment variables.');
    } else {
      // Generate ephemeral VAPID keys for development/testing if not set
      const generated = webpush.generateVAPIDKeys();
      this.publicKey = generated.publicKey;
      this.privateKey = generated.privateKey;
      this.logger.log('Generated ephemeral VAPID keys for Web Push.');
    }

    try {
      webpush.setVapidDetails(this.subject, this.publicKey, this.privateKey);
    } catch (err: unknown) {
      this.logger.warn(`Failed to configure VAPID details: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  getPublicKey(): string {
    return this.publicKey;
  }

  async saveSubscription(
    userId: string,
    endpoint: string,
    p256dh: string,
    auth: string,
  ): Promise<PushSubscriptionEntity> {
    if (!this.dataSource) {
      throw new Error('Database not initialized');
    }

    const repo = this.dataSource.getRepository(PushSubscriptionEntity);
    let sub = await repo.findOneBy({ endpoint });

    if (sub) {
      sub.userId = userId;
      sub.p256dh = p256dh;
      sub.auth = auth;
    } else {
      sub = repo.create({
        userId,
        endpoint,
        p256dh,
        auth,
      });
    }

    const saved = await repo.save(sub);
    this.logger.log(`Saved push subscription for user ${userId}`);
    return saved;
  }

  async sendToUser(
    userId: string,
    payload: PushNotificationPayload,
  ): Promise<number> {
    if (!this.dataSource) return 0;

    const repo = this.dataSource.getRepository(PushSubscriptionEntity);
    const subscriptions = await repo.find({ where: { userId } });

    if (!subscriptions.length) {
      this.logger.debug(`No push subscriptions found for user ${userId}`);
      return 0;
    }

    const notificationPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || '/assets/doctor.png',
      badge: payload.badge || '/assets/doctor.png',
      url: payload.url || '/',
      data: payload.data || { url: payload.url || '/' },
    });

    let successCount = 0;

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          notificationPayload,
        );
        successCount++;
      } catch (err: unknown) {
        const errorObj = err as { statusCode?: number; message?: string };
        this.logger.warn(`Failed to send web push to endpoint ${sub.endpoint}: ${errorObj?.message || err}`);
        // 404 or 410 means subscription is expired or unsubscribed
        if (errorObj?.statusCode === 404 || errorObj?.statusCode === 410) {
          this.logger.log(`Removing expired push subscription ${sub.id}`);
          await repo.delete({ id: sub.id });
        }
      }
    }

    return successCount;
  }

  async sendAppointmentConfirmed(
    userId: string,
    appointmentCode: string,
    doctorName: string,
    date: string,
    time: string,
  ): Promise<number> {
    return this.sendToUser(userId, {
      title: 'Lịch hẹn đã được xác nhận',
      body: `Lịch khám với BS. ${doctorName} vào ${time} ngày ${date} (Mã: ${appointmentCode}) đã được xác nhận thành công.`,
      icon: '/assets/doctor.png',
      url: '/patient/history',
      data: { appointmentCode, url: '/patient/history' },
    });
  }

  async sendAppointmentReminder(
    userId: string,
    appointmentCode: string,
    doctorName: string,
    date: string,
    time: string,
    reminderType: '24H' | '2H',
  ): Promise<number> {
    const title = reminderType === '24H' ? 'Nhắc lịch khám ngày mai' : 'Nhắc lịch khám sắp tới';
    const body = reminderType === '24H'
      ? `Nhắc bạn có lịch khám với BS. ${doctorName} vào ${time} ngày ${date} (Mã: ${appointmentCode}). Vui lòng chuẩn bị CCCD và hồ sơ cũ.`
      : `Lịch khám với BS. ${doctorName} sẽ diễn ra trong vòng 2 giờ tới (${time}, ngày ${date}). Vui lòng đến trước 15 phút.`;

    return this.sendToUser(userId, {
      title,
      body,
      icon: '/assets/doctor.png',
      url: '/patient/history',
      data: { appointmentCode, reminderType, url: '/patient/history' },
    });
  }
}
