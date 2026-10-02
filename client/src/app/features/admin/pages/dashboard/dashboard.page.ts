import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminDashboardApiService, DashboardKpi } from '../../data-access/admin-dashboard-api.service';
const EMPTY: DashboardKpi={visits:0,revenue:0,completionRate:0,cancellationRate:0,noShowRate:0,trend:[],paymentBreakdown:[],doctorPerformance:[]};
@Component({selector:'app-admin-dashboard-page',standalone:true,imports:[CommonModule],templateUrl:'./dashboard.page.html',styleUrl:'./dashboard.page.scss',changeDetection:ChangeDetectionStrategy.OnPush})
export class AdminDashboardPage {
  private readonly api=inject(AdminDashboardApiService);
  readonly days=signal(7); readonly kpi=signal<DashboardKpi>(EMPTY); readonly isLoading=signal(false);
  ngOnInit(){this.load();}
  select(days:number){this.days.set(days);this.load();}
  load(){
    this.isLoading.set(true);
    this.api.overview(this.days()).subscribe({
      next:value=>{this.kpi.set(value);this.isLoading.set(false);},
      error:()=>this.isLoading.set(false)
    });
  }
  download(type:'xlsx'|'pdf'){this.api.export(this.days(),type).subscribe({next:blob=>{const url=URL.createObjectURL(blob); const link=document.createElement('a'); link.href=url; link.download=`ehealth-kpi.${type}`; link.click(); URL.revokeObjectURL(url);}});}
  chartHeading(){
    if(this.days()===1) return 'Doanh thu & lượt khám trong ngày (Hôm nay)';
    if(this.days()===30) return 'Doanh thu & lượt khám 30 ngày qua (Tháng này)';
    return 'Doanh thu & lượt khám 7 ngày qua';
  }
  periodLabel(){
    if(this.days()===1) return 'vs hôm qua';
    if(this.days()===30) return 'vs tháng trước';
    return 'vs tuần trước';
  }
  chartDay(day:string){return ['CN','T2','T3','T4','T5','T6','T7'][new Date(`${day}T00:00:00Z`).getUTCDay()];}
  chartX(index:number){const count=this.kpi().trend.length; if(count<=1) return 320; return 70 + index * (500 / Math.max(1,count-1));}
  private chartScale(value:number,max:number){return 176 - (value / Math.max(1,max)) * 138;}
  revenueY(value:number){return this.chartScale(value,this.revenueMaximum());}
  visitY(value:number){return this.chartScale(value,this.visitMaximum());}
  revenueHeight(value:number){return Math.max(0,176-this.revenueY(value));}
  revenueMaximum(){const max=Math.max(...this.kpi().trend.map(point=>point.revenue),0); return Math.max(1000000,Math.ceil(max/1000000)*1000000);}
  visitMaximum(){return Math.max(1,...this.kpi().trend.map(point=>point.visits));}
  visitLine(){return this.kpi().trend.map((point,index)=>`${this.chartX(index)},${this.visitY(point.visits)}`).join(' ');}
  revenueAxisLabel(fraction:number){return `${Math.round((this.revenueMaximum()*fraction)/1000000)}tr`;}
  visitAxisLabel(fraction:number){return Math.round(this.visitMaximum()*fraction);}
  paymentName(method:string){return ({ VNPAY:'VNPAY QR', MOMO:'Ví MoMo', PAY_AT_CLINIC:'Tiền mặt tại quầy' } as Record<string,string>)[method] ?? method;}
  revenueMillions(){return `${(this.kpi().revenue/1000000).toFixed(1).replace(/\.0$/, '')}tr`;}
  paymentSlices(){
    const styles=[{method:'VNPAY',color:'#078dcc'},{method:'MOMO',color:'#7a23d3'},{method:'PAY_AT_CLINIC',color:'#f29a14'}]; let offset=0;
    return styles.map(style=>{const payment=this.kpi().paymentBreakdown.find(item=>item.method===style.method); const percentage=payment?.percentage ?? 0; const slice={...style,percentage,offset}; offset+=percentage; return slice;}).filter(slice=>slice.percentage>0);
  }
  deltaText(value:number|null|undefined){if(value===null||value===undefined)return '—'; return `${value >= 0 ? '↑' : '↓'} ${Math.abs(value).toFixed(1)}%`;}
  isNegative(value:number|null|undefined){return value !== null && value !== undefined && value < 0;}
  serviceQualityChange(){const comparison=this.kpi().comparison; return comparison ? comparison.noShowRate + comparison.cancellationRate : null;}
}
