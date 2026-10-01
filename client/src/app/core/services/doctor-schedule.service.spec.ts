import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DoctorScheduleService } from './doctor-schedule.service';
import { ShiftType, SlotStatus } from '@shared/enums';

describe('DoctorScheduleService', () => {
  let service: DoctorScheduleService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        DoctorScheduleService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(DoctorScheduleService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getMySchedules sends GET request with optional query params', () => {
    const mockResult = {
      doctorId: 'doc-1',
      roomNumber: '204',
      slots: [],
    };

    service.getMySchedules('2026-10-01', '2026-10-07').subscribe((res) => {
      expect(res).toEqual(mockResult);
    });

    const req = httpTesting.expectOne((request) =>
      request.url === '/api/v1/doctor/schedules' &&
      request.params.get('from') === '2026-10-01' &&
      request.params.get('to') === '2026-10-07'
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockResult);
  });

  it('createSchedule sends POST request with payload', () => {
    const payload = {
      date: '2026-10-05',
      shiftType: ShiftType.MORNING,
      slotDurationMinutes: 30,
    };
    const mockResult = {
      doctorId: 'doc-1',
      roomNumber: '204',
      slots: [],
    };

    service.createSchedule(payload).subscribe((res) => {
      expect(res).toEqual(mockResult);
    });

    const req = httpTesting.expectOne('/api/v1/doctor/schedules');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush(mockResult);
  });

  it('deleteSchedule sends DELETE request with scheduleId', () => {
    const scheduleId = 'uuid-slot-1';

    service.deleteSchedule(scheduleId).subscribe((res) => {
      expect(res).toBeNull();
    });

    const req = httpTesting.expectOne(`/api/v1/doctor/schedules/${scheduleId}`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});
