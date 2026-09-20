// import { Component } from '@angular/core';

// /**
//  * STUB — khung trang, thuộc phạm vi task nghiệp vụ riêng.
//  */
// @Component({
//   selector: 'app-doctor-search-page',
//   standalone: true,
//   template: `<div class="p-6 text-slate-500">[TODO] Tìm kiếm bác sĩ — SRS-PAT-01</div>`,
// })
// export class DoctorSearchPage {}
import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

export interface Doctor {
  id: string | number;
  degree: string;
  name: string;
  specialty: string;
  hospital: string;
  experienceYears: number;
  tags: string[];
  services: string[];
  extraServicesCount?: number;
  availableToday: boolean;
  price: number;
  rating: number;
  reviewCount: number;
}

@Component({
  selector: 'app-doctor-search-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './doctor-search.page.html',
  styleUrl: './doctor-search.page.scss'
})
export class DoctorSearchPage {
  // Bộ lọc bên trái
  readonly specialties = [
    'Nội tổng quát',
    'Ngoại khoa',
    'Nhi khoa',
    'Da liễu',
    'Tim mạch',
    'Tai Mũi Họng'
  ];

  readonly feeRanges = [
    { label: '< 300.000đ', value: 'low' },
    { label: '300.000đ – 500.000đ', value: 'mid' },
    { label: '> 500.000đ', value: 'high' }
  ];

  // Trạng thái bộ lọc
  readonly searchQuery = signal('');
  readonly selectedSpecialty = signal<string | null>(null);
  readonly selectedDate = signal<'today' | 'tomorrow' | 'pick'>('today');
  readonly selectedFee = signal<string | null>(null);
  readonly filterHighRating = signal(false);
  readonly filterAvailableToday = signal(false);

  // Mock data chuẩn xác theo hình
  readonly doctors = signal<Doctor[]>([
    {
      id: 1,
      degree: 'PGS.TS.BS',
      name: 'Trần Văn Tiến',
      specialty: 'Tim mạch',
      hospital: 'BV Chợ Rẫy TP.HCM',
      experienceYears: 18,
      tags: ['Phó Giáo sư', 'Tiến sĩ Y khoa', 'BV Chợ Rẫy'],
      services: ['Khám tim mạch tổng quát', 'Siêu âm tim', 'Điện tâm đồ'],
      extraServicesCount: 1,
      availableToday: true,
      price: 350000,
      rating: 4.9,
      reviewCount: 312
    },
    {
      id: 2,
      degree: 'TS.BS',
      name: 'Nguyễn Thị Lan',
      specialty: 'Nội tổng quát',
      hospital: 'BV Bạch Mai Hà Nội',
      experienceYears: 12,
      tags: ['Tiến sĩ Y khoa', 'Chuyên khoa II'],
      services: ['Khám nội tổng quát', 'Tầm soát bệnh mạn tính', 'Tư vấn dinh dưỡng'],
      availableToday: true,
      price: 280000,
      rating: 4.8,
      reviewCount: 245
    },
    {
      id: 3,
      degree: 'BSCKII',
      name: 'Lê Văn Nam',
      specialty: 'Ngoại khoa',
      hospital: 'BV 108 Hà Nội',
      experienceYears: 15,
      tags: ['Chuyên khoa II Ngoại khoa', 'Thạc sĩ Y học'],
      services: ['Phẫu thuật nội soi', 'Khám tiền phẫu', 'Tư vấn phẫu thuật'],
      availableToday: false,
      price: 420000,
      rating: 4.7,
      reviewCount: 198
    },
    {
      id: 4,
      degree: 'ThS.BS',
      name: 'Phạm Minh Khoa',
      specialty: 'Nhi khoa',
      hospital: 'BV Nhi Trung Ương',
      experienceYears: 8,
      tags: ['Thạc sĩ Nhi khoa', 'Chứng chỉ Nhi sơ sinh'],
      services: ['Khám nhi tổng quát', 'Tiêm chủng', 'Theo dõi tăng trưởng'],
      availableToday: true,
      price: 250000,
      rating: 4.6,
      reviewCount: 167
    },
    {
      id: 5,
      degree: 'BS.CKI',
      name: 'Hoàng Thị Thu',
      specialty: 'Da liễu',
      hospital: 'BV Da liễu TP.HCM',
      experienceYears: 10,
      tags: ['Chuyên khoa I Da liễu'],
      services: ['Khám da liễu', 'Điều trị mụn trứng cá'],
      extraServicesCount: 1,
      availableToday: true,
      price: 300000,
      rating: 4.8,
      reviewCount: 110
    },
    {
      id: 6,
      degree: 'PGS.TS.BS',
      name: 'Võ Đình Phúc',
      specialty: 'Tai Mũi Họng',
      hospital: 'BV Tai Mũi Họng TW',
      experienceYears: 20,
      tags: ['Phó Giáo sư', 'Tiến sĩ Y khoa'],
      services: ['Khám TMH tổng quát', 'Nội soi TMH'],
      extraServicesCount: 1,
      availableToday: false,
      price: 400000,
      rating: 4.9,
      reviewCount: 220
    }
  ]);

  // Bộ lọc kết hợp tự động
  readonly filteredDoctors = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const spec = this.selectedSpecialty();
    const fee = this.selectedFee();
    const highRating = this.filterHighRating();
    const onlyToday = this.filterAvailableToday();

    return this.doctors().filter(doc => {
      const matchSearch =
        !query ||
        doc.name.toLowerCase().includes(query) ||
        doc.specialty.toLowerCase().includes(query) ||
        doc.hospital.toLowerCase().includes(query);

      const matchSpec = !spec || doc.specialty === spec;
      const matchToday = !onlyToday || doc.availableToday;
      const matchRating = !highRating || doc.rating >= 4.0;

      let matchFee = true;
      if (fee === 'low') matchFee = doc.price < 300000;
      else if (fee === 'mid') matchFee = doc.price >= 300000 && doc.price <= 500000;
      else if (fee === 'high') matchFee = doc.price > 500000;

      return matchSearch && matchSpec && matchToday && matchRating && matchFee;
    });
  });

  toggleSpecialty(spec: string) {
    this.selectedSpecialty.update(curr => (curr === spec ? null : spec));
  }

  toggleFee(value: string) {
    this.selectedFee.update(curr => (curr === value ? null : value));
  }
}