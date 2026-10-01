import { Component, Input, OnDestroy, OnInit, Output, EventEmitter, signal } from '@angular/core';

/**
 * STUB — khung component, logic đếm ngược 10:00 giữ slot (Mục 5.1) sẽ hoàn
 * thiện ở task Booking Stepper (SRS-PAT-02). Đặt sẵn ở đây vì thuộc shared/components.
 * @Input seconds: thời gian đếm ngược (mặc định 600s = 10 phút khớp Redis lock TTL).
 * @Output expired: bắn ra khi về 0 để feature xử lý (vd. huỷ giữ chỗ, quay lại bước chọn giờ).
 */
@Component({
  selector: 'app-countdown-timer',
  standalone: true,
  template: `<span class="font-mono tabular-nums">{{ display() }}</span>`,
})
export class CountdownTimerComponent implements OnInit, OnDestroy {
  @Input() seconds = 600;
  @Output() expired = new EventEmitter<void>();

  private remaining = signal(0);
  private intervalId?: ReturnType<typeof setInterval>;

  display = () => {
    const m = Math.floor(this.remaining() / 60).toString().padStart(2, '0');
    const s = (this.remaining() % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  ngOnInit(): void {
    this.remaining.set(this.seconds);
    this.intervalId = setInterval(() => {
      this.remaining.update((v) => v - 1);
      if (this.remaining() <= 0) {
        clearInterval(this.intervalId);
        this.expired.emit();
      }
    }, 1000);
  }

  ngOnDestroy(): void {
    if (this.intervalId) clearInterval(this.intervalId);
  }
}
