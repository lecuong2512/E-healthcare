import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { PatientQueuePage } from './patient-queue.page';
import { SocketService } from '../../../../core/services/socket.service';
import { AppointmentStatus, QueueSource } from '@shared/enums';
import { QueueSnapshot, QueueStatusChanged, QueueTicket } from '@shared/interfaces';
import { QUEUE_SNAPSHOT_EVENT } from '@shared/constants/queue-socket.constants';

describe('PatientQueuePage (SRS-DOC-02)', () => {
  let component: PatientQueuePage;
  let fixture: ComponentFixture<PatientQueuePage>;
  let router: Router;
  let httpClientSpy: jasmine.SpyObj<HttpClient>;
  let socketServiceSpy: jasmine.SpyObj<SocketService>;
  let mockSocket: { on: jasmine.Spy; off: jasmine.Spy; emit: jasmine.Spy };
  const socketCallbacks: Record<string, (payload: unknown) => void> = {};

  const mockTickets: QueueTicket[] = [
    {
      appointmentId: 'apt-001',
      appointmentCode: 'APT-260907-8891',
      patientName: 'Nguyễn Thị Bình',
      doctorId: 'doc-001',
      doctorName: 'Trần Văn Tiến',
      specialtyName: 'Tim mạch',
      roomNumber: '204',
      status: AppointmentStatus.COMPLETED,
      queueNumber: 1,
      queueDate: '2026-09-30',
      queueSource: QueueSource.APPOINTMENT,
      checkedInAt: '2026-09-30T08:00:00.000Z',
    },
    {
      appointmentId: 'apt-002',
      appointmentCode: 'APT-260907-8894',
      patientName: 'Trần Văn A',
      doctorId: 'doc-001',
      doctorName: 'Trần Văn Tiến',
      specialtyName: 'Tim mạch',
      roomNumber: '204',
      status: AppointmentStatus.IN_CONSULTATION,
      queueNumber: 2,
      queueDate: '2026-09-30',
      queueSource: QueueSource.WALK_IN,
      checkedInAt: '2026-09-30T08:30:00.000Z',
    },
    {
      appointmentId: 'apt-003',
      appointmentCode: 'APT-260907-8895',
      patientName: 'Hoàng Minh Tuấn',
      doctorId: 'doc-001',
      doctorName: 'Trần Văn Tiến',
      specialtyName: 'Tim mạch',
      roomNumber: '204',
      status: AppointmentStatus.CHECKED_IN,
      queueNumber: 3,
      queueDate: '2026-09-30',
      queueSource: QueueSource.WALK_IN,
      checkedInAt: '2026-09-30T09:00:00.000Z',
    },
    {
      appointmentId: 'apt-004',
      appointmentCode: 'APT-260907-8899',
      patientName: 'Ngô Văn Hùng',
      doctorId: 'doc-001',
      doctorName: 'Trần Văn Tiến',
      specialtyName: 'Tim mạch',
      roomNumber: '204',
      status: AppointmentStatus.NO_SHOW,
      queueNumber: 4,
      queueDate: '2026-09-30',
      queueSource: QueueSource.APPOINTMENT,
      checkedInAt: '2026-09-30T09:30:00.000Z',
    },
  ];

  const mockSnapshot: QueueSnapshot = {
    scope: 'DOCTOR',
    doctorId: 'doc-001',
    date: '2026-09-30',
    items: mockTickets,
  };

  beforeEach(async () => {
    httpClientSpy = jasmine.createSpyObj<HttpClient>('HttpClient', ['get', 'patch']);
    httpClientSpy.get.and.returnValue(of(mockSnapshot));
    httpClientSpy.patch.and.returnValue(of({}));

    mockSocket = {
      on: jasmine.createSpy('on').and.callFake((evt: string, cb: (payload: unknown) => void) => {
        socketCallbacks[evt] = cb;
      }),
      off: jasmine.createSpy('off'),
      emit: jasmine.createSpy('emit'),
    };

    socketServiceSpy = jasmine.createSpyObj<SocketService>('SocketService', ['connect']);
    socketServiceSpy.connect.and.returnValue(mockSocket as never);

    await TestBed.configureTestingModule({
      imports: [PatientQueuePage],
      providers: [
        provideRouter([]),
        { provide: HttpClient, useValue: httpClientSpy },
        { provide: SocketService, useValue: socketServiceSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PatientQueuePage);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    spyOn(router, 'navigate');
    fixture.detectChanges();
  });

  it('TC-UI-QUEUE-01: should create component and initialize queue list from backend API', () => {
    expect(component).toBeTruthy();
    expect(httpClientSpy.get).toHaveBeenCalledWith('/api/v1/doctor/queue');
    expect(component.patients.length).toBeGreaterThan(0);
    expect(component.doctorName).toBe('Trần Văn Tiến');
    expect(component.roomNumber).toBe('204');
  });

  it('TC-UI-QUEUE-02: should compute metrics correctly for queue board tabs', () => {
    const metrics = component.metrics;
    expect(metrics.length).toBe(5);

    const totalMetric = metrics.find((m) => m.label === 'Tổng ca');
    const waitingMetric = metrics.find((m) => m.label === 'Đang đợi');
    const inConsultMetric = metrics.find((m) => m.label === 'Đang khám');
    const completedMetric = metrics.find((m) => m.label === 'Đã xong');
    const noShowMetric = metrics.find((m) => m.label === 'Vắng mặt');

    expect(totalMetric?.value).toBe(component.patients.length);
    expect(waitingMetric?.value).toBe(
      component.patients.filter((p) => p.status === 'CHECKED_IN' || p.status === 'CONFIRMED').length,
    );
    expect(inConsultMetric?.value).toBe(
      component.patients.filter((p) => p.status === 'IN_CONSULTATION').length,
    );
    expect(completedMetric?.value).toBe(
      component.patients.filter((p) => p.status === 'COMPLETED').length,
    );
    expect(noShowMetric?.value).toBe(
      component.patients.filter((p) => p.status === 'NO_SHOW').length,
    );
  });

  it('TC-UI-QUEUE-03: should transition CHECKED_IN to IN_CONSULTATION and navigate to consultation room', () => {
    const checkedInPatient = component.patients.find((p) => p.status === 'CHECKED_IN');
    expect(checkedInPatient).toBeTruthy();

    component.startConsultation(checkedInPatient!);

    expect(checkedInPatient!.status).toBe('IN_CONSULTATION');
    expect(httpClientSpy.patch).toHaveBeenCalledWith(
      `/api/v1/appointments/${checkedInPatient!.id}/status`,
      { status: 'IN_CONSULTATION' },
    );
    expect(router.navigate).toHaveBeenCalledWith([
      '/doctor/consultation',
      checkedInPatient!.id || checkedInPatient!.code,
    ]);
  });

  it('TC-UI-QUEUE-04: should navigate directly when patient is already IN_CONSULTATION', () => {
    const inConsultPatient = component.patients.find((p) => p.status === 'IN_CONSULTATION');
    expect(inConsultPatient).toBeTruthy();

    component.startConsultation(inConsultPatient!);

    expect(inConsultPatient!.status).toBe('IN_CONSULTATION');
    expect(router.navigate).toHaveBeenCalledWith([
      '/doctor/consultation',
      inConsultPatient!.id || inConsultPatient!.code,
    ]);
  });

  it('TC-UI-QUEUE-05: should render status badges with distinct visual styling according to SRS-DOC-02', () => {
    expect(component.statusLabels['CONFIRMED']).toBe('Đã xác nhận');
    expect(component.statusLabels['CHECKED_IN']).toBe('Đã tiếp nhận');
    expect(component.statusLabels['IN_CONSULTATION']).toBe('Đang khám');
    expect(component.statusLabels['COMPLETED']).toBe('Đã hoàn tất');
    expect(component.statusLabels['NO_SHOW']).toBe('Vắng mặt');

    expect(component.statusClasses['CONFIRMED']).toContain('bg-slate-100');
    expect(component.statusClasses['CHECKED_IN']).toContain('bg-sky-100');
    expect(component.statusClasses['IN_CONSULTATION']).toContain('bg-purple-100');
    expect(component.statusClasses['COMPLETED']).toContain('bg-emerald-100');
    expect(component.statusClasses['NO_SHOW']).toContain('bg-red-100');
  });

  it('TC-UI-QUEUE-06: should connect to SocketService and update queue on real-time snapshot', () => {
    expect(socketServiceSpy.connect).toHaveBeenCalled();
    const updatedSnapshot: QueueSnapshot = {
      scope: 'DOCTOR',
      doctorId: 'doc-001',
      date: '2026-09-30',
      items: [mockTickets[0]],
    };

    socketCallbacks[QUEUE_SNAPSHOT_EVENT]?.(updatedSnapshot);
    expect(component.patients.length).toBe(1);
    expect(component.patients[0].id).toBe('apt-001');
  });

  it('TC-UI-QUEUE-07: should update patient status on real-time status_changed event', () => {
    const statusEvent: QueueStatusChanged = {
      appointmentId: 'apt-003',
      appointmentCode: 'APT-260907-8895',
      doctorId: 'doc-001',
      previousStatus: AppointmentStatus.CHECKED_IN,
      status: AppointmentStatus.IN_CONSULTATION,
      queueNumber: 3,
      source: 'APPOINTMENT_LIFECYCLE',
      occurredAt: new Date().toISOString(),
      ticket: {
        ...mockTickets[2],
        status: AppointmentStatus.IN_CONSULTATION,
      },
    };

    socketCallbacks['queue.status_changed']?.(statusEvent);
    const updatedPatient = component.patients.find((p) => p.id === 'apt-003');
    expect(updatedPatient?.status).toBe('IN_CONSULTATION');
  });
});
