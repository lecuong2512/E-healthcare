import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QueueBoardTicketViewModel } from './queue-board.models';
import { QueueBoardPage } from './queue-board.page';

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
});
