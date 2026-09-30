import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ScheduleConfigPage } from './schedule-config.page';
import {
  DoctorScheduleResult,
  DoctorScheduleService,
} from '../../../../core/services/doctor-schedule.service';
import { ShiftType, SlotStatus } from '@shared/enums';

describe('ScheduleConfigPage (BUG-NEW-07: Doctor Schedule PostgreSQL Integration)', () => {
  let component: ScheduleConfigPage;
  let fixture: ComponentFixture<ScheduleConfigPage>;
  let scheduleService: jasmine.SpyObj<DoctorScheduleService>;

  const mockScheduleResult: DoctorScheduleResult = {
    doctorId: 'doc-123',
    roomNumber: '204',
    slots: [
      {
        id: 'slot-1',
        doctorId: 'doc-123',
        date: '2026-10-05',
        startTime: '08:00',
        endTime: '08:30',
        status: SlotStatus.AVAILABLE,
        version: 1,
      },
      {
        id: 'slot-2',
        doctorId: 'doc-123',
        date: '2026-10-05',
        startTime: '08:30',
        endTime: '09:00',
        status: SlotStatus.BOOKED,
        version: 1,
      },
    ],
  };

  beforeEach(async () => {
    scheduleService = jasmine.createSpyObj<DoctorScheduleService>('DoctorScheduleService', [
      'getMySchedules',
      'createSchedule',
      'deleteSchedule',
    ]);

    scheduleService.getMySchedules.and.returnValue(of(mockScheduleResult));
    scheduleService.createSchedule.and.returnValue(of(mockScheduleResult));
    scheduleService.deleteSchedule.and.returnValue(of(undefined));

    await TestBed.configureTestingModule({
      imports: [ScheduleConfigPage],
      providers: [
        { provide: DoctorScheduleService, useValue: scheduleService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ScheduleConfigPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('TC-SCHEDULE-01: should create component and load real schedules from PostgreSQL via service', () => {
    expect(component).toBeTruthy();
    expect(scheduleService.getMySchedules).toHaveBeenCalled();
    expect(component.roomNumber).toBe('204');
    expect(component.scheduleSlots.length).toBe(2);
    expect(component.scheduleSlots[0].id).toBe('slot-1');
    expect(component.scheduleSlots[0].bookedPatients).toBe(0);
    expect(component.scheduleSlots[1].bookedPatients).toBe(1);
  });

  it('TC-SCHEDULE-02: should switch view mode between week and month', () => {
    component.setView('month');
    expect(component.viewMode).toBe('month');
    expect(scheduleService.getMySchedules).toHaveBeenCalled();

    component.setView('week');
    expect(component.viewMode).toBe('week');
  });

  it('TC-SCHEDULE-03: should open registration modal and set default form values', () => {
    component.openRegistration();
    expect(component.showRegistrationForm).toBe(true);
    expect(component.selectedShift).toBe('MORNING');
    expect(component.slotDuration).toBe(15);
  });

  it('TC-SCHEDULE-04: should call createSchedule API when registering a new shift', () => {
    spyOnProperty(component, 'isTargetDateInPast', 'get').and.returnValue(false);
    spyOnProperty(component, 'isAfterDeadline', 'get').and.returnValue(false);
    spyOnProperty(component, 'targetDate', 'get').and.returnValue('2026-10-12');

    component.registerShift();

    expect(scheduleService.createSchedule).toHaveBeenCalledWith({
      date: '2026-10-12',
      shiftType: ShiftType.MORNING,
      slotDurationMinutes: 15,
    });
    expect(component.showRegistrationForm).toBe(false);
  });

  it('TC-SCHEDULE-05: should cancel shift by calling deleteSchedule for each slot in shift', () => {
    const testDate = component.parseDate('2026-10-05');
    // Only cancel unbooked shifts
    component.scheduleSlots[1].status = SlotStatus.AVAILABLE;
    component.scheduleSlots[1].bookedPatients = 0;

    component.cancelShift(testDate, 'MORNING');

    expect(scheduleService.deleteSchedule).toHaveBeenCalledWith('slot-1');
    expect(scheduleService.deleteSchedule).toHaveBeenCalledWith('slot-2');
  });

  it('TC-SCHEDULE-06: should not allow canceling a shift that has booked appointments', () => {
    const testDate = component.parseDate('2026-10-05');
    component.scheduleSlots[1].bookedPatients = 1; // has booked

    scheduleService.deleteSchedule.calls.reset();
    component.cancelShift(testDate, 'MORNING');

    expect(scheduleService.deleteSchedule).not.toHaveBeenCalled();
  });
});
