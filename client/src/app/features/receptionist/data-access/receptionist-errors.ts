import { HttpErrorResponse } from '@angular/common/http';

import { WalkInPatientSelectionError } from '@shared/interfaces';

export type ReceptionErrorCode =
  | 'QR_EXPIRED'
  | 'PATIENT_SELECTION_REQUIRED'
  | 'SLOT_CONFLICT'
  | 'PAYMENT_REQUIRED'
  | 'CHECKIN_WINDOW_CLOSED'
  | 'NOT_FOUND'
  | 'SERVICE_UNAVAILABLE'
  | 'NETWORK'
  | 'VALIDATION'
  | 'UNKNOWN';

export interface ReceptionFeatureError {
  readonly code: ReceptionErrorCode;
  readonly message: string;
  readonly status: number;
  readonly selection?: WalkInPatientSelectionError;
}

export function mapReceptionError(error: unknown): ReceptionFeatureError {
  if (!(error instanceof HttpErrorResponse)) {
    return {
      code: 'UNKNOWN',
      message: 'Đã xảy ra lỗi không xác định. Vui lòng thử lại.',
      status: -1,
    };
  }

  const selection = readPatientSelection(error.error);
  if (error.status === 409 && selection) {
    return {
      code: 'PATIENT_SELECTION_REQUIRED',
      message: selection.message,
      status: error.status,
      selection,
    };
  }

  const serverMessage = readMessage(error.error);

  if (error.status === 0) {
    return {
      code: 'NETWORK',
      message: 'Không thể kết nối máy chủ. Dữ liệu đã nhập vẫn được giữ lại.',
      status: error.status,
    };
  }
  if (error.status === 410) {
    return {
      code: 'QR_EXPIRED',
      message: 'Mã QR đã hết hạn. Vui lòng yêu cầu bệnh nhân mở mã QR mới.',
      status: error.status,
    };
  }
  if (error.status === 503) {
    return {
      code: 'SERVICE_UNAVAILABLE',
      message: serverMessage || 'Dịch vụ tạm thời chưa sẵn sàng. Vui lòng thử lại.',
      status: error.status,
    };
  }
  if (error.status === 404) {
    return {
      code: 'NOT_FOUND',
      message: serverMessage || 'Không tìm thấy lịch khám phù hợp.',
      status: error.status,
    };
  }
  if (
    error.status === 409 &&
    /(slot|khung khám|khung giờ|giữ|vừa được sử dụng)/i.test(serverMessage)
  ) {
    return {
      code: 'SLOT_CONFLICT',
      message: serverMessage || 'Khung giờ vừa được sử dụng. Vui lòng chọn lại.',
      status: error.status,
    };
  }
  if (/(thanh toán|payment)/i.test(serverMessage)) {
    return {
      code: 'PAYMENT_REQUIRED',
      message: serverMessage,
      status: error.status,
    };
  }
  if (/(cửa sổ|check-in|quá sớm|quá muộn)/i.test(serverMessage)) {
    return {
      code: 'CHECKIN_WINDOW_CLOSED',
      message: serverMessage,
      status: error.status,
    };
  }
  if (error.status === 400) {
    return {
      code: 'VALIDATION',
      message: serverMessage || 'Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại.',
      status: error.status,
    };
  }

  return {
    code: 'UNKNOWN',
    message: serverMessage || 'Hệ thống đang gặp sự cố. Vui lòng thử lại.',
    status: error.status,
  };
}

function readPatientSelection(
  body: unknown,
): WalkInPatientSelectionError | undefined {
  const candidates = [body, readRecord(body)?.['message']];

  for (const candidate of candidates) {
    const record = readRecord(candidate);
    if (
      record?.['code'] === 'PATIENT_SELECTION_REQUIRED' &&
      Array.isArray(record['candidates']) &&
      typeof record['message'] === 'string'
    ) {
      return record as unknown as WalkInPatientSelectionError;
    }
  }

  return undefined;
}

function readMessage(body: unknown): string {
  const record = readRecord(body);
  const message = record?.['message'];

  if (typeof message === 'string') {
    return message;
  }
  if (Array.isArray(message)) {
    return message
      .filter((item): item is string => typeof item === 'string')
      .join(' ');
  }

  return '';
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}
