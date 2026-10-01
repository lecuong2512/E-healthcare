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

function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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
      description: "Chẩn đoán và điều trị các bệnh lý tim mạch, tăng huyết áp, rối loạn nhịp.",
      iconUrl: "heart",
      isActive: true,
    })
  );
  const specDermatology = await specialtyRepo.save(
    specialtyRepo.create({
      name: "Khoa Da Liễu",
      description: "Chẩn đoán và điều trị các bệnh lý về da liễu, tóc, móng và thẩm mỹ da.",
      iconUrl: "sparkles",
      isActive: true,
    })
  );
  const specPediatrics = await specialtyRepo.save(
    specialtyRepo.create({
      name: "Khoa Nhi",
      description: "Chăm sóc sức khỏe toàn diện và điều trị bệnh lý chuyên sâu cho trẻ nhỏ.",
      iconUrl: "baby",
      isActive: true,
    })
  );
  const specGeneralSurgery = await specialtyRepo.save(
    specialtyRepo.create({
      name: "Khoa Ngoại Tổng Quát",
      description: "Phẫu thuật và can thiệp ngoại khoa điều trị bệnh lý ổ bụng, tiêu hóa, chấn thương.",
      iconUrl: "activity",
      isActive: true,
    })
  );
  const specEnt = await specialtyRepo.save(
    specialtyRepo.create({
      name: "Khoa Tai Mũi Họng",
      description: "Khám và điều trị các bệnh lý tai mũi họng cho người lớn và trẻ em.",
      iconUrl: "ear",
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
  console.log("Seeded 6 Specialties.");

  // 2. Clinic Rooms (P.101, P.102, P.103, P.104, P.105, P.001)
  const roomRepo = dataSource.getRepository(ClinicRoomEntity);
  await roomRepo.save([
    roomRepo.create({ roomNumber: "P.101", roomName: "Phòng khám Tim Mạch", specialtyId: specCardio.id, location: "Tầng 1 - Khu A", isActive: true }),
    roomRepo.create({ roomNumber: "P.102", roomName: "Phòng khám Da Liễu", specialtyId: specDermatology.id, location: "Tầng 1 - Khu A", isActive: true }),
    roomRepo.create({ roomNumber: "P.103", roomName: "Phòng khám Nhi", specialtyId: specPediatrics.id, location: "Tầng 1 - Khu B", isActive: true }),
    roomRepo.create({ roomNumber: "P.104", roomName: "Phòng khám Ngoại Tổng Quát", specialtyId: specGeneralSurgery.id, location: "Tầng 1 - Khu B", isActive: true }),
    roomRepo.create({ roomNumber: "P.105", roomName: "Phòng khám Tai Mũi Họng", specialtyId: specEnt.id, location: "Tầng 1 - Khu C", isActive: true }),
    roomRepo.create({ roomNumber: "P.001", roomName: "Quầy Tiếp Đón Lễ Tân", location: "Sảnh Tầng 1", isActive: true }),
  ]);
  console.log("Seeded 6 Clinic Rooms (P.101 - P.105, P.001).");

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

  // 4.2 DOCTORS
  const doctorSeeds = [
    {
      user: {
        email: "doctor@ehealth.local",
        phoneNumber: "0901234002",
        fullName: "BS.CKI Trần Văn Bình",
        gender: Gender.MALE,
        dateOfBirth: "1982-08-20",
      },
      doctor: {
        specialtyId: specCardio.id,
        licenseNumber: "CCHN-001234-HN",
        academicTitle: "BS.CKI",
        consultationFee: 200000,
        roomNumber: "P.101",
        ratingAverage: 4.95,
        yearsExperience: 15,
        bioDescription: "Chuyên gia hàng đầu về tim mạch can thiệp, hơn 15 năm kinh nghiệm tại Bệnh viện Tim.",
      },
    },
    {
      user: {
        email: "doctor.hang@ehealth.local",
        phoneNumber: "0901234005",
        fullName: "BS.CKII Nguyễn Thu Hằng",
        gender: Gender.FEMALE,
        dateOfBirth: "1985-03-12",
      },
      doctor: {
        specialtyId: specDermatology.id,
        licenseNumber: "CCHN-001235-HN",
        academicTitle: "BS.CKII",
        consultationFee: 250000,
        roomNumber: "P.102",
        ratingAverage: 4.90,
        yearsExperience: 12,
        bioDescription: "Bác sĩ Chuyên khoa II Da liễu với hơn 12 năm kinh nghiệm trong điều trị và phục hồi da.",
      },
    },
    {
      user: {
        email: "doctor.long@ehealth.local",
        phoneNumber: "0901234006",
        fullName: "ThS.BS Lê Hoàng Long",
        gender: Gender.MALE,
        dateOfBirth: "1988-10-05",
      },
      doctor: {
        specialtyId: specPediatrics.id,
        licenseNumber: "CCHN-001236-HN",
        academicTitle: "ThS.BS",
        consultationFee: 200000,
        roomNumber: "P.103",
        ratingAverage: 4.85,
        yearsExperience: 10,
        bioDescription: "Thạc sĩ Bác sĩ Nhi khoa tận tâm, nhiều năm công tác tại Bệnh viện Nhi Trung ương.",
      },
    },
    {
      user: {
        email: "doctor.duc@ehealth.local",
        phoneNumber: "0901234007",
        fullName: "BSCKII Phạm Minh Đức",
        gender: Gender.MALE,
        dateOfBirth: "1979-06-18",
      },
      doctor: {
        specialtyId: specGeneralSurgery.id,
        licenseNumber: "CCHN-001237-HN",
        academicTitle: "BSCKII",
        consultationFee: 300000,
        roomNumber: "P.104",
        ratingAverage: 4.98,
        yearsExperience: 20,
        bioDescription: "Bác sĩ Chuyên khoa II Ngoại khoa, chuyên gia phẫu thuật nội soi và ngoại tiêu hóa.",
      },
    },
    {
      user: {
        email: "doctor.maianh@ehealth.local",
        phoneNumber: "0901234008",
        fullName: "BS Vũ Mai Anh",
        gender: Gender.FEMALE,
        dateOfBirth: "1992-09-25",
      },
      doctor: {
        specialtyId: specEnt.id,
        licenseNumber: "CCHN-001238-HN",
        academicTitle: "BS",
        consultationFee: 180000,
        roomNumber: "P.105",
        ratingAverage: 4.80,
        yearsExperience: 7,
        bioDescription: "Bác sĩ Tai Mũi Họng giàu kinh nghiệm trong nội soi và điều trị viêm xoang, viêm họng hạt.",
      },
    },
  ];

  const createdDoctors: DoctorEntity[] = [];

  for (const item of doctorSeeds) {
    const dUser = await userRepo.save(
      userRepo.create({
        ...item.user,
        passwordHash,
        status: UserStatus.ACTIVE,
      })
    );
    await roleRepo.save(roleRepo.create({ userId: dUser.id, role: Role.DOCTOR }));
    const doc = await docRepo.save(
      docRepo.create({
        ...item.doctor,
        userId: dUser.id,
      })
    );
    createdDoctors.push(doc);
    console.log(`Seeded DOCTOR: ${item.user.fullName} (${item.user.email}) - Phòng ${item.doctor.roomNumber}`);
  }

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

  // 5. Doctor Schedules (Hôm nay và 4 ngày tới: 3 ca trực phủ kín)
  const shiftTimes = [
    // Ca Sáng: 08:00 - 12:00 (các slot 30 phút)
    { start: "08:00:00", end: "08:30:00" },
    { start: "08:30:00", end: "09:00:00" },
    { start: "09:00:00", end: "09:30:00" },
    { start: "09:30:00", end: "10:00:00" },
    { start: "10:00:00", end: "10:30:00" },
    { start: "10:30:00", end: "11:00:00" },
    { start: "11:00:00", end: "11:30:00" },
    { start: "11:30:00", end: "12:00:00" },
    // Ca Chiều: 13:30 - 17:30 (các slot 30 phút)
    { start: "13:30:00", end: "14:00:00" },
    { start: "14:00:00", end: "14:30:00" },
    { start: "14:30:00", end: "15:00:00" },
    { start: "15:00:00", end: "15:30:00" },
    { start: "15:30:00", end: "16:00:00" },
    { start: "16:00:00", end: "16:30:00" },
    { start: "16:30:00", end: "17:00:00" },
    { start: "17:00:00", end: "17:30:00" },
    // Ca Tối: 18:00 - 22:30 (các slot 30 phút - ĐẶC BIỆT QUAN TRỌNG ĐỂ TEST WALK-IN BAN ĐÊM)
    { start: "18:00:00", end: "18:30:00" },
    { start: "18:30:00", end: "19:00:00" },
    { start: "19:00:00", end: "19:30:00" },
    { start: "19:30:00", end: "20:00:00" },
    { start: "20:00:00", end: "20:30:00" },
    { start: "20:30:00", end: "21:00:00" },
    { start: "21:00:00", end: "21:30:00" },
    { start: "21:30:00", end: "22:00:00" },
    { start: "22:00:00", end: "22:30:00" },
  ];

  let firstSchedule: DoctorScheduleEntity | null = null;
  const schedulesToSave: DoctorScheduleEntity[] = [];

  for (let d = 0; d < 5; d++) {
    const curDate = new Date();
    curDate.setDate(curDate.getDate() + d);
    const dateStr = formatDate(curDate);

    for (let docIdx = 0; docIdx < createdDoctors.length; docIdx++) {
      const doc = createdDoctors[docIdx];
      for (let sIdx = 0; sIdx < shiftTimes.length; sIdx++) {
        const isBooked = (d === 0 && docIdx === 0 && sIdx === 0);
        const sched = schedRepo.create({
          doctorId: doc.id,
          date: dateStr,
          startTime: shiftTimes[sIdx].start,
          endTime: shiftTimes[sIdx].end,
          status: isBooked ? SlotStatus.BOOKED : SlotStatus.AVAILABLE,
        });
        schedulesToSave.push(sched);
      }
    }
  }

  // Save schedules in chunks
  const savedSchedules = await schedRepo.save(schedulesToSave, { chunk: 100 });
  console.log(`Seeded ${savedSchedules.length} Doctor Schedules across 5 days (Morning, Afternoon, Evening shifts).`);

  // First booked slot for sample appointment
  firstSchedule = savedSchedules.find(s => s.status === SlotStatus.BOOKED) ?? null;

  // 6. Sample Appointment for QA
  if (firstSchedule && createdDoctors.length > 0) {
    const appt = await apptRepo.save(
      apptRepo.create({
        appointmentCode: "APPT-QA-0001",
        patientId: patient.id,
        doctorId: createdDoctors[0].id,
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
