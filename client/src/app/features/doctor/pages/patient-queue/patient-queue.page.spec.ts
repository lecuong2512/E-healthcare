import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { PatientQueuePage } from './patient-queue.page';

describe('PatientQueuePage (SRS-DOC-02)', () => {
  let component: PatientQueuePage;
  let fixture: ComponentFixture<PatientQueuePage>;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PatientQueuePage],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(PatientQueuePage);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    spyOn(router, 'navigate');
    fixture.detectChanges();
  });

  it('TC-UI-QUEUE-01: should create component and initialize default queue list', () => {
    expect(component).toBeTruthy();
    expect(component.patients.length).toBeGreaterThan(0);
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
    expect(router.navigate).toHaveBeenCalledWith([
      '/doctor/consultation',
      checkedInPatient!.code,
    ]);
  });

  it('TC-UI-QUEUE-04: should navigate directly when patient is already IN_CONSULTATION', () => {
    const inConsultPatient = component.patients.find((p) => p.status === 'IN_CONSULTATION');
    expect(inConsultPatient).toBeTruthy();

    component.startConsultation(inConsultPatient!);

    expect(inConsultPatient!.status).toBe('IN_CONSULTATION');
    expect(router.navigate).toHaveBeenCalledWith([
      '/doctor/consultation',
      inConsultPatient!.code,
    ]);
  });

  it('TC-UI-QUEUE-05: should render status badges with distinct visual styling according to SRS-DOC-02', () => {
    expect(component.statusLabels.CONFIRMED).toBe('Đã xác nhận');
    expect(component.statusLabels.CHECKED_IN).toBe('Đã tiếp nhận');
    expect(component.statusLabels.IN_CONSULTATION).toBe('Đang khám');
    expect(component.statusLabels.COMPLETED).toBe('Đã hoàn tất');
    expect(component.statusLabels.NO_SHOW).toBe('Vắng mặt');

    expect(component.statusClasses.CONFIRMED).toContain('bg-slate-100');
    expect(component.statusClasses.CHECKED_IN).toContain('bg-sky-100');
    expect(component.statusClasses.IN_CONSULTATION).toContain('bg-purple-100');
    expect(component.statusClasses.COMPLETED).toContain('bg-emerald-100');
    expect(component.statusClasses.NO_SHOW).toContain('bg-red-100');
  });
});
