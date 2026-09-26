import {
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  InjectionToken,
  Input,
  Output,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import {
  BrowserQRCodeReader,
  IScannerControls,
} from '@zxing/browser';

const MAX_QR_TOKEN_LENGTH = 2_048;
const DUPLICATE_SCAN_WINDOW_MS = 2_000;

export interface QrCodeReader {
  decodeFromConstraints(
    constraints: MediaStreamConstraints,
    preview: HTMLVideoElement,
    callback: (result?: { getText(): string }) => void,
  ): Promise<IScannerControls>;
}

export const QR_CODE_READER_FACTORY = new InjectionToken<() => QrCodeReader>(
  'QR_CODE_READER_FACTORY',
  { providedIn: 'root', factory: () => () => new BrowserQRCodeReader() },
);

type CameraState = 'idle' | 'requesting' | 'active' | 'error';

@Component({
  selector: 'app-qr-scanner',
  standalone: true,
  templateUrl: './qr-scanner.component.html',
  styleUrl: './qr-scanner.component.scss',
})
export class QrScannerComponent {
  @Input() compact = false;
  @Output() scanned = new EventEmitter<string>();

  @ViewChild('preview') private preview?: ElementRef<HTMLVideoElement>;

  private readonly createReader = inject(QR_CODE_READER_FACTORY);
  private readonly destroyRef = inject(DestroyRef);
  private scannerControls?: IScannerControls;
  private lastScan?: { value: string; timestamp: number };

  readonly cameraState = signal<CameraState>('idle');
  readonly errorMessage = signal<string | null>(null);
  readonly mockQrCells = [
    true, false, true, true, false,
    false, true, true, false, true,
    true, true, false, false, true,
    false, true, false, true, true,
    true, false, true, false, true,
  ] as const;
  keyboardValue = '';

  constructor() {
    this.destroyRef.onDestroy(() => this.stopCamera());
  }

  async startCamera(): Promise<void> {
    if (this.cameraState() === 'requesting' || this.cameraState() === 'active') {
      return;
    }

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      this.setCameraError(
        'Camera chỉ hoạt động trên HTTPS hoặc localhost. Hãy dùng máy quét USB hoặc nhập mã thủ công.',
      );
      return;
    }

    const preview = this.preview?.nativeElement;
    if (!preview) {
      this.setCameraError('Không thể khởi tạo vùng xem camera.');
      return;
    }

    this.errorMessage.set(null);
    this.cameraState.set('requesting');

    try {
      const reader = this.createReader();
      this.scannerControls = await reader.decodeFromConstraints(
        {
          audio: false,
          video: { facingMode: { ideal: 'environment' } },
        },
        preview,
        (result) => {
          if (result) {
            this.acceptValue(result.getText());
          }
        },
      );
      this.cameraState.set('active');
    } catch (error: unknown) {
      this.stopCamera();
      this.setCameraError(this.cameraErrorMessage(error));
    }
  }

  stopCamera(): void {
    this.scannerControls?.stop();
    this.scannerControls = undefined;

    const stream = this.preview?.nativeElement.srcObject;
    if (stream instanceof MediaStream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
      this.preview!.nativeElement.srcObject = null;
    }

    if (this.cameraState() !== 'error') {
      this.cameraState.set('idle');
    }
  }

  submitKeyboardValue(): void {
    const accepted = this.acceptValue(this.keyboardValue);
    if (accepted) {
      this.keyboardValue = '';
    }
  }

  private acceptValue(rawValue: string): boolean {
    const value = rawValue.trim();

    if (!value) {
      this.errorMessage.set('Mã QR không được để trống.');
      return false;
    }

    if (value.length > MAX_QR_TOKEN_LENGTH) {
      this.errorMessage.set('Mã QR vượt quá giới hạn 2.048 ký tự.');
      return false;
    }

    const now = Date.now();
    if (
      this.lastScan?.value === value &&
      now - this.lastScan.timestamp < DUPLICATE_SCAN_WINDOW_MS
    ) {
      return false;
    }

    this.lastScan = { value, timestamp: now };
    this.errorMessage.set(null);
    this.scanned.emit(value);

    if (this.cameraState() === 'active') {
      this.stopCamera();
    }

    return true;
  }

  private setCameraError(message: string): void {
    this.cameraState.set('error');
    this.errorMessage.set(message);
  }

  private cameraErrorMessage(error: unknown): string {
    const errorName = error instanceof DOMException ? error.name : '';

    if (errorName === 'NotAllowedError' || errorName === 'SecurityError') {
      return 'Quyền camera đã bị từ chối. Hãy cấp quyền hoặc dùng máy quét USB.';
    }

    if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
      return 'Không tìm thấy camera trên thiết bị này.';
    }

    return 'Không thể mở camera. Hãy kiểm tra thiết bị và thử lại.';
  }
}
