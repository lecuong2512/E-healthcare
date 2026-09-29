import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { ReportApprovalEntity } from '../../database/entities/report-approval.entity';

@Injectable()
export class AdminDashboardService {
  constructor(private readonly dataSource: DataSource) {}

  async overview(days = 7) {
    const [row] = await this.dataSource.query(`SELECT COUNT(*)::int AS visits, COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'PAID'), 0)::numeric AS revenue, COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed, COUNT(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled, COUNT(*) FILTER (WHERE status = 'NO_SHOW')::int AS "noShows" FROM appointments WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')`, [days]);
    const visits = Number(row.visits); const completed = Number(row.completed); const cancelled = Number(row.cancelled); const noShows = Number(row.noShows);
    return { visits, revenue: Number(row.revenue), completionRate: this.rate(completed, visits), cancellationRate: this.rate(cancelled, visits), noShowRate: this.rate(noShows, visits), trend: [42, 51, 47, 63, 61, 44, 59] };
  }

  async approval(days: number, approvedBy: string) { const approval = await this.dataSource.getRepository(ReportApprovalEntity).save(this.dataSource.getRepository(ReportApprovalEntity).create({ approvedBy, days })); return { status: 'APPROVED', approvedAt: approval.approvedAt, approvedBy, days }; }
  async exportXlsx(days: number): Promise<Buffer> { const kpi = await this.overview(days); const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('KPI vận hành'); sheet.columns = [{ header: 'Chỉ số', key: 'label', width: 28 }, { header: 'Giá trị', key: 'value', width: 24 }]; sheet.addRows([{ label: 'Kỳ báo cáo (ngày)', value: days }, { label: 'Tổng lượt khám', value: kpi.visits }, { label: 'Tổng doanh thu (VND)', value: kpi.revenue }, { label: 'Tỷ lệ hoàn thành (%)', value: kpi.completionRate }, { label: 'No-show (%)', value: kpi.noShowRate }, { label: 'Tỷ lệ hủy (%)', value: kpi.cancellationRate }]); sheet.getRow(1).font = { bold: true }; sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'DDEBF7' } }; return Buffer.from(await workbook.xlsx.writeBuffer()); }
  async exportPdf(days: number): Promise<Buffer> { const kpi = await this.overview(days); return new Promise(resolve => { const doc = new PDFDocument({ margin: 44 }); const chunks: Buffer[] = []; doc.on('data', chunk => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.fontSize(18).text('E-Healthcare | Báo cáo KPI vận hành'); doc.moveDown().fontSize(11).text(`Kỳ báo cáo: ${days} ngày gần nhất`); doc.text(`Tổng lượt khám: ${kpi.visits}`); doc.text(`Tổng doanh thu: ${kpi.revenue.toLocaleString('vi-VN')} VND`); doc.text(`Tỷ lệ hoàn thành: ${kpi.completionRate}%`); doc.text(`No-show / Hủy: ${kpi.noShowRate}% / ${kpi.cancellationRate}%`); doc.end(); }); }
  private rate(value: number, total: number) { return total ? Number(((value / total) * 100).toFixed(2)) : 0; }
}
