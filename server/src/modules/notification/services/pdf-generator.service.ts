import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { toBuffer as qrToBuffer } from 'qrcode';
import {
  PrescriptionPdfPayload,
  MedicalRecordPdfPayload,
} from '@shared/interfaces';

@Injectable()
export class PdfGeneratorService {
  private readonly logger = new Logger(PdfGeneratorService.name);

  async generatePrescriptionPdf(payload: PrescriptionPdfPayload): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 40 });
        const buffers: Buffer[] = [];

        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        // Generate QR Code containing prescription code and verification link
        const qrData = `EHEALTH-RX:${payload.prescriptionCode}|APT:${payload.appointmentCode}|HASH:${payload.verificationHash || 'VERIFIED'}`;
        const qrBuffer = await qrToBuffer(qrData, { width: 100, margin: 1 });

        // Header
        doc.fontSize(10).font('Helvetica-Bold').text('BO Y TE - SO Y TE', 40, 40);
        doc.fontSize(9).font('Helvetica').text('PHONG KHAM DA KHOA QUOC TE E-HEALTHCARE', 40, 55);
        doc.text('Dia chi: 123 Nguyen Trai, Q.1, TP. Ho Chi Minh - Hotline: 1900-8888', 40, 68);

        // QR Code in top right
        doc.image(qrBuffer, 460, 35, { width: 85 });
        doc.fontSize(8).text(`Ma tra cuu: ${payload.prescriptionCode}`, 430, 125, { width: 140, align: 'center' });

        doc.moveDown(3);
        doc.fontSize(16).font('Helvetica-Bold').text('DON THUOC DIEN TU', { align: 'center' });
        doc.fontSize(10).font('Helvetica-Oblique').text(`(Ma don thuoc: ${payload.prescriptionCode})`, { align: 'center' });
        doc.moveDown(1);

        // Patient info box
        doc.rect(40, 160, 515, 65).stroke('#cccccc');
        doc.fontSize(10).font('Helvetica-Bold').text('THONG TIN BENH NHAN:', 50, 168);
        doc.font('Helvetica').text(`Ho va ten: ${payload.patientName}`, 50, 185);
        doc.text(`Gioi tinh: ${payload.patientGender || 'N/A'}`, 260, 185);
        doc.text(`Ngay sinh: ${payload.patientDob || 'N/A'}`, 380, 185);

        doc.text(`Ma cuoc hen: ${payload.appointmentCode}`, 50, 202);
        doc.text(`Dien thoai: ${payload.patientPhone || 'N/A'}`, 260, 202);
        doc.text(`Ngay ke: ${payload.createdAt}`, 380, 202);

        // Diagnosis
        doc.moveDown(3.5);
        doc.font('Helvetica-Bold').text(`Chan doan benh: `, 40, 240, { continued: true });
        doc.font('Helvetica').text(`${payload.diagnosis} (Ma ICD-10: ${payload.icd10Code})`);

        // Prescription items table
        doc.moveDown(1);
        let yPos = 265;
        doc.font('Helvetica-Bold').text('CHI TIET DON THUOC:', 40, yPos);
        yPos += 18;

        // Table header
        doc.rect(40, yPos, 515, 20).fill('#f0f4f8');
        doc.fillColor('#000000').font('Helvetica-Bold').fontSize(9);
        doc.text('STT', 45, yPos + 5, { width: 30 });
        doc.text('Ten thuoc & Hoat chat', 80, yPos + 5, { width: 220 });
        doc.text('So luong', 310, yPos + 5, { width: 60 });
        doc.text('Cach dung', 380, yPos + 5, { width: 170 });
        yPos += 25;

        // Table rows
        doc.font('Helvetica').fontSize(9);
        payload.medicines.forEach((med, idx) => {
          doc.text(`${idx + 1}`, 45, yPos, { width: 30 });
          doc.font('Helvetica-Bold').text(med.medicineName, 80, yPos, { width: 220 });
          if (med.activeIngredient) {
            doc.font('Helvetica-Oblique').fontSize(8).text(`(${med.activeIngredient})`, 80, yPos + 11, { width: 220 });
            doc.fontSize(9).font('Helvetica');
          }

          doc.text(`${med.quantity} ${med.unit || 'vien'}`, 310, yPos, { width: 60 });

          const dosageStr = [
            med.dosageMorning ? `Sang: ${med.dosageMorning}` : '',
            med.dosageNoon ? `Trua: ${med.dosageNoon}` : '',
            med.dosageAfternoon ? `Chieu: ${med.dosageAfternoon}` : '',
            med.dosageNight ? `Toi: ${med.dosageNight}` : '',
          ].filter(Boolean).join(' | ');

          const instruction = dosageStr ? `${dosageStr}. ${med.usageInstruction}` : med.usageInstruction;
          doc.text(instruction, 380, yPos, { width: 170 });

          yPos += med.activeIngredient ? 28 : 22;
        });

        // Doctor advice
        yPos += 15;
        if (payload.doctorAdvice) {
          doc.font('Helvetica-Bold').text('Loi dan cua Bac si:', 40, yPos);
          yPos += 15;
          doc.font('Helvetica-Oblique').text(payload.doctorAdvice, 40, yPos, { width: 515 });
          yPos += 30;
        }

        // Signature section
        const signY = Math.max(yPos + 20, 680);
        doc.font('Helvetica').fontSize(9).text(`Ngay .... thang .... nam 2026`, 380, signY, { width: 160, align: 'center' });
        doc.font('Helvetica-Bold').text('BAC SI DIEU TRI', 380, signY + 15, { width: 160, align: 'center' });
        doc.font('Helvetica-Oblique').fontSize(8).text('(Ky, ghi ro ho ten va dong dau)', 380, signY + 28, { width: 160, align: 'center' });

        doc.font('Helvetica-Bold').fontSize(10).text(`BS. ${payload.doctorName}`, 380, signY + 70, { width: 160, align: 'center' });
        if (payload.doctorLicense) {
          doc.font('Helvetica').fontSize(8).text(`CCHN: ${payload.doctorLicense}`, 380, signY + 85, { width: 160, align: 'center' });
        }

        // Verification Footer
        doc.fontSize(7).font('Helvetica').fillColor('#666666').text(
          `Van ban duoc ky so dien tu boi E-Healthcare System. Ma xac thuc: ${payload.verificationHash || 'N/A'}. Quet ma QR de kiem tra tinh xac thuc.`,
          40,
          780,
          { align: 'center', width: 515 },
        );

        doc.end();
      } catch (err: any) {
        this.logger.error(`Error generating prescription PDF: ${err.message}`);
        reject(err);
      }
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
