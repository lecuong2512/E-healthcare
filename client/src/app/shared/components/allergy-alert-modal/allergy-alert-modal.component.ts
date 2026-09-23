import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-allergy-alert-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="allergy-modal-title"
    >
      <div
        class="bg-white w-full max-w-[560px] rounded-2xl shadow-2xl border-2 border-red-600 overflow-hidden"
      >
        <!-- Modal Header -->
        <div class="bg-red-600 px-6 py-4 flex items-center justify-between text-white">
          <div class="flex items-center gap-3">
            <span class="text-2xl" aria-hidden="true">⚠️</span>
            <h2 id="allergy-modal-title" class="font-bold text-base md:text-lg tracking-wide">
              CẢNH BÁO AN TOÀN Y TẾ: NGUY CƠ DỊ ỨNG THUỐC
            </h2>
          </div>
          <button
            type="button"
            (click)="onCancel()"
            class="text-white/80 hover:text-white text-xl font-bold p-1 leading-none"
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>

        <!-- Modal Body -->
        <div class="p-6 space-y-4">
          <!-- Alert Box -->
          <div class="bg-red-50 border border-red-200 rounded-xl p-4 text-red-900 space-y-2">
            <div class="flex items-start gap-2">
              <span class="font-bold text-red-700 text-sm">Cảnh báo nghiêm trọng:</span>
            </div>
            <p class="text-sm leading-relaxed">
              Bệnh nhân có tiền sử dị ứng đã ghi nhận với nhóm thuốc
              <strong class="text-red-700 underline font-bold">[{{ allergyGroup }}]</strong>!
            </p>
            <p class="text-sm leading-relaxed">
              Thuốc vừa chỉ định:
              <strong class="text-red-700 font-semibold">{{ drugName }}</strong>
              chứa hoạt chất chống chỉ định tương tác mạnh.
            </p>
          </div>

          <!-- Doctor Override Reason -->
          <div>
            <label for="override-reason" class="block text-xs font-semibold text-slate-700 mb-1">
              Ghi chú / Lý do can thiệp bắt buộc (nếu vẫn tiếp tục kê):
            </label>
            <textarea
              id="override-reason"
              [(ngModel)]="overrideReason"
              rows="3"
              placeholder="Nhập lý do lâm sàng hoặc phác đồ thay thế đã cân nhắc kỹ lưỡng..."
              class="w-full text-xs p-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            ></textarea>
          </div>
        </div>

        <!-- Modal Actions -->
        <div class="bg-slate-50 px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-end gap-3">
          <button
            type="button"
            (click)="onCancel()"
            class="w-full sm:w-auto px-5 py-2.5 rounded-lg text-sm font-semibold bg-slate-700 hover:bg-slate-800 text-white transition focus:ring-2 focus:ring-slate-400"
          >
            Hủy chọn thuốc (Khuyến nghị)
          </button>
          <button
            type="button"
            (click)="onConfirmOverride()"
            class="w-full sm:w-auto px-5 py-2.5 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-700 text-white transition focus:ring-2 focus:ring-red-400 shadow-sm"
          >
            Vẫn kê đơn (Ghi nhận biên bản)
          </button>
        </div>
      </div>
    </div>
  `,
})
export class AllergyAlertModalComponent {
  @Input() drugName = 'Amoxicillin 500mg';
  @Input() allergyGroup = 'Penicillin';
  @Output() cancel = new EventEmitter<void>();
  @Output() override = new EventEmitter<string>();

  overrideReason = '';

  onCancel() {
    this.cancel.emit();
  }

  onConfirmOverride() {
    this.override.emit(this.overrideReason || 'Bác sĩ xác nhận chỉ định sau hội chẩn lâm sàng');
  }
}
