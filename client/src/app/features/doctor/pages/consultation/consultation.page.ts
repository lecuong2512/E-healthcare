import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { PhrService } from '../../../../core/services/phr.service';
import { AllergyAlertModalComponent } from '../../../../shared/components/allergy-alert-modal/allergy-alert-modal.component';

interface Drug { name: string; ingredient: string; unit: string; allergyGroup?: string; }
interface Rx { id: string; drugName: string; ingredient: string; doses: number[]; timing: string; quantity: number; unit: string; }
interface Icd { code: string; name: string; }
const DRUGS: Drug[] = [
  { name: 'Amoxicillin 500mg', ingredient: 'Amoxicillin', unit: 'Viên', allergyGroup: 'Penicillin' }, { name: 'Augmentin 1g', ingredient: 'Amoxicillin + Clavulanic acid', unit: 'Viên', allergyGroup: 'Penicillin' }, { name: 'Paracetamol 500mg', ingredient: 'Paracetamol', unit: 'Viên' }, { name: 'Aspirin 81mg', ingredient: 'Acetylsalicylic acid', unit: 'Viên', allergyGroup: 'Aspirin' }, { name: 'Cefuroxime 500mg', ingredient: 'Cefuroxime axetil', unit: 'Viên' }, { name: 'Salbutamol 2mg', ingredient: 'Salbutamol sulfate', unit: 'Viên' }, { name: 'Amlodipine 5mg', ingredient: 'Amlodipine besylate', unit: 'Viên' },
];
const ICD: Icd[] = [{code:'I10',name:'Tăng huyết áp vô căn'},{code:'I20.9',name:'Đau thắt ngực, không đặc hiệu'},{code:'J00',name:'Viêm mũi họng cấp'},{code:'E11.9',name:'Đái tháo đường type 2'},{code:'J45.9',name:'Hen phế quản'},{code:'R07.4',name:'Đau ngực, không đặc hiệu'}];

@Component({ selector: 'app-consultation-page', standalone: true, imports: [CommonModule, FormsModule, RouterModule, AllergyAlertModalComponent], templateUrl: './consultation.page.html' })
export class ConsultationPage {
  private router = inject(Router); private route = inject(ActivatedRoute); private phr = inject(PhrService); private sanitizer = inject(DomSanitizer);
  patientName='Trần Văn A'; patientGender='Nam'; patientYear=1995; recordCode='EMR-260908'; bloodType='O+'; allergies='Penicillin, Aspirin'; chronicDiseases='Hen phế quản'; surgeryHistory='Chưa ghi nhận';
  symptoms=''; onsetDuration='';
  bp='120/80'; pulse=76; temp=36.8; respiratoryRate=18; height=170; weight=65; bmi='22.5'; spo2=98;
  generalExam=''; specialtyExam=''; differentialDiagnosis=''; clinicalNotes='';
  icdSearch=''; icdTags:Icd[]=[{code:'I20.9',name:'Đau thắt ngực, không đặc hiệu'}]; readonly icdCatalog=ICD;
  readonly drugCatalog=DRUGS; drugSearch=''; selectedCatalogDrug:Drug|null=null; rxList:Rx[]=[];
  showAllergyModal=false; pendingDrug:Drug|null=null; attachments:{name:string;type:string;url:string}[]=[]; preview:{name:string;type:string;url:string}|null=null; activeTab:'record'|'attachments'='record'; saveMessage='';
  constructor(){ this.route.paramMap.subscribe(p=>{const id=p.get('appointmentId');if(id)this.recordCode=id;}); this.route.queryParams.subscribe(p=>{if(p['name'])this.patientName=p['name'];if(p['gender'])this.patientGender=p['gender'];if(p['year'])this.patientYear=Number(p['year']);}); this.loadPhr(); }
  get filteredDrugs(){const q=this.drugSearch.toLocaleLowerCase();return this.drugCatalog.filter(d=>!q||`${d.name} ${d.ingredient}`.toLocaleLowerCase().includes(q));}
  get filteredIcd(){const q=this.icdSearch.toLocaleLowerCase();return q?this.icdCatalog.filter(d=>`${d.code} ${d.name}`.toLocaleLowerCase().includes(q)&&!this.icdTags.some(t=>t.code===d.code)):[];}
  loadPhr(){ this.phr.getMyPhr().subscribe({next:p=>{this.bloodType=p.bloodType||'Chưa có';this.allergies=p.allergies||'Chưa ghi nhận';this.chronicDiseases=p.chronicDiseases||'Chưa ghi nhận';this.surgeryHistory=p.surgeryHistory||'Chưa ghi nhận';if(p.fullName)this.patientName=p.fullName;if(p.dateOfBirth)this.patientYear=new Date(p.dateOfBirth).getFullYear();},error:()=>{}}); }
  calcBmi(){if(this.height>0&&this.weight>0)this.bmi=(this.weight/((this.height/100)**2)).toFixed(1);}
  addIcd(tag:Icd){if(!this.icdTags.length)this.icdTags.push(tag);else this.icdTags.push(tag);this.icdSearch='';}
  removeIcd(i:number){this.icdTags.splice(i,1);}
  selectDrug(d:Drug){this.selectedCatalogDrug=d;this.drugSearch=d.name;}
  tryAddDrug(){const drug=this.selectedCatalogDrug;if(!drug)return;const patientAllergies=this.allergies.toLowerCase();if(drug.allergyGroup&&patientAllergies.includes(drug.allergyGroup.toLowerCase())){this.pendingDrug=drug;this.showAllergyModal=true;return;}this.addDrugDirectly(drug);}
  addDrugDirectly(d:Drug){this.rxList.push({id:`rx-${Date.now()}`,drugName:d.name,ingredient:d.ingredient,doses:[1,0,0,1],timing:'Sau ăn',quantity:14,unit:d.unit});this.selectedCatalogDrug=null;this.drugSearch='';}
  onModalCancel(){this.showAllergyModal=false;this.pendingDrug=null;}
  onModalOverride(_reason:string){this.showAllergyModal=false;if(this.pendingDrug)this.addDrugDirectly(this.pendingDrug);this.pendingDrug=null;}
  removeRx(i:number){this.rxList.splice(i,1);}
  onFiles(event:Event){const input=event.target as HTMLInputElement;for(const file of Array.from(input.files||[])){if(file.size>10*1024*1024){this.saveMessage=`Tệp ${file.name} vượt quá giới hạn 10 MB.`;continue;}if(!['image/jpeg','image/png','application/pdf'].includes(file.type)){this.saveMessage=`Định dạng ${file.name} không được hỗ trợ.`;continue;}this.attachments.push({name:file.name,type:file.type,url:URL.createObjectURL(file)});}input.value='';}
  openPreview(file:{name:string;type:string;url:string}){this.preview=file;} closePreview(){this.preview=null;}
  get safePreviewUrl():SafeResourceUrl|null{return this.preview?this.sanitizer.bypassSecurityTrustResourceUrl(this.preview.url):null;}
  saveDraft(){this.saveMessage='Thông tin đang nhập được giữ ở trạng thái nháp trong phiên khám này.';}
  completeConsultation(){this.router.navigate(['/doctor/queue']);}
  getBmiColor(bmiInput: number | null | undefined | string): string {  const bmi = typeof bmiInput === 'string' ? parseFloat(bmiInput) : bmiInput;  if (bmi == null) return 'inherit'; if (bmi < 18.5) return '#F59E0B';  if (bmi < 25) return '#22C55E';  if (bmi < 30) return '#F97316';  return '#EF4444';}
}
