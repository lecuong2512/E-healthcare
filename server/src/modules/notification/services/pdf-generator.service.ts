import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { existsSync } from 'node:fs';
import PDFDocument from 'pdfkit';
import { toBuffer as qrToBuffer } from 'qrcode';
import {
  PrescriptionPdfPayload,
  MedicalRecordPdfPayload,
} from '@shared/interfaces';
import { environment } from '../../../config/environment';

export const PRESCRIPTION_PDF_VERIFICATION_FOOTER =
  'Quét mã để đối chiếu đơn thuốc gốc tại hệ thống E-Healthcare Portal';

@Injectable()
export class PdfGeneratorService {
  private readonly logger = new Logger(PdfGeneratorService.name);

  async generatePrescriptionPdf(payload: PrescriptionPdfPayload): Promise<Buffer> {
    const fontPath = environment.PDF_FONT_PATH;
    if (!fontPath || !existsSync(fontPath)) {
      throw new ServiceUnavailableException('Prescription PDF font is not configured.');
    }
    if (!/^https:\/\//i.test(payload.verificationUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(payload.verificationUrl)) {
      throw new ServiceUnavailableException('Prescription verification URL must use HTTPS.');
    }

    const qrBuffer = await qrToBuffer(payload.verificationUrl, {
      width: 112,
      margin: 1,
      errorCorrectionLevel: 'M',
    });

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 42, bufferPages: true });
      const buffers: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (error: Error) => reject(error));
      doc.font(fontPath).fillColor('#152b3c');

      const pageWidth = doc.page.width;
      const margin = 42;
      const contentWidth = pageWidth - margin * 2;
      const ensureSpace = (height: number): void => {
        if (doc.y + height > doc.page.height - margin - 95) doc.addPage();
      };
      const label = (title: string, value: string | null | undefined): void => {
        if (!value) return;
        ensureSpace(42);
        doc.fontSize(9).fillColor('#557080').text(title, margin, doc.y, { width: contentWidth });
        doc.moveDown(0.2);
        doc.fontSize(10).fillColor('#152b3c').text(value, margin, doc.y, {
          width: contentWidth,
          lineGap: 2,
        });
        doc.moveDown(0.7);
      };

      doc.fontSize(20).fillColor('#155e75').text('E-Healthcare Portal', margin, margin);
      doc.fontSize(10).fillColor('#557080').text('ĐƠN THUỐC ĐIỆN TỬ', margin, doc.y + 5);
      doc.image(qrBuffer, pageWidth - margin - 84, margin, { width: 84, height: 84 });
      doc.fontSize(8).text('QR đối chiếu đơn thuốc', pageWidth - margin - 104, margin + 88, {
        width: 104,
        align: 'center',
      });
      doc.moveDown(1.5);

      label('Mã đơn thuốc', payload.prescriptionCode);
      label('Mã lịch hẹn', payload.appointmentCode);
      label(
        'Ngày kê',
        new Intl.DateTimeFormat('vi-VN', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(payload.createdAt)),
      );
      label('Bệnh nhân', payload.patientName);
      label('Bác sĩ', payload.doctorName);
      label('Chẩn đoán', payload.diagnosis);
      label('ICD-10 chính', payload.icd10Code);
      label('ICD-10 kèm theo', payload.secondaryIcd10Codes || 'Không có');

      ensureSpace(50);
      doc.fontSize(13).fillColor('#155e75').text('Thuốc được kê', margin, doc.y);
      doc.moveDown(0.5);
      payload.medicines.forEach((medicine, index) => {
        ensureSpace(74);
        doc.fontSize(10).fillColor('#152b3c').text(
          `${index + 1}. ${medicine.medicineName}${medicine.activeIngredient ? ` (${medicine.activeIngredient})` : ''}`,
          margin,
          doc.y,
          { width: contentWidth },
        );
        doc.moveDown(0.25);
        doc.fontSize(9).text(`Số lượng: ${medicine.quantity} ${medicine.unit || ''}`, margin + 14, doc.y);
        const dosage = [
          medicine.dosageMorning ? `Sáng: ${medicine.dosageMorning}` : '',
          medicine.dosageNoon ? `Trưa: ${medicine.dosageNoon}` : '',
          medicine.dosageAfternoon ? `Chiều: ${medicine.dosageAfternoon}` : '',
          medicine.dosageNight ? `Tối: ${medicine.dosageNight}` : '',
        ].filter(Boolean).join(' · ');
        if (dosage) {
          doc.moveDown(0.2);
          doc.text(`Liều dùng: ${dosage}`, margin + 14, doc.y, { width: contentWidth - 14 });
        }
        doc.moveDown(0.2);
        doc.text(`Cách dùng: ${medicine.usageInstruction}`, margin + 14, doc.y, {
          width: contentWidth - 14,
          lineGap: 2,
        });
        doc.moveDown(0.75);
      });

      label('Lời dặn bác sĩ', payload.doctorAdvice);
      label(
        'Ngày tái khám',
        payload.followUpDate
          ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${payload.followUpDate}T00:00:00Z`))
          : undefined,
      );

      const pageRange = doc.bufferedPageRange();
      for (let pageIndex = pageRange.start; pageIndex < pageRange.start + pageRange.count; pageIndex++) {
        doc.switchToPage(pageIndex);
        const footerY = doc.page.height - margin - 82;
        doc.moveTo(margin, footerY - 10).lineTo(pageWidth - margin, footerY - 10)
          .strokeColor('#cbd5e1').stroke();
        doc.fontSize(7).fillColor('#475569').text(
          `SHA-256: ${payload.verificationHash}`,
          margin,
          footerY,
          { width: contentWidth, align: 'center' },
        );
        doc.fontSize(8).fillColor('#152b3c').text(
          PRESCRIPTION_PDF_VERIFICATION_FOOTER,
          margin,
          footerY + 18,
          { width: contentWidth, align: 'center' },
        );
      }

      doc.end();
    });
  }

  async generateEmrPdf(payload: MedicalRecordPdfPayload): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 40 });
        const buffers: Buffer[] = [];

        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        const qrData = `EHEALTH-EMR:${payload.recordCode}|APT:${payload.appointmentCode}`;
        const qrBuffer = await qrToBuffer(qrData, { width: 100, margin: 1 });

        // Header
        doc.fontSize(10).font('Helvetica-Bold').text('PHONG KHAM DA KHOA QUOC TE E-HEALTHCARE', 40, 40);
        doc.fontSize(9).font('Helvetica').text('He thong Quan ly Benh an Dien tu (EMR)', 40, 55);

        doc.image(qrBuffer, 460, 35, { width: 85 });
        doc.fontSize(8).text(`Ma BA: ${payload.recordCode}`, 430, 125, { width: 140, align: 'center' });

        doc.moveDown(3);
        doc.fontSize(16).font('Helvetica-Bold').text('BENH AN KHAM BENH DIEN TU', { align: 'center' });
        doc.fontSize(10).font('Helvetica-Oblique').text(`(So ho so: ${payload.recordCode})`, { align: 'center' });
        doc.moveDown(1);

        // Patient info
        doc.rect(40, 155, 515, 60).stroke('#cccccc');
        doc.fontSize(10).font('Helvetica-Bold').text('I. THONG TIN HANH CHINH:', 50, 162);
        doc.font('Helvetica').text(`Ho va ten: ${payload.patientName}`, 50, 178);
        doc.text(`Gioi tinh: ${payload.patientGender || 'N/A'}`, 260, 178);
        doc.text(`Ngay sinh: ${payload.patientDob || 'N/A'}`, 380, 178);
        doc.text(`Ma ca hen: ${payload.appointmentCode}`, 50, 195);
        doc.text(`Bac si kham: BS. ${payload.doctorName}`, 260, 195);
        doc.text(`Ngay tao: ${payload.createdAt}`, 380, 195);

        // Vital Signs section
        let yPos = 230;
        doc.font('Helvetica-Bold').text('II. CHI SO SINH TON & THE TRANG:', 40, yPos);
        yPos += 18;

        const vs = payload.vitalSigns || {};
        doc.rect(40, yPos, 515, 38).fill('#f9fafb');
        doc.fillColor('#000000').font('Helvetica').fontSize(9);

        doc.text(`Chieu cao: ${vs.heightCm ? vs.heightCm + ' cm' : 'N/A'}`, 50, yPos + 6);
        doc.text(`Can nang: ${vs.weightKg ? vs.weightKg + ' kg' : 'N/A'}`, 160, yPos + 6);
        doc.text(`BMI: ${vs.bmi ? vs.bmi : 'N/A'}`, 270, yPos + 6);
        doc.text(`Huyet ap: ${vs.bloodPressure || 'N/A'}`, 380, yPos + 6);

        doc.text(`Nhip tim: ${vs.heartRateBpm ? vs.heartRateBpm + ' bpm' : 'N/A'}`, 50, yPos + 22);
        doc.text(`Nhiet do: ${vs.temperatureC ? vs.temperatureC + ' °C' : 'N/A'}`, 160, yPos + 22);
        doc.text(`SpO2: ${vs.spo2Percent ? vs.spo2Percent + ' %' : 'N/A'}`, 270, yPos + 22);

        yPos += 50;

        // Clinical notes & Diagnosis
        doc.font('Helvetica-Bold').fontSize(10).text('III. KHAM LAM SANG & CHAN DOAN:', 40, yPos);
        yPos += 18;

        if (payload.symptoms) {
          doc.font('Helvetica-Bold').fontSize(9).text('Trieu chung lam sang: ', 40, yPos, { continued: true });
          doc.font('Helvetica').text(payload.symptoms);
          yPos += 20;
        }

        doc.font('Helvetica-Bold').fontSize(9).text('Chan doan xac dinh: ', 40, yPos, { continued: true });
        doc.font('Helvetica').text(`${payload.diagnosis} (Ma ICD-10: ${payload.icd10Code})`);
        yPos += 20;

        if (payload.clinicalNotes) {
          doc.font('Helvetica-Bold').fontSize(9).text('Dien tien & Ghi chu: ', 40, yPos);
          yPos += 14;
          doc.font('Helvetica').text(payload.clinicalNotes, 40, yPos, { width: 515 });
          yPos += 35;
        }

        // Signatures
        const signY = Math.max(yPos + 20, 680);
        doc.font('Helvetica-Bold').fontSize(10).text('BAC SI KHAM BENH', 380, signY, { width: 160, align: 'center' });
        doc.font('Helvetica-Oblique').fontSize(8).text('(Chu ky so dien tu hop le)', 380, signY + 15, { width: 160, align: 'center' });
        doc.font('Helvetica-Bold').fontSize(10).text(`BS. ${payload.doctorName}`, 380, signY + 65, { width: 160, align: 'center' });

        doc.end();
      } catch (err: any) {
        this.logger.error(`Error generating EMR PDF: ${err.message}`);
        reject(err);
      }
    });
  }
}
