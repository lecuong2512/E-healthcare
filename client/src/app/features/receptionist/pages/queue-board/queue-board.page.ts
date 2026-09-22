import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';

import { QueueBoardNextUpComponent } from './queue-board-next-up.component';
import { QueueBoardNowServingComponent } from './queue-board-now-serving.component';
import { QueueBoardPresentationStore } from './queue-board-presentation.store';

@Component({
  selector: 'app-queue-board-page',
  standalone: true,
  imports: [DatePipe, QueueBoardNowServingComponent, QueueBoardNextUpComponent],
  templateUrl: './queue-board.page.html',
  styleUrl: './queue-board.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [QueueBoardPresentationStore],
})
export class QueueBoardPage {
  private readonly destroyRef = inject(DestroyRef);
  readonly store = inject(QueueBoardPresentationStore);
  private audioContext?: AudioContext;
  private flashTimer?: ReturnType<typeof setTimeout>;

  readonly presentationStarted = signal(false);
  readonly muted = signal(false);
  readonly fullscreenError = signal<string | null>(null);
  readonly now = signal(new Date());

  constructor() {
    const clockTimer = setInterval(() => this.now.set(new Date()), 30_000);
    this.destroyRef.onDestroy(() => {
      clearInterval(clockTimer);
      clearTimeout(this.flashTimer);
      void this.audioContext?.close();
    });

    effect(() => {
      const calledTicketId = this.store.lastCalledTicketId();
      if (!calledTicketId || !this.presentationStarted()) {
        return;
      }

      this.playChime();
      clearTimeout(this.flashTimer);
      this.flashTimer = setTimeout(
        () => this.store.clearAnnouncement(),
        4_000,
      );
    });
  }

  async startPresentation(): Promise<void> {
    this.fullscreenError.set(null);

    try {
      this.unlockAudio();
      if (
        !document.fullscreenElement &&
        document.documentElement.requestFullscreen
      ) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      this.fullscreenError.set(
        'Trình duyệt không thể bật toàn màn hình. Bảng vẫn tiếp tục hoạt động.',
      );
    } finally {
      this.presentationStarted.set(true);
    }
  }

  toggleMuted(): void {
    this.muted.update((value) => !value);
  }

  connectionLabel(): string {
    switch (this.store.connectionState()) {
      case 'connected':
        return 'Đang cập nhật trực tiếp';
      case 'connecting':
        return 'Đang kết nối';
      case 'reconnecting':
        return 'Đang kết nối lại';
      case 'error':
        return 'Mất kết nối';
      default:
        return 'Chưa kết nối';
    }
  }

  private unlockAudio(): void {
    const AudioContextConstructor =
      window.AudioContext ??
      (window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }).webkitAudioContext;

    if (AudioContextConstructor && !this.audioContext) {
      this.audioContext = new AudioContextConstructor();
    }

    if (this.audioContext?.state === 'suspended') {
      void this.audioContext.resume();
    }
  }

  private playChime(): void {
    if (this.muted() || !this.audioContext) {
      return;
    }

    const oscillator = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    const startedAt = this.audioContext.currentTime;

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(660, startedAt);
    oscillator.frequency.setValueAtTime(880, startedAt + 0.16);
    gain.gain.setValueAtTime(0.0001, startedAt);
    gain.gain.exponentialRampToValueAtTime(0.12, startedAt + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + 0.48);
    oscillator.connect(gain);
    gain.connect(this.audioContext.destination);
    oscillator.start(startedAt);
    oscillator.stop(startedAt + 0.5);
  }
}
