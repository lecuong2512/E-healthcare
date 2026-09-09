import { Injectable } from '@angular/core';

/**
 * STUB — chưa triển khai đầy đủ trong task Base Architecture này.
 * Để sẵn vị trí/interface cho task sau (Realtime hàng đợi khám SRS-DOC-02,
 * queue-board SRS-REC, trạng thái slot SRS-PAT-02) kết nối Socket.io mà
 * không phải đổi cấu trúc thư mục core/services.
 *
 * Khi triển khai thật: kết nối tới API Gateway (namespace theo role), tự
 * disconnect() ở AuthService.logout(), và tự reconnect khi authInterceptor
 * refresh token thành công (access token đổi -> cần re-handshake socket auth).
 */
@Injectable({ providedIn: 'root' })
export class SocketService {
  connect(_namespace: string): void {
    // TODO: tích hợp socket.io-client khi làm task Realtime (chưa thuộc scope Base Architecture)
  }

  disconnect(): void {
    // TODO
  }
}
