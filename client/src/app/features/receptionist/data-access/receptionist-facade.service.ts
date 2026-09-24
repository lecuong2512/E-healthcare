import { Injectable, effect, inject, signal } from '@angular/core';
import { Subscription, finalize, map } from 'rxjs';
import { Socket } from 'socket.io-client';

import {
  APPOINTMENT_STATUS_CHANGED_EVENT,
  QUEUE_AUTH_EXPIRED_EVENT,
  QUEUE_NAMESPACE,
  QUEUE_SNAPSHOT_EVENT,
  QUEUE_SYNC_EVENT,
} from '@shared/constants/queue-socket.constants';
import {
  CounterPaymentReceipt,
  QueueSnapshot,
  QueueStatusChanged,
  ReceptionAppointment,
} from '@shared/interfaces';
import {
  SocketConnectionState,
  SocketService,
} from '../../../core/services/socket.service';
import {
  CounterPaymentIntent,
  ReceptionAppointmentViewModel,
  ReceptionLookupIntent,
  ReceptionQueueConnectionState,
  ReceptionQueueSummaryViewModel,
  WalkInBookingIntent,
  WalkInDoctorSearchIntent,
  WalkInDoctorViewModel,
  WalkInDraftIntent,
  WalkInPatientCandidateViewModel,
  WalkInSuccessViewModel,
} from '../models/reception-presentation.models';
import { ReceptionistApiService } from './receptionist-api.service';
import { mapReceptionError } from './receptionist-errors';
import {
  mapCheckInResult,
  mapCounterPaymentIntent,
  mapPatientCandidates,
  mapQueueSnapshotToReceptionSummary,
  mapReceptionAppointment,
  mapWalkInBookingIntent,
  mapWalkInDoctor,
  mapWalkInSuccess,
  reconcileQueueSnapshot,
} from './receptionist-mappers';

@Injectable({ providedIn: 'root' })
export class ReceptionistFacade {
  private readonly api = inject(ReceptionistApiService);
  private readonly socketService = inject(SocketService);

  private readonly _appointments = signal<
    readonly ReceptionAppointmentViewModel[]
  >([]);
  private readonly _selectedAppointment =
    signal<ReceptionAppointmentViewModel | null>(null);
  private readonly _loading = signal(false);
  private readonly _paymentPending = signal(false);
  private readonly _lastReceipt = signal<CounterPaymentReceipt | null>(null);
  private readonly _checkInPending = signal(false);
  private readonly _checkInError = signal<string | null>(null);
  private readonly _queueSnapshot = signal<QueueSnapshot | null>(null);
  private readonly _queueSummary =
    signal<ReceptionQueueSummaryViewModel | null>(null);
  private readonly _queueConnectionState =
    signal<ReceptionQueueConnectionState>('disconnected');
  private readonly _walkInDoctors = signal<readonly WalkInDoctorViewModel[]>([]);
  private readonly _walkInLoadingDoctors = signal(false);
  private readonly _walkInSubmitting = signal(false);
  private readonly _walkInError = signal<string | null>(null);
  private readonly _walkInSlotConflict = signal(false);
  private readonly _walkInCandidates = signal<
    readonly WalkInPatientCandidateViewModel[]
  >([]);
  private readonly _walkInSuccess = signal<WalkInSuccessViewModel | null>(null);
  private readonly _walkInDraft = signal<WalkInDraftIntent | null>(null);

  readonly appointments = this._appointments.asReadonly();
  readonly selectedAppointment = this._selectedAppointment.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly paymentPending = this._paymentPending.asReadonly();
  readonly lastReceipt = this._lastReceipt.asReadonly();
  readonly checkInPending = this._checkInPending.asReadonly();
  readonly checkInError = this._checkInError.asReadonly();
  readonly queueSummary = this._queueSummary.asReadonly();
  readonly queueConnectionState = this._queueConnectionState.asReadonly();
  readonly walkInDoctors = this._walkInDoctors.asReadonly();
  readonly walkInLoadingDoctors = this._walkInLoadingDoctors.asReadonly();
  readonly walkInSubmitting = this._walkInSubmitting.asReadonly();
  readonly walkInError = this._walkInError.asReadonly();
  readonly walkInSlotConflict = this._walkInSlotConflict.asReadonly();
  readonly walkInCandidates = this._walkInCandidates.asReadonly();
  readonly walkInSuccess = this._walkInSuccess.asReadonly();
  readonly walkInDraft = this._walkInDraft.asReadonly();

  private activeQrToken: string | null = null;
  private activeQrAppointmentId: string | null = null;
  private queueSocket: Socket | null = null;
  private queueConsumers = 0;
  private walkInSession = 0;
  private doctorSearch: Subscription | null = null;
  private doctorSearchSerial = 0;

  private readonly handleQueueSnapshot = (snapshot: QueueSnapshot): void => {
    this.setQueueSnapshot(snapshot);
  };

  private readonly handleQueueStatusChanged = (
    event: QueueStatusChanged,
  ): void => {
    this.setQueueSnapshot(
      reconcileQueueSnapshot(this._queueSnapshot(), event),
    );
  };

  private readonly handleQueueAuthExpired = (): void => {
    this._queueConnectionState.set('expired');
  };

  private readonly handleQueueConnected = (): void => {
    this.queueSocket?.emit(QUEUE_SYNC_EVENT);
  };

  constructor() {
    effect(
      () => {
        const state = this.socketService.connectionStates()[QUEUE_NAMESPACE];
        if (state) {
          this._queueConnectionState.set(this.mapConnectionState(state));
        }
      },
      { allowSignalWrites: true },
    );
  }

  lookup(intent: ReceptionLookupIntent): void {
    if (this._loading()) {
      return;
    }

    this._loading.set(true);
    this._checkInError.set(null);
    this._appointments.set([]);
    this._selectedAppointment.set(null);
    this._lastReceipt.set(null);
    this.activeQrToken = intent.kind === 'QR_TOKEN' ? intent.value : null;
    this.activeQrAppointmentId = null;

    const lookup$ =
      intent.kind === 'QR_TOKEN'
        ? this.api.lookupQr(intent.value).pipe(map((appointment) => [appointment]))
        : this.api.lookupAppointments(
            intent.kind === 'PHONE'
              ? { phone: intent.value }
              : { code: intent.value },
          );

    lookup$
      .pipe(finalize(() => this._loading.set(false)))
      .subscribe({
        next: (appointments) => {
          const viewModels = appointments.map(mapReceptionAppointment);
          this._appointments.set(viewModels);
          this._selectedAppointment.set(
            viewModels.length === 1 ? viewModels[0] : null,
          );
          this.activeQrAppointmentId =
            intent.kind === 'QR_TOKEN' && viewModels.length === 1
              ? viewModels[0].id
              : null;

          if (!viewModels.length) {
            this._checkInError.set(
              'Không tìm thấy lịch khám hôm nay theo thông tin đã nhập.',
            );
          }
        },
        error: (error) => {
          this._checkInError.set(mapReceptionError(error).message);
          this.activeQrToken = null;
          this.activeQrAppointmentId = null;
        },
      });
  }

  selectAppointment(appointment: ReceptionAppointmentViewModel): void {
    this._selectedAppointment.set(appointment);
    this._checkInError.set(null);
    this._lastReceipt.set(null);

    if (appointment.id !== this.activeQrAppointmentId) {
      this.activeQrToken = null;
      this.activeQrAppointmentId = null;
    }
  }

  collectPayment(intent: CounterPaymentIntent): void {
    const appointment = this.findAppointment(intent.appointmentId);
    if (!appointment || this._paymentPending() || this._lastReceipt()?.appointmentCode === appointment.appointmentCode || !appointment.requiresPayment) {
      return;
    }

    this._paymentPending.set(true);
    this._checkInError.set(null);

    this.api.collectPayment(intent.appointmentId, mapCounterPaymentIntent(intent))
      .pipe(finalize(() => this._paymentPending.set(false)))
      .subscribe({
        next: (receipt) => {
          this._lastReceipt.set(receipt);
          this.api.lookupAppointments({ code: appointment.appointmentCode }).subscribe({
            next: (appointments) => this.applyAppointmentRefresh(appointments),
            error: () => this._checkInError.set('Đã thu tiền, chưa đồng bộ được trạng thái. Không thu tiền lần nữa; hãy tải lại trạng thái.'),
          });
        },
        error: (error) => this._checkInError.set(mapReceptionError(error).message),
      });
  }

  loadReceipt(appointmentId: string): void {
    if (this._paymentPending()) return;
    this._checkInError.set(null);
    this.api.getReceipt(appointmentId).subscribe({
      next: (receipt) => {
        this._lastReceipt.set(receipt);
        setTimeout(() => window.print());
      },
      error: (error) => this._checkInError.set(mapReceptionError(error).message),
    });
  }

  checkIn(appointmentId: string): void {
    const appointment = this.findAppointment(appointmentId);
    if (!appointment || this._checkInPending()) {
      return;
    }

    this._checkInPending.set(true);
    this._checkInError.set(null);

    const checkIn$ =
      this.activeQrToken && this.activeQrAppointmentId === appointmentId
        ? this.api.checkInByQr(this.activeQrToken)
        : this.api.checkIn(appointmentId);

    checkIn$
      .pipe(finalize(() => this._checkInPending.set(false)))
      .subscribe({
        next: (response) => {
          const updated = mapCheckInResult(appointment, response);
          this.replaceAppointment(updated);
          this._selectedAppointment.set(updated);
          this.activeQrToken = null;
          this.activeQrAppointmentId = null;
          this.refreshQueue();
        },
        error: (error) =>
          this._checkInError.set(mapReceptionError(error).message),
      });
  }

  refreshAppointment(appointmentId: string): void {
    const appointment = this.findAppointment(appointmentId);
    if (!appointment || this._loading()) {
      return;
    }

    this._loading.set(true);
    this._checkInError.set(null);
    this.api
      .lookupAppointments({ code: appointment.appointmentCode })
      .pipe(finalize(() => this._loading.set(false)))
      .subscribe({
        next: (appointments) => this.applyAppointmentRefresh(appointments),
        error: (error) =>
          this._checkInError.set(mapReceptionError(error).message),
      });
  }

  searchWalkInDoctors(intent: WalkInDoctorSearchIntent): void {
    this.doctorSearch?.unsubscribe();
    const serial = ++this.doctorSearchSerial;

    this._walkInLoadingDoctors.set(true);
    this._walkInError.set(null);
    this._walkInSlotConflict.set(false);

    // Backend accepts specialtyId, not a display name. Until the shared
    // specialty directory contract is available, query by doctorName and
    // apply the selected display-name filter to the canonical response.
    this.doctorSearch = this.api
      .getWalkInDoctors({
        ...(intent.doctorName ? { doctorName: intent.doctorName } : {}),
      })
      .pipe(finalize(() => {
        if (serial === this.doctorSearchSerial) this._walkInLoadingDoctors.set(false);
      }))
      .subscribe({
        next: (doctors) => {
          const mapped = doctors.map(mapWalkInDoctor);
          this._walkInDoctors.set(
            intent.specialtyName
              ? mapped.filter(
                  (doctor) => doctor.specialtyName === intent.specialtyName,
                )
              : mapped,
          );
        },
        error: (error) =>
          this._walkInError.set(mapReceptionError(error).message),
      });
  }

  createWalkIn(intent: WalkInBookingIntent): void {
    if (this._walkInSubmitting()) {
      return;
    }

    const doctor = this._walkInDoctors().find((item) =>
      item.slots.some((slot) => slot.scheduleId === intent.scheduleId),
    );
    this._walkInSubmitting.set(true);
    this._walkInError.set(null);
    this._walkInSlotConflict.set(false);
    this._walkInCandidates.set([]);

    const session = this.walkInSession;
    this.api
      .createWalkIn(mapWalkInBookingIntent(intent), intent.idempotencyKey)
      .pipe(finalize(() => {
        if (session === this.walkInSession) this._walkInSubmitting.set(false);
      }))
      .subscribe({
        next: (response) => {
          if (session !== this.walkInSession) return;
          this._walkInSuccess.set(mapWalkInSuccess(response, doctor));
          this._walkInCandidates.set([]);
          this.refreshQueue();
        },
        error: (error) => {
          if (session !== this.walkInSession) return;
          const mappedError = mapReceptionError(error);
          this._walkInError.set(mappedError.message);
          this._walkInSlotConflict.set(
            mappedError.code === 'SLOT_CONFLICT',
          );
          this._walkInCandidates.set(
            mappedError.selection
              ? mapPatientCandidates(mappedError.selection)
              : [],
          );
        },
      });
  }

  resetWalkIn(): void {
    this.beginWalkInSession();
  }

  beginWalkInSession(): void {
    this.walkInSession++;
    this._walkInSubmitting.set(false);
    this._walkInCandidates.set([]);
    this._walkInSuccess.set(null);
    this._walkInError.set(null);
    this._walkInSlotConflict.set(false);
    this._walkInDraft.set(null);
    this.searchWalkInDoctors({ specialtyName: '', doctorName: '' });
  }

  endWalkInSession(): void {
    this.walkInSession++;
    this.doctorSearch?.unsubscribe();
    this._walkInCandidates.set([]);
    this._walkInSuccess.set(null);
    this._walkInError.set(null);
    this._walkInSlotConflict.set(false);
    this._walkInDraft.set(null);
  }

  setWalkInDraft(draft: WalkInDraftIntent): void {
    this._walkInDraft.set(draft);
  }

  connectQueue(): () => void {
    this.queueConsumers += 1;
    if (this.queueConsumers === 1) {
      const socket = this.socketService.connect(QUEUE_NAMESPACE);
      this.queueSocket = socket;
      socket.on(QUEUE_SNAPSHOT_EVENT, this.handleQueueSnapshot);
      socket.on(
        APPOINTMENT_STATUS_CHANGED_EVENT,
        this.handleQueueStatusChanged,
      );
      socket.on(QUEUE_AUTH_EXPIRED_EVENT, this.handleQueueAuthExpired);
      socket.on('connect', this.handleQueueConnected);

      if (socket.connected) {
        socket.emit(QUEUE_SYNC_EVENT);
      }
      this.refreshQueue();
    }

    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      this.queueConsumers = Math.max(0, this.queueConsumers - 1);
      if (this.queueConsumers === 0) {
        this.disconnectQueue();
      }
    };
  }

  refreshQueue(): void {
    this.api.getQueue().subscribe({
      next: (snapshot) => this.setQueueSnapshot(snapshot),
      error: () => {
        if (!this._queueSnapshot()) {
          this._queueSummary.set(null);
        }
      },
    });

    if (this.queueSocket?.connected) {
      this.queueSocket.emit(QUEUE_SYNC_EVENT);
    }
  }

  private setQueueSnapshot(snapshot: QueueSnapshot): void {
    this._queueSnapshot.set(snapshot);
    this._queueSummary.set(mapQueueSnapshotToReceptionSummary(snapshot));
  }

  private disconnectQueue(): void {
    const socket = this.queueSocket;
    if (socket) {
      socket.off(QUEUE_SNAPSHOT_EVENT, this.handleQueueSnapshot);
      socket.off(
        APPOINTMENT_STATUS_CHANGED_EVENT,
        this.handleQueueStatusChanged,
      );
      socket.off(QUEUE_AUTH_EXPIRED_EVENT, this.handleQueueAuthExpired);
      socket.off('connect', this.handleQueueConnected);
    }
    this.queueSocket = null;
    this.socketService.disconnect(QUEUE_NAMESPACE);
    this._queueConnectionState.set('disconnected');
  }

  private applyAppointmentRefresh(
    appointments: readonly ReceptionAppointment[],
  ): void {
    const mapped = appointments.map(mapReceptionAppointment);
    this._appointments.set(mapped);
    this._selectedAppointment.set(mapped.length === 1 ? mapped[0] : null);
  }

  private replaceAppointment(updated: ReceptionAppointmentViewModel): void {
    this._appointments.update((appointments) =>
      appointments.map((appointment) =>
        appointment.id === updated.id ? updated : appointment,
      ),
    );
  }

  private findAppointment(
    appointmentId: string,
  ): ReceptionAppointmentViewModel | undefined {
    return this._appointments().find(
      (appointment) => appointment.id === appointmentId,
    );
  }

  private mapConnectionState(
    state: SocketConnectionState,
  ): ReceptionQueueConnectionState {
    return state;
  }
}
