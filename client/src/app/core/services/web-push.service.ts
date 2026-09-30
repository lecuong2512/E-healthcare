import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface VapidKeyResponse {
  publicKey: string;
}

export interface PushSubscribeResponse {
  success: boolean;
  message: string;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

@Injectable({ providedIn: 'root' })
export class WebPushService {
  private readonly http = inject(HttpClient, { optional: true });

  readonly isSupported = signal<boolean>(false);
  readonly permission = signal<NotificationPermission>('default');
  readonly isSubscribed = signal<boolean>(false);
  readonly isSubscribing = signal<boolean>(false);

  constructor() {
    this.checkSupport();
  }

  private checkSupport(): void {
    if (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    ) {
      this.isSupported.set(true);
      this.permission.set(Notification.permission);
      this.checkCurrentSubscription();
    }
  }

  async checkCurrentSubscription(): Promise<boolean> {
    if (!this.isSupported()) return false;
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return false;
      const sub = await reg.pushManager.getSubscription();
      const subscribed = !!sub;
      this.isSubscribed.set(subscribed);
      return subscribed;
    } catch {
      return false;
    }
  }

  async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported()) return 'denied';
    const perm = await Notification.requestPermission();
    this.permission.set(perm);
    return perm;
  }

  async registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (!this.isSupported()) return null;
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });
      await navigator.serviceWorker.ready;
      return registration;
    } catch (error) {
      console.error('Service worker registration failed:', error);
      return null;
    }
  }

  async subscribe(): Promise<{ success: boolean; message: string }> {
    if (!this.isSupported() || !this.http) {
      return { success: false, message: 'Trình duyệt không hỗ trợ Web Push Notification hoặc chưa sẵn sàng.' };
    }

    this.isSubscribing.set(true);
    try {
      const perm = await this.requestPermission();
      if (perm !== 'granted') {
        this.isSubscribing.set(false);
        return {
          success: false,
          message: 'Bạn đã từ chối nhận thông báo. Hãy cho phép thông báo trong cài đặt trình duyệt.',
        };
      }

      const registration = await this.registerServiceWorker();
      if (!registration) {
        this.isSubscribing.set(false);
        return { success: false, message: 'Không thể kích hoạt Service Worker.' };
      }

      // Fetch VAPID public key from backend
      const { publicKey } = await firstValueFrom(
        this.http.get<VapidKeyResponse>('/api/v1/notifications/push/vapid-public-key'),
      );

      if (!publicKey) {
        this.isSubscribing.set(false);
        return { success: false, message: 'Không lấy được khóa VAPID từ máy chủ.' };
      }

      const applicationServerKey = urlBase64ToUint8Array(publicKey);
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      }

      const subJson = subscription.toJSON();
      const endpoint = subJson.endpoint;
      const p256dh = subJson.keys?.['p256dh'];
      const auth = subJson.keys?.['auth'];

      if (!endpoint || !p256dh || !auth) {
        this.isSubscribing.set(false);
        return { success: false, message: 'Lỗi thông tin khóa Push Subscription.' };
      }

      const response = await firstValueFrom(
        this.http.post<PushSubscribeResponse>('/api/v1/notifications/push/subscribe', {
          endpoint,
          p256dh,
          auth,
        }),
      );

      this.isSubscribed.set(true);
      this.isSubscribing.set(false);
      return { success: true, message: response.message || 'Đăng ký thông báo đẩy thành công.' };
    } catch (error: any) {
      this.isSubscribing.set(false);
      console.error('Push subscription failed:', error);
      return {
        success: false,
        message: error?.error?.message || error?.message || 'Không thể đăng ký nhận thông báo đẩy.',
      };
    }
  }
}
