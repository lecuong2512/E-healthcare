import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  Output,
  booleanAttribute,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-patient-consent-checkbox',
  standalone: true,
  imports: [CommonModule],
  template: `
    <label
      class="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700 transition"
      [class.border-rose-300]="showError && !checked"
      [class.bg-rose-50]="showError && !checked"
    >
      <input
        type="checkbox"
        [checked]="checked"
        [disabled]="disabled"
        (change)="onCheckboxChange($event)"
        class="mt-1 h-4 w-4 shrink-0 accent-sky-700 disabled:cursor-not-allowed"
      />
      <span>{{ text }}</span>
    </label>

    @if (showError && !checked) {
      <p class="mt-2 text-xs text-rose-600">{{ errorText }}</p>
    }
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: PatientConsentCheckboxComponent,
      multi: true,
    },
  ],
})
export class PatientConsentCheckboxComponent implements ControlValueAccessor {
  @Input() text =
    'Tôi xác nhận đã đọc và đồng ý cho phép E-Healthcare Portal thu thập, xử lý thông tin sức khỏe cá nhân theo quy định của Nghị định 13/2023/NĐ-CP phục vụ mục đích khám chữa bệnh.';
  @Input() errorText =
    'Vui lòng xác nhận đồng ý xử lý thông tin sức khỏe cá nhân trước khi tiếp tục.';
  @Input({ transform: booleanAttribute }) checked = false;
  @Input({ transform: booleanAttribute }) showError = false;
  @Input({ transform: booleanAttribute }) disabled = false;

  @Output() checkedChange = new EventEmitter<boolean>();

  onChange: (value: boolean) => void = () => {};
  onTouched: () => void = () => {};

  writeValue(value: boolean | null): void {
    this.checked = !!value;
  }

  registerOnChange(fn: (value: boolean) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onCheckboxChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.checked = target.checked;
    this.checkedChange.emit(this.checked);
    this.onChange(this.checked);
    this.onTouched();
  }
}
