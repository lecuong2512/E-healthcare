import "reflect-metadata";
import "../../config/environment";
import { hash } from "bcrypt";
import { createDataSource } from "../database-options";
import { environment, requiredEnvironment } from "../../config/environment";
import { UserEntity } from "../entities/user.entity";
import { UserRoleEntity, PersonalHealthProfileEntity } from "../entities/auth.entity";
import { SpecialtyEntity } from "../entities/specialty.entity";
import { DoctorEntity } from "../entities/doctor.entity";
import { ClinicRoomEntity } from "../entities/clinic-room.entity";
import { DoctorScheduleEntity } from "../entities/doctor-schedule.entity";
import { AppointmentEntity } from "../entities/appointment.entity";
import { MedicineEntity, MedicalServiceEntity, Icd10CatalogEntity } from "../entities/admin-catalog.entity";
import {
  Role,
  Gender,
  UserStatus,
  SlotStatus,
  AppointmentStatus,
  PaymentStatus,
  PaymentMethod,
  QueueSource,
} from "@shared/enums";

async function runSeed() {
  const url = environment.DATABASE_MIGRATION_URL ?? requiredEnvironment("DATABASE_URL");
  console.log(`Connecting to database: ${url.replace(/:[^:@]+@/, ":***@")}`);
  const dataSource = createDataSource(url);
  await dataSource.initialize();
  console.log("Database initialized successfully.");

  // Clean existing tables for clean seed
  console.log("Cleaning old seed data...");
  await dataSource.query(`
    TRUNCATE TABLE appointments, doctor_schedules, doctors, clinic_rooms, specialties,
    medicines, medical_services, icd10_catalogs, personal_health_profiles, user_roles, users
    CASCADE;
  `);

  const passwordHash = await hash("Pass1234!", 10);

  // 1. Specialties
  const specialtyRepo = dataSource.getRepository(SpecialtyEntity);
  const specCardio = await specialtyRepo.save(
    specialtyRepo.create({
      name: "Khoa Tim Mạch",
      description: "Chẩn đoán và điều trị các bệnh lý tim mạch, huyết áp.",
      iconUrl: "heart",
      isActive: true,
    })
  );
  const specGeneral = await specialtyRepo.save(
    specialtyRepo.create({
      name: "Khoa Nội Tổng Quát",
      description: "Khám và điều trị các bệnh nội khoa thông thường cho người lớn.",
      iconUrl: "clipboard-pulse",
      isActive: true,
    })
  );
  const specPediatrics = await specialtyRepo.save(
    specialtyRepo.create({
      name: "Khoa Nhi",
      description: "Chăm sóc sức khỏe toàn diện và điều trị bệnh lý cho trẻ nhỏ.",
      iconUrl: "baby",
      isActive: true,
    })
  );
  console.log("Seeded 3 Specialties.");

  // 2. Clinic Rooms
  const roomRepo = dataSource.getRepository(ClinicRoomEntity);
  await roomRepo.save([
    roomRepo.create({ roomNumber: "P.101", roomName: "Phòng khám Tim Mạch", specialtyId: specCardio.id, location: "Tầng 1 - Khu A", isActive: true }),
    roomRepo.create({ roomNumber: "P.102", roomName: "Phòng khám Nội Tổng Quát", specialtyId: specGeneral.id, location: "Tầng 1 - Khu A", isActive: true }),
    roomRepo.create({ roomNumber: "P.103", roomName: "Phòng khám Nhi", specialtyId: specPediatrics.id, location: "Tầng 1 - Khu B", isActive: true }),
    roomRepo.create({ roomNumber: "P.001", roomName: "Quầy Tiếp Đón Lễ Tân", location: "Sảnh Tầng 1", isActive: true }),
  ]);
  console.log("Seeded 4 Clinic Rooms.");

  // 3. Admin Catalogs (Medicines, Services, ICD-10)
  const medRepo = dataSource.getRepository(MedicineEntity);
  await medRepo.save([
    medRepo.create({ code: "MED001", brandName: "Panadol Extra", activeIngredient: "Paracetamol 500mg, Caffeine 65mg", strength: "565mg", packageUnit: "Hộp 15 vỉ x 12 viên", referencePrice: 65000, isActive: true }),
    medRepo.create({ code: "MED002", brandName: "Augmentin", activeIngredient: "Amoxicillin 875mg, Acid Clavulanic 125mg", strength: "1000mg", packageUnit: "Hộp 2 vỉ x 7 viên", referencePrice: 220000, isActive: true }),
    medRepo.create({ code: "MED003", brandName: "Amlor", activeIngredient: "Amlodipine besylate", strength: "5mg", packageUnit: "Hộp 3 vỉ x 10 viên", referencePrice: 180000, isActive: true }),
  ]);

  const srvRepo = dataSource.getRepository(MedicalServiceEntity);
  await srvRepo.save([
    srvRepo.create({ code: "SER001", name: "Khám chuyên khoa Tim mạch", listedPrice: 250000, durationMinutes: 20, description: "Khám lâm sàng tim mạch", isActive: true }),
    srvRepo.create({ code: "SER002", name: "Khám Nội tổng quát", listedPrice: 180000, durationMinutes: 15, description: "Khám tổng quát cơ bản", isActive: true }),
    srvRepo.create({ code: "SER003", name: "Điện tâm đồ vi tính (ECG 12 cần)", listedPrice: 120000, durationMinutes: 10, description: "Đo điện tim kiểm tra rối loạn nhịp", isActive: true }),
  ]);

  const icdRepo = dataSource.getRepository(Icd10CatalogEntity);
  await icdRepo.save([
    icdRepo.create({ code: "I10", name: "Bệnh tăng huyết áp vô căn (nguyên phát)", category: "Bệnh lý hệ tuần hoàn", isActive: true }),
    icdRepo.create({ code: "J00", name: "Viêm mũi họng cấp [cảm thường]", category: "Bệnh lý hệ hô hấp", isActive: true }),
    icdRepo.create({ code: "K29", name: "Viêm dạ dày và tá tràng", category: "Bệnh lý hệ tiêu hóa", isActive: true }),
  ]);
  console.log("Seeded Catalog (Medicines, Services, ICD-10).");

  // 4. Users & Roles
  const userRepo = dataSource.getRepository(UserEntity);
  const roleRepo = dataSource.getRepository(UserRoleEntity);
  const phrRepo = dataSource.getRepository(PersonalHealthProfileEntity);
  const docRepo = dataSource.getRepository(DoctorEntity);
  const schedRepo = dataSource.getRepository(DoctorScheduleEntity);
  const apptRepo = dataSource.getRepository(AppointmentEntity);

  // 4.1 PATIENT
  const patient = await userRepo.save(
    userRepo.create({
      email: "patient@ehealth.local",
      phoneNumber: "0901234001",
      passwordHash,
      fullName: "Bệnh nhân Nguyễn Văn An",
      gender: Gender.MALE,
      dateOfBirth: "1995-05-15",
      status: UserStatus.ACTIVE,
    })
  );
  await roleRepo.save(roleRepo.create({ userId: patient.id, role: Role.PATIENT }));
  await phrRepo.save(
    phrRepo.create({
      userId: patient.id,
      bloodType: "O+",
      allergies: "Dị ứng Penicillin, tôm cua",
      medicalHistory: "Tăng huyết áp nhẹ điều trị ngoại trú",
      citizenId: "001200012345",
      address: "123 Giải Phóng, Hà Nội",
      healthInsurance: "DN4010123456789",
    })
  );
  console.log("Seeded PATIENT: patient@ehealth.local (0901234001)");

  // 4.2 DOCTOR
  const doctorUser = await userRepo.save(
    userRepo.create({
      email: "doctor@ehealth.local",
      phoneNumber: "0901234002",
      passwordHash,
      fullName: "BS.CKI Trần Văn Bình",
      gender: Gender.MALE,
      dateOfBirth: "1982-08-20",
      status: UserStatus.ACTIVE,
    })
  );
  await roleRepo.save(roleRepo.create({ userId: doctorUser.id, role: Role.DOCTOR }));
  const doctor = await docRepo.save(
    docRepo.create({
      userId: doctorUser.id,
      specialtyId: specCardio.id,
      licenseNumber: "CCHN-001234-HN",
      academicTitle: "BS.CKI",
      consultationFee: 200000,
      roomNumber: "P.101",
      ratingAverage: 4.95,
      yearsExperience: 15,
      bioDescription: "Chuyên gia hàng đầu về tim mạch can thiệp, hơn 15 năm kinh nghiệm tại Bệnh viện Tim.",
    })
  );
  console.log("Seeded DOCTOR: doctor@ehealth.local (0901234002)");

  // 4.3 RECEPTIONIST
  const receptionist = await userRepo.save(
    userRepo.create({
      email: "receptionist@ehealth.local",
      phoneNumber: "0901234003",
      passwordHash,
      fullName: "Lễ tân Lê Thị Chi",
      gender: Gender.FEMALE,
      dateOfBirth: "1998-11-12",
      status: UserStatus.ACTIVE,
    })
  );
  await roleRepo.save(roleRepo.create({ userId: receptionist.id, role: Role.RECEPTIONIST }));
  console.log("Seeded RECEPTIONIST: receptionist@ehealth.local (0901234003)");

  // 4.4 ADMIN
  const admin = await userRepo.save(
    userRepo.create({
      email: "admin@ehealth.local",
      phoneNumber: "0901234004",
      passwordHash,
      fullName: "Quản trị viên Phạm Hoàng Dũng",
      gender: Gender.MALE,
      dateOfBirth: "1990-01-01",
      status: UserStatus.ACTIVE,
    })
  );
  await roleRepo.save(roleRepo.create({ userId: admin.id, role: Role.ADMIN }));
  console.log("Seeded ADMIN: admin@ehealth.local (0901234004)");

  // 5. Doctor Schedules (Today and next 3 days)
  const today = new Date();
  const times = [
    { start: "08:00:00", end: "08:30:00" },
    { start: "08:30:00", end: "09:00:00" },
    { start: "09:00:00", end: "09:30:00" },
    { start: "09:30:00", end: "10:00:00" },
    { start: "14:00:00", end: "14:30:00" },
    { start: "14:30:00", end: "15:00:00" },
    { start: "15:00:00", end: "15:30:00" },
  ];

  let firstSchedule: DoctorScheduleEntity | null = null;
  for (let d = 0; d < 4; d++) {
    const curDate = new Date(today);
    curDate.setDate(today.getDate() + d);
    const dateStr = curDate.toISOString().split("T")[0];

    for (let i = 0; i < times.length; i++) {
      const isBooked = (d === 0 && i === 0);
      const sched = await schedRepo.save(
        schedRepo.create({
          doctorId: doctor.id,
          date: dateStr,
          startTime: times[i].start,
          endTime: times[i].end,
          status: isBooked ? SlotStatus.BOOKED : SlotStatus.AVAILABLE,
        })
      );
      if (isBooked) {
        firstSchedule = sched;
      }
    }
  }
  console.log("Seeded Doctor Schedules for next 4 days.");

  // 6. Sample Appointment for QA
  if (firstSchedule) {
    const appt = await apptRepo.save(
      apptRepo.create({
        appointmentCode: "APPT-QA-0001",
        patientId: patient.id,
        doctorId: doctor.id,
        scheduleId: firstSchedule.id,
        status: AppointmentStatus.CONFIRMED,
        reasonForVisit: "Tức ngực, hồi hộp, muốn kiểm tra điện tâm đồ.",
        paymentStatus: PaymentStatus.PAID,
        paymentMethod: PaymentMethod.VNPAY,
        totalAmount: 200000,
        queueNumber: 1,
        queueDate: firstSchedule.date,
        queueSource: QueueSource.APPOINTMENT,
        paidAt: new Date(),
      })
    );
    console.log(`Seeded sample confirmed appointment ${appt.appointmentCode}`);
  }

  await dataSource.destroy();
  console.log("Seed completed successfully!");
}

runSeed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
