import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick,
} from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { QueueBoardTicketViewModel } from './queue-board.models';
import { QueueBoardPage } from './queue-board.page';
import { QueueBoardRealtimeService } from './queue-board-realtime.service';

const servingTicket: QueueBoardTicketViewModel = {
  id: 'ticket-12',
  queueNumber: 12,
  maskedPatientName: 'Nguyễn V. A',
  roomNumber: 'P.201',
  specialtyName: 'Tim mạch',
  doctorName: 'Trần Minh An',
};

describe('QueueBoardPage', () => {
  let fixture: ComponentFixture<QueueBoardPage>;
  let component: QueueBoardPage;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QueueBoardPage],
      providers: [
        provideRouter([]),
        {
          provide: QueueBoardRealtimeService,
          useValue: { connect: jasmine.createSpy().and.returnValue(() => undefined) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(QueueBoardPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('starts behind a user-gesture presentation launcher', () => {
    const launcher = fixture.nativeElement.querySelector(
      '[role="dialog"]',
    ) as HTMLElement;

    expect(launcher).not.toBeNull();
    expect(launcher.textContent).toContain('Bắt đầu trình chiếu');
  });

  it('renders masked patient information and required clinical routing fields', () => {
    component.store.hydrate({
      nowServing: [servingTicket],
      nextUp: [{ ...servingTicket, id: 'ticket-13', queueNumber: 13 }],
      updatedAt: new Date(),
    });
    fixture.detectChanges();

    const content = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(content).toContain('Nguyễn V. A');
    expect(content).toContain('Phòng P.201');
    expect(content).toContain('Tim mạch');
    expect(content).toContain('BS. Trần Minh An');
    expect(content).toContain('13');
  });

  it('shows connection state using text in addition to color', () => {
    component.store.setConnectionState('reconnecting');
    fixture.detectChanges();

    const status = fixture.nativeElement.querySelector(
      '[role="status"]',
    ) as HTMLElement;
    expect(status.textContent).toContain('Đang kết nối lại');
  });

  it('supports an explicit mute control', () => {
    expect(component.muted()).toBeFalse();

    component.toggleMuted();

    expect(component.muted()).toBeTrue();
  });

  it('renders a valid call event within the 500ms presentation budget', fakeAsync(() => {
    component.muted.set(true);
    component.presentationStarted.set(true);

    component.applyRealtimeEvent({
      occurredAt: '2026-09-22T03:00:00.000Z',
      previousStatus: 'CHECKED_IN',
      status: 'IN_CONSULTATION',
      ticket: servingTicket,
    });
    fixture.detectChanges();
    tick(20);

    expect(component.store.nowServing()[0].id).toBe(servingTicket.id);
    expect(component.lastRenderLatencyMs()).not.toBeNull();
    expect(component.lastRenderLatencyMs()!).toBeLessThan(500);
    tick(5_000);
  }));

  it('announces an expired presentation session with text', () => {
    component.store.setConnectionState('expired');
    fixture.detectChanges();

    const status = fixture.nativeElement.querySelector(
      '[role="status"]',
    ) as HTMLElement;
    expect(status.textContent).toContain('Phiên trình chiếu đã hết hạn');
  });

  it('provides a return to check-in desk button in the presentation launcher', () => {
    const cancelButton = fixture.nativeElement.querySelector(
      '.presentation-launcher__cancel',
    ) as HTMLAnchorElement;

    expect(cancelButton).not.toBeNull();
    expect(cancelButton.textContent).toContain('Quay lại quầy lễ tân');
    const href =
      cancelButton.getAttribute('href') ||
      cancelButton.getAttribute('ng-reflect-router-link') ||
      '';
    expect(href).toContain('/receptionist/checkin');
  });

  it('provides an exit presentation button that exits fullscreen and navigates back to check-in', async () => {
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));

    const exitButton = fixture.nativeElement.querySelector(
      '.queue-board__exit',
    ) as HTMLButtonElement;

    expect(exitButton).not.toBeNull();
    expect(exitButton.getAttribute('aria-label')).toBe(
      'Thoát chế độ trình chiếu / Quay lại quầy',
    );

    exitButton.click();
    expect(router.navigate).toHaveBeenCalledWith(['/receptionist/checkin']);
  });
});
