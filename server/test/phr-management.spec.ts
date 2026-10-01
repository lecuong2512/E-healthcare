import "reflect-metadata";
import "./test-environment";
import { INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sign } from "jsonwebtoken";
import { DataSource, EntityManager } from "typeorm";
import { PhrController } from "../src/modules/phr/phr.controller";
import { PhrService } from "../src/modules/phr/phr.service";
import { SessionService } from "../src/modules/auth/session.service";
import { AccessTokenGuard } from "../src/common/guards/access-token.guard";
import { RolesGuard } from "../src/common/guards/roles.guard";
import { RedisService } from "../src/common/redis/redis.service";
import { configureApp } from "../src/configure-app";
import { UserEntity } from "../src/database/entities/user.entity";
import { AuthSessionEntity, PersonalHealthProfileEntity, UserRoleEntity } from "../src/database/entities/auth.entity";
import { Role, UserStatus, Gender, DateOfBirthPrecision } from "@shared/enums";
import { UpdatePhrProfileRequest } from "@shared/interfaces";

describe("Wave 2B.3-B: PHR Evidence & Execution (Card 1.5 Baseline)", () => {
  let app: INestApplication;
  let usersStore: Map<string, UserEntity>;
  let phrStore: Map<string, PersonalHealthProfileEntity>;
  let userRolesStore: Map<string, UserRoleEntity[]>;
  let sessionsStore: Map<string, AuthSessionEntity>;
  let redisStore: Map<string, string>;

  let patientUser: UserEntity;
  let patientPhr: PersonalHealthProfileEntity;
  let patientToken: string;
  let doctorUser: UserEntity;
  let doctorToken: string;

  const patientId = "a1111111-1111-4111-8111-111111111111";
  const doctorId = "b2222222-2222-4222-8222-222222222222";
  const sessionId = "c3333333-3333-4333-8333-333333333333";
  const jwtAccessSecret = "test-access-secret-not-for-production-123456";

  beforeAll(async () => {
    usersStore = new Map();
    phrStore = new Map();
    userRolesStore = new Map();
    sessionsStore = new Map();
    redisStore = new Map();

    const mockManager: Partial<EntityManager> = {
      save: jest.fn().mockImplementation(async (targetOrEntity: any, maybeEntity?: any) => {
        const entityClass = maybeEntity ? targetOrEntity : targetOrEntity?.constructor;
        const entity = maybeEntity || targetOrEntity;

        if (entityClass === UserEntity || entity instanceof UserEntity || (entity.email && entity.status)) {
          usersStore.set(entity.id, { ...entity });
          return entity;
        }
        if (entityClass === PersonalHealthProfileEntity || entity instanceof PersonalHealthProfileEntity || entity.userId) {
          phrStore.set(entity.userId, { ...entity });
          return entity;
        }
        return entity;
      }),

      getRepository: jest.fn().mockImplementation((entityClass: any) => {
        if (entityClass === UserEntity) {
          return {
            findOne: jest.fn().mockImplementation(async ({ where }: any) => {
              if (where?.id) return usersStore.get(where.id) || null;
              return null;
            }),
            findOneBy: jest.fn().mockImplementation(async ({ id }: any) => {
              return usersStore.get(id) || null;
            }),
            save: jest.fn().mockImplementation(async (u: UserEntity) => {
              usersStore.set(u.id, { ...u });
              return u;
            }),
          };
        }

        if (entityClass === PersonalHealthProfileEntity) {
          return {
            findOne: jest.fn().mockImplementation(async ({ where }: any) => {
              if (where?.userId) return phrStore.get(where.userId) || null;
              return null;
            }),
            findOneBy: jest.fn().mockImplementation(async ({ userId }: any) => {
              return phrStore.get(userId) || null;
            }),
            save: jest.fn().mockImplementation(async (p: PersonalHealthProfileEntity) => {
              phrStore.set(p.userId, { ...p });
              return p;
            }),
          };
        }

        if (entityClass === UserRoleEntity) {
          return {
            findBy: jest.fn().mockImplementation(async ({ userId }: { userId: string }) => {
              return userRolesStore.get(userId) || [];
            }),
          };
        }

        if (entityClass === AuthSessionEntity) {
          return {
            findOneBy: jest.fn().mockImplementation(async (criteria: any) => {
              if (criteria.id) {
                const s = sessionsStore.get(criteria.id);
                if (s && (!criteria.userId || s.userId === criteria.userId)) return s;
              }
              return null;
            }),
          };
        }

        return {};
      }),
    };

    const mockDataSource: Partial<DataSource> = {
      manager: mockManager as EntityManager,
      getRepository: jest.fn().mockImplementation((entityClass: any) => mockManager.getRepository!(entityClass)),
      transaction: jest.fn().mockImplementation(async (cb: (manager: EntityManager) => Promise<any>) => {
        return cb(mockManager as EntityManager);
      }),
    };

    const mockRedis: Partial<RedisService> = {
      get: jest.fn().mockImplementation(async (key: string) => redisStore.get(key) || null),
    };

    const module = await Test.createTestingModule({
      controllers: [PhrController],
      providers: [
        PhrService,
        SessionService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: RedisService, useValue: mockRedis },
        AccessTokenGuard,
        RolesGuard,
        { provide: APP_GUARD, useExisting: AccessTokenGuard },
        { provide: APP_GUARD, useExisting: RolesGuard },
      ],
    }).compile();

    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(() => {
    usersStore.clear();
    phrStore.clear();
    userRolesStore.clear();
    sessionsStore.clear();
    redisStore.clear();

    // 1. Seed Patient User
    patientUser = {
      id: patientId,
      email: "patient.phr@example.com",
      phoneNumber: "+84901111111",
      passwordHash: "hashed_pass",
      fullName: "Nguyễn Văn Khởi Tạo",
      gender: Gender.MALE,
      dateOfBirth: "1992-04-10",
      dateOfBirthPrecision: DateOfBirthPrecision.FULL_DATE,
      status: UserStatus.ACTIVE,
      failedLoginAttempts: 0,
      loginLockedUntil: null,
      googleSubject: null,
      createdAt: new Date(),
    } as any;
    usersStore.set(patientId, patientUser);

    // Seed Empty Initial PHR for Patient
    patientPhr = {
      id: "phr-1111-1111-1111",
      userId: patientId,
      bloodType: null,
      allergies: null,
      medicalHistory: null,
      citizenId: null,
      address: null,
      healthInsurance: null,
      chronicDiseases: null,
      surgeryHistory: null,
    } as any;
    phrStore.set(patientId, patientPhr);

    userRolesStore.set(patientId, [{ userId: patientId, role: Role.PATIENT } as UserRoleEntity]);
    sessionsStore.set(sessionId, {
      id: sessionId,
      userId: patientId,
      refreshTokenHash: "hash",
      expiresAt: new Date(Date.now() + 604800000),
      revokedAt: null,
    } as any);

    // Mint Access Token for Patient
    patientToken = sign(
      {
        userId: patientId,
        role: Role.PATIENT,
        sid: sessionId,
        type: "access",
      },
      jwtAccessSecret,
      {
        algorithm: "HS256",
        issuer: "ehealth-api",
        audience: "ehealth-client",
        subject: patientId,
        expiresIn: 900,
      },
    );

    // 2. Seed Doctor User
    doctorUser = {
      id: doctorId,
      email: "doctor.phr@example.com",
      phoneNumber: "+84902222222",
      passwordHash: "hashed_pass",
      fullName: "BS Lê Văn Khám",
      gender: Gender.MALE,
      dateOfBirth: "1980-01-01",
      dateOfBirthPrecision: DateOfBirthPrecision.FULL_DATE,
      status: UserStatus.ACTIVE,
      failedLoginAttempts: 0,
      loginLockedUntil: null,
      googleSubject: null,
      createdAt: new Date(),
    } as any;
    usersStore.set(doctorId, doctorUser);
    userRolesStore.set(doctorId, [{ userId: doctorId, role: Role.DOCTOR } as UserRoleEntity]);
    const doctorSessionId = "d4444444-4444-4444-8444-444444444444";
    sessionsStore.set(doctorSessionId, {
      id: doctorSessionId,
      userId: doctorId,
      refreshTokenHash: "hash",
      expiresAt: new Date(Date.now() + 604800000),
      revokedAt: null,
    } as any);

    // Mint Access Token for Doctor
    doctorToken = sign(
      {
        userId: doctorId,
        role: Role.DOCTOR,
        sid: doctorSessionId,
        type: "access",
      },
      jwtAccessSecret,
      {
        algorithm: "HS256",
        issuer: "ehealth-api",
        audience: "ehealth-client",
        subject: doctorId,
        expiresIn: 900,
      },
    );
  });

  // =========================================================================
  // TC-PHR-001: Cập nhật thông tin nhân khẩu học
  // =========================================================================
  describe("TC-PHR-001: Cập nhật thông tin nhân khẩu học", () => {
    it("thực hiện flow update -> lưu CSDL -> đọc lại từ API: thông tin họ tên, CCCD, giới tính, ngày sinh, địa chỉ, BHYT hiển thị chính xác", async () => {
      const updatePayload: UpdatePhrProfileRequest = {
        fullName: "Nguyễn Văn Bệnh Nhân",
        citizenId: "012345678901",
        gender: Gender.MALE,
        dateOfBirth: "1990-05-15",
        address: "123 Đường Lê Lợi, Phường Bến Nghé, Quận 1, TP.HCM",
        healthInsurance: "DN4010123456789",
        bloodType: "O+",
        allergies: "Không có",
        chronicDiseases: "Không có",
        surgeryHistory: "Không có",
      };

      // 1. Gửi request cập nhật PUT /api/v1/phr/me
      const putRes = await request(app.getHttpServer())
        .put("/api/v1/phr/me")
        .set("Authorization", `Bearer ${patientToken}`)
        .send(updatePayload)
        .expect(200);

      // Assertions trên response của PUT
      expect(putRes.body.fullName).toBe("Nguyễn Văn Bệnh Nhân");
      expect(putRes.body.citizenId).toBe("012345678901");
      expect(putRes.body.gender).toBe(Gender.MALE);
      expect(putRes.body.dateOfBirth).toBe("1990-05-15");
      expect(putRes.body.address).toBe("123 Đường Lê Lợi, Phường Bến Nghé, Quận 1, TP.HCM");
      expect(putRes.body.healthInsurance).toBe("DN4010123456789");

      // 2. Gọi lại GET /api/v1/phr/me để chứng minh dữ liệu được hiển thị lại chính xác
      const getRes = await request(app.getHttpServer())
        .get("/api/v1/phr/me")
        .set("Authorization", `Bearer ${patientToken}`)
        .expect(200);

      expect(getRes.body.fullName).toBe("Nguyễn Văn Bệnh Nhân");
      expect(getRes.body.citizenId).toBe("012345678901");
      expect(getRes.body.gender).toBe(Gender.MALE);
      expect(getRes.body.dateOfBirth).toBe("1990-05-15");
      expect(getRes.body.address).toBe("123 Đường Lê Lợi, Phường Bến Nghé, Quận 1, TP.HCM");
      expect(getRes.body.healthInsurance).toBe("DN4010123456789");

      // 3. Kiểm tra trực tiếp persistence trong CSDL (UserEntity & PersonalHealthProfileEntity)
      const userInDb = usersStore.get(patientId);
      expect(userInDb).toBeDefined();
      expect(userInDb?.fullName).toBe("Nguyễn Văn Bệnh Nhân");
      expect(userInDb?.gender).toBe(Gender.MALE);
      expect(userInDb?.dateOfBirth).toBe("1990-05-15");

      const phrInDb = phrStore.get(patientId);
      expect(phrInDb).toBeDefined();
      expect(phrInDb?.citizenId).toBe("012345678901");
      expect(phrInDb?.address).toBe("123 Đường Lê Lợi, Phường Bến Nghé, Quận 1, TP.HCM");
      expect(phrInDb?.healthInsurance).toBe("DN4010123456789");
    });
  });

  // =========================================================================
  // TC-PHR-002: Cập nhật nhóm máu
  // =========================================================================
  describe("TC-PHR-002: Cập nhật nhóm máu", () => {
    it("lưu và hiển thị chính xác giá trị nhóm máu hợp lệ (AB+, O-) và từ chối nhóm máu không hợp lệ", async () => {
      const basePayload: UpdatePhrProfileRequest = {
        fullName: "Nguyễn Văn Nhóm Máu",
        citizenId: "123456789",
        gender: Gender.FEMALE,
        dateOfBirth: "1995-10-20",
        address: "456 Đường CMT8, Q3, TP.HCM",
        healthInsurance: "GD4010123456789",
        bloodType: "AB+",
        allergies: "Chưa ghi nhận",
        chronicDiseases: "Chưa ghi nhận",
        surgeryHistory: "Chưa ghi nhận",
      };

      // 1. Cập nhật nhóm máu AB+
      await request(app.getHttpServer())
        .put("/api/v1/phr/me")
        .set("Authorization", `Bearer ${patientToken}`)
        .send(basePayload)
        .expect(200);

      // Đọc lại từ GET /api/v1/phr/me
      const getRes1 = await request(app.getHttpServer())
        .get("/api/v1/phr/me")
        .set("Authorization", `Bearer ${patientToken}`)
        .expect(200);
      expect(getRes1.body.bloodType).toBe("AB+");
      expect(phrStore.get(patientId)?.bloodType).toBe("AB+");

      // 2. Đổi sang nhóm máu O-
      await request(app.getHttpServer())
        .put("/api/v1/phr/me")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({ ...basePayload, bloodType: "O-" })
        .expect(200);

      const getRes2 = await request(app.getHttpServer())
        .get("/api/v1/phr/me")
        .set("Authorization", `Bearer ${patientToken}`)
        .expect(200);
      expect(getRes2.body.bloodType).toBe("O-");
      expect(phrStore.get(patientId)?.bloodType).toBe("O-");

      // 3. Kiểm tra nhóm máu không hợp lệ (X+, ABC) bị từ chối 400 Bad Request
      const invalidRes = await request(app.getHttpServer())
        .put("/api/v1/phr/me")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({ ...basePayload, bloodType: "X+" })
        .expect(400);

      expect(invalidRes.body.message).toBeDefined();
    });
  });

  // =========================================================================
  // TC-PHR-003: Cập nhật dị ứng thuốc
  // =========================================================================
  describe("TC-PHR-003: Cập nhật dị ứng thuốc", () => {
    it("lưu và hiển thị chính xác thông tin dị ứng thuốc của bệnh nhân", async () => {
      const allergyInfo = "Dị ứng Penicillin (sốc phản vệ độ 2), Dị ứng Aspirin (mẩn ngứa, co thắt phế quản)";
      const updatePayload: UpdatePhrProfileRequest = {
        fullName: "Nguyễn Dị Ứng",
        citizenId: "012345678901",
        gender: Gender.MALE,
        dateOfBirth: "1988-12-12",
        address: "789 Đường Hai Bà Trưng, Q1, TP.HCM",
        healthInsurance: "DN4010123456789",
        bloodType: "B+",
        allergies: allergyInfo,
        chronicDiseases: "Không có",
        surgeryHistory: "Không có",
      };

      // 1. Cập nhật dị ứng qua PUT /api/v1/phr/me
      const putRes = await request(app.getHttpServer())
        .put("/api/v1/phr/me")
        .set("Authorization", `Bearer ${patientToken}`)
        .send(updatePayload)
        .expect(200);

      expect(putRes.body.allergies).toBe(allergyInfo);

      // 2. Đọc lại từ GET /api/v1/phr/me
      const getRes = await request(app.getHttpServer())
        .get("/api/v1/phr/me")
        .set("Authorization", `Bearer ${patientToken}`)
        .expect(200);

      expect(getRes.body.allergies).toBe(allergyInfo);

      // 3. Kiểm tra CSDL thực tế
      const phrInDb = phrStore.get(patientId);
      expect(phrInDb?.allergies).toBe(allergyInfo);
    });
  });

  // =========================================================================
  // TC-PHR-004: Cập nhật bệnh mạn tính và tiền sử phẫu thuật
  // =========================================================================
  describe("TC-PHR-004: Cập nhật bệnh mạn tính và tiền sử phẫu thuật", () => {
    it("lưu thành công và hiển thị chính xác danh sách bệnh mạn tính và tiền sử phẫu thuật", async () => {
      const chronicInfo = "Tăng huyết áp vô căn (10 năm, đang điều trị Amlodipine), Đái tháo đường type 2 (5 năm)";
      const surgeryInfo = "Phẫu thuật nội soi cắt ruột thừa năm 2018 (BV Chợ Rẫy), Phẫu thuật kết hợp xương đùi trái năm 2015";

      const updatePayload: UpdatePhrProfileRequest = {
        fullName: "Trần Mạn Tính",
        citizenId: "012345678901",
        gender: Gender.MALE,
        dateOfBirth: "1975-03-25",
        address: "101 Đường Trần Hưng Đạo, Q5, TP.HCM",
        healthInsurance: "HT4010123456789",
        bloodType: "A+",
        allergies: "Chưa ghi nhận",
        chronicDiseases: chronicInfo,
        surgeryHistory: surgeryInfo,
      };

      // 1. Cập nhật qua PUT /api/v1/phr/me
      const putRes = await request(app.getHttpServer())
        .put("/api/v1/phr/me")
        .set("Authorization", `Bearer ${patientToken}`)
        .send(updatePayload)
        .expect(200);

      expect(putRes.body.chronicDiseases).toBe(chronicInfo);
      expect(putRes.body.surgeryHistory).toBe(surgeryInfo);

      // 2. Đọc lại từ GET /api/v1/phr/me
      const getRes = await request(app.getHttpServer())
        .get("/api/v1/phr/me")
        .set("Authorization", `Bearer ${patientToken}`)
        .expect(200);

      expect(getRes.body.chronicDiseases).toBe(chronicInfo);
      expect(getRes.body.surgeryHistory).toBe(surgeryInfo);

      // 3. Kiểm tra persistence trong CSDL
      const phrInDb = phrStore.get(patientId);
      expect(phrInDb?.chronicDiseases).toBe(chronicInfo);
      expect(phrInDb?.surgeryHistory).toBe(surgeryInfo);
    });
  });

  // =========================================================================
  // TC-PHR-005: PHR được cập nhật hiển thị cho bác sĩ khi bắt đầu ca khám
  // (IMPLEMENTATION DEFECT AUDIT VERIFICATION)
  // =========================================================================
  describe("TC-PHR-005: PHR được cập nhật hiển thị cho bác sĩ khi bắt đầu ca khám (AUDIT DEFECT)", () => {
    it("chứng minh implementation defect: Bác sĩ gọi GET /api/v1/phr/me (như frontend consultation.page.ts:35 đang gọi) bị từ chối HTTP 403 ROLE_FORBIDDEN", async () => {
      // Frontend Doctor Consultation Page (client/src/app/features/doctor/pages/consultation/consultation.page.ts)
      // tại dòng 35 gọi: this.phr.getMyPhr().subscribe(...)
      // Trong đó PhrService.getMyPhr() gửi GET /api/v1/phr/me với token của Doctor.

      // Gửi request với Doctor token:
      const doctorRes = await request(app.getHttpServer())
        .get("/api/v1/phr/me")
        .set("Authorization", `Bearer ${doctorToken}`)
        .expect(403); // Bị RolesGuard chặn do PhrController chỉ cho phép Role.PATIENT

      expect(doctorRes.body.code).toBe("ROLE_FORBIDDEN");
      expect(doctorRes.body.message).toBe("Bạn không có quyền truy cập chức năng này.");

      // Kết luận: Doctor hoàn toàn không thể xem PHR của bệnh nhân qua flow hiện tại.
      // Dữ liệu PHR của bệnh nhân KHÔNG thể tự động hiển thị ở màn hình tiếp nhận của bác sĩ.
    });
  });
});
