import "./test-environment";
import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, HttpException, HttpStatus } from "@nestjs/common";
import { DataSource, EntityManager, FindManyOptions } from "typeorm";
import { AuthService } from "../src/modules/auth/auth.service";
import { OtpDeliveryService } from "../src/modules/auth/otp-delivery.service";
import {
  PersonalHealthProfileEntity,
  RegistrationOtpSendEntity,
  RegistrationSessionEntity,
  UserRoleEntity,
} from "../src/database/entities/auth.entity";
import { UserEntity } from "../src/database/entities/user.entity";
import { DateOfBirthPrecision, Gender, Role, UserStatus } from "@shared/enums";

describe("Wave 2B.3-A: Authentication Registration Coverage (Card 1.5 Baseline)", () => {
  let authService: AuthService;
  let mockDataSource: DataSource;
  let mockDelivery: OtpDeliveryService;
  let sentOtps: { target: { email?: string | null; phoneNumber?: string | null }; otp: string }[];
  let currentTime: Date;

  // In-memory data stores
  let usersStore: Map<string, UserEntity>;
  let userRolesStore: Map<string, UserRoleEntity>;
  let phrStore: Map<string, PersonalHealthProfileEntity>;
  let sessionsStore: Map<string, RegistrationSessionEntity>;
  let otpSendsStore: RegistrationOtpSendEntity[];

  beforeEach(() => {
    currentTime = new Date("2026-03-30T10:00:00.000Z");
    sentOtps = [];
    usersStore = new Map();
    userRolesStore = new Map();
    phrStore = new Map();
    sessionsStore = new Map();
    otpSendsStore = [];

    mockDelivery = {
      send: jest.fn().mockImplementation(async (target, otp) => {
        sentOtps.push({ target, otp });
        return true;
      }),
    } as unknown as OtpDeliveryService;

    // Build mock EntityManager and Repositories
    const mockManager: Partial<EntityManager> = {
      query: jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
        if (typeof sql === "string" && sql.includes("clock_timestamp()")) {
          return [{ now: new Date(currentTime) }];
        }
        if (typeof sql === "string" && sql.includes("pg_advisory_xact_lock")) {
          return [];
        }
        return [];
      }),

      getRepository: jest.fn().mockImplementation((entityClass: any) => {
        if (entityClass === UserEntity) {
          return {
            createQueryBuilder: jest.fn().mockImplementation(() => {
              let filterEmail: string | null = null;
              let filterPhoneVariants: string[] = [];
              const qb = {
                where: jest.fn().mockImplementation((_clause: string, params: any) => {
                  if (params?.email !== undefined) filterEmail = params.email;
                  return qb;
                }),
                orWhere: jest.fn().mockImplementation((_clause: string, params: any) => {
                  if (params?.phoneVariants !== undefined) filterPhoneVariants = params.phoneVariants;
                  return qb;
                }),
                getOne: jest.fn().mockImplementation(async () => {
                  for (const user of usersStore.values()) {
                    if (filterEmail && user.email && user.email.toLowerCase() === filterEmail.toLowerCase()) {
                      return user;
                    }
                    if (filterPhoneVariants.length > 0 && user.phoneNumber && filterPhoneVariants.includes(user.phoneNumber) && user.passwordHash) {
                      return user;
                    }
                  }
                  return null;
                }),
              };
              return qb;
            }),
            save: jest.fn().mockImplementation(async (entity: Partial<UserEntity>) => {
              const id = entity.id || randomUUID();
              const saved = { ...entity, id } as UserEntity;
              usersStore.set(id, saved);
              return saved;
            }),
            create: jest.fn().mockImplementation((dto: any) => ({ ...dto })),
          };
        }

        if (entityClass === RegistrationSessionEntity) {
          return {
            createQueryBuilder: jest.fn().mockImplementation(() => {
              let filterEmail: string | null = null;
              let filterPhone: string | null = null;
              let filterId: string | null = null;
              const qb = {
                where: jest.fn().mockImplementation((clause: string, params: any) => {
                  if (params?.email !== undefined) filterEmail = params.email;
                  if (params?.phoneNumber !== undefined) filterPhone = params.phoneNumber;
                  if (params?.id !== undefined) filterId = params.id;
                  return qb;
                }),
                setLock: jest.fn().mockReturnThis(),
                getOne: jest.fn().mockImplementation(async () => {
                  for (const session of sessionsStore.values()) {
                    if (filterId && session.id === filterId) return session;
                    if (filterEmail && session.email === filterEmail) return session;
                    if (filterPhone && session.phoneNumber === filterPhone) return session;
                  }
                  return null;
                }),
              };
              return qb;
            }),
            findOneBy: jest.fn().mockImplementation(async ({ id }: { id: string }) => {
              return sessionsStore.get(id) || null;
            }),
            save: jest.fn().mockImplementation(async (entity: RegistrationSessionEntity) => {
              sessionsStore.set(entity.id, entity);
              return entity;
            }),
            create: jest.fn().mockImplementation((dto: any) => ({ ...dto })),
            remove: jest.fn().mockImplementation(async (entity: RegistrationSessionEntity) => {
              sessionsStore.delete(entity.id);
              return entity;
            }),
            update: jest.fn().mockImplementation(async (id: string, partial: Partial<RegistrationSessionEntity>) => {
              const existing = sessionsStore.get(id);
              if (existing) {
                Object.assign(existing, partial);
              }
              return { affected: existing ? 1 : 0 };
            }),
          };
        }

        if (entityClass === RegistrationOtpSendEntity) {
          return {
            createQueryBuilder: jest.fn().mockReturnValue({
              delete: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              execute: jest.fn().mockImplementation(async () => {
                // Delete old items
                return { affected: 0 };
              }),
            }),
            find: jest.fn().mockImplementation(async (options: FindManyOptions<RegistrationOtpSendEntity>) => {
              const where = options?.where as any;
              const phone = where?.phoneNumber;
              const cutoff = where?.sentAt?._value;
              let filtered = otpSendsStore.filter((r) => r.phoneNumber === phone);
              if (cutoff instanceof Date) {
                filtered = filtered.filter((r) => r.sentAt > cutoff);
              }
              filtered.sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
              const take = options?.take ?? filtered.length;
              return filtered.slice(0, take);
            }),
            save: jest.fn().mockImplementation(async (entity: RegistrationOtpSendEntity) => {
              const id = entity.id || String(otpSendsStore.length + 1);
              const saved = { ...entity, id };
              otpSendsStore.push(saved);
              return saved;
            }),
            create: jest.fn().mockImplementation((dto: any) => ({ ...dto })),
          };
        }

        if (entityClass === UserRoleEntity) {
          return {
            save: jest.fn().mockImplementation(async (entity: UserRoleEntity) => {
              const key = `${entity.userId}:${entity.role}`;
              userRolesStore.set(key, entity);
              return entity;
            }),
            create: jest.fn().mockImplementation((dto: any) => ({ ...dto })),
            findBy: jest.fn().mockImplementation(async ({ userId }: { userId: string }) => {
              const result: UserRoleEntity[] = [];
              for (const r of userRolesStore.values()) {
                if (r.userId === userId) result.push(r);
              }
              return result;
            }),
          };
        }

        if (entityClass === PersonalHealthProfileEntity) {
          return {
            save: jest.fn().mockImplementation(async (entity: Partial<PersonalHealthProfileEntity>) => {
              const id = entity.id || randomUUID();
              const saved = { ...entity, id } as PersonalHealthProfileEntity;
              phrStore.set(id, saved);
              return saved;
            }),
            create: jest.fn().mockImplementation((dto: any) => ({ ...dto })),
          };
        }

        return {};
      }),
    };

    mockDataSource = {
      manager: mockManager as EntityManager,
      transaction: jest.fn().mockImplementation(async (cb: (manager: EntityManager) => Promise<any>) => {
        return cb(mockManager as EntityManager);
      }),
    } as unknown as DataSource;

    authService = new AuthService(mockDataSource, mockDelivery);
  });

  // Helper to advance deterministic time
  const advanceTimeBy = (seconds: number) => {
    currentTime = new Date(currentTime.getTime() + seconds * 1000);
  };

  // Helper to register mock user into usersStore for conflict tests
  const seedExistingUser = (email: string | null, phoneNumber: string | null) => {
    const id = randomUUID();
    const user: UserEntity = {
      id,
      email,
      phoneNumber,
      passwordHash: "$2b$10$abcdefghijklmnopqrstuvwxyz123456",
      fullName: "Existing User",
      gender: Gender.MALE,
      dateOfBirth: "1990-01-01",
      dateOfBirthPrecision: DateOfBirthPrecision.FULL_DATE,
      status: UserStatus.ACTIVE,
      failedLoginAttempts: 0,
      loginLockedUntil: null,
      googleSubject: null,
      createdAt: new Date(),
    } as any;
    usersStore.set(id, user);
    return user;
  };

  // =========================================================================
  // TC-AUTH-001: Đăng ký tài khoản hợp lệ (Email)
  // =========================================================================
  describe("TC-AUTH-001: Đăng ký tài khoản hợp lệ (Email)", () => {
    it("hoàn thành toàn bộ luồng đăng ký: gửi OTP, xác thực, kích hoạt ACTIVE, gán ROLE_PATIENT và tạo PHR", async () => {
      const registerDto = {
        email: "patient.tc001@example.com",
        password: "Password123!",
        fullName: "Nguyễn Văn Một",
        gender: "MALE" as Gender,
        dateOfBirth: "1995-05-15",
      };

      // 1. Gửi yêu cầu đăng ký
      const requestRes = await authService.requestRegistration(registerDto);
      expect(requestRes).toBeDefined();
      expect(requestRes.registrationId).toBeDefined();
      expect(requestRes.expiresIn).toBe(180);
      expect(requestRes.resendAfter).toBe(60);
      expect(requestRes.channel).toBe("email");
      expect(mockDelivery.send).toHaveBeenCalledTimes(1);

      // Verify OTP was captured by delivery
      expect(sentOtps.length).toBe(1);
      const generatedOtp = sentOtps[0].otp;
      expect(generatedOtp).toMatch(/^[0-9]{6}$/);

      // 2. Xác thực OTP hợp lệ
      const verifyRes = await authService.verifyRegistration({
        registrationId: requestRes.registrationId,
        otp: generatedOtp,
      });

      // Asserts directly proving Expected Result
      expect(verifyRes.status).toBe("ACTIVE");
      expect(verifyRes.role).toBe(Role.PATIENT);
      expect(verifyRes.userId).toBeDefined();
      expect(verifyRes.phrId).toBeDefined();

      // Check persisted user in DB
      const persistedUser = usersStore.get(verifyRes.userId);
      expect(persistedUser).toBeDefined();
      expect(persistedUser?.email).toBe("patient.tc001@example.com");
      expect(persistedUser?.status).toBe(UserStatus.ACTIVE);
      expect(persistedUser?.fullName).toBe("Nguyễn Văn Một");

      // Check user role in DB
      const roles = Array.from(userRolesStore.values()).filter((r) => r.userId === verifyRes.userId);
      expect(roles).toHaveLength(1);
      expect(roles[0].role).toBe(Role.PATIENT);

      // Check PHR profile in DB
      const phr = phrStore.get(verifyRes.phrId);
      expect(phr).toBeDefined();
      expect(phr?.userId).toBe(verifyRes.userId);

      // Registration session removed after completion
      expect(sessionsStore.has(requestRes.registrationId)).toBe(false);
    });
  });

  // =========================================================================
  // TC-AUTH-004: Đăng ký trùng thông tin (Email hoặc Số điện thoại)
  // =========================================================================
  describe("TC-AUTH-004: Đăng ký trùng thông tin (Email hoặc Số điện thoại)", () => {
    it("từ chối với HTTP 409 Conflict khi email đã được đăng ký bởi tài khoản khác", async () => {
      seedExistingUser("duplicate@example.com", "+84900000001");

      const registerDto = {
        email: "duplicate@example.com",
        password: "Password123!",
        fullName: "Người Dùng Trùng",
        gender: "FEMALE" as Gender,
        dateOfBirth: "1992-02-02",
      };

      await expect(authService.requestRegistration(registerDto)).rejects.toThrow(ConflictException);

      try {
        await authService.requestRegistration(registerDto);
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.CONFLICT);
        const res = err.getResponse();
        expect(res.code).toBe("CONTACT_ALREADY_REGISTERED");
        expect(res.message).toBe("Email hoặc Số điện thoại đã được đăng ký. Vui lòng đăng nhập hoặc sử dụng chức năng quên mật khẩu.");
      }

      // Không có OTP nào được gửi
      expect(mockDelivery.send).not.toHaveBeenCalled();
    });

    it("từ chối với HTTP 409 Conflict khi số điện thoại (+84 và dạng 0 đầu) đã được đăng ký", async () => {
      seedExistingUser("other@example.com", "+84912345678");

      const registerDto = {
        phoneNumber: "0912345678",
        password: "Password123!",
        fullName: "Người Dùng Trùng SĐT",
        gender: "MALE" as Gender,
        dateOfBirth: "1994-04-04",
      };

      await expect(authService.requestRegistration(registerDto)).rejects.toThrow(ConflictException);

      try {
        await authService.requestRegistration(registerDto);
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.CONFLICT);
        const res = err.getResponse();
        expect(res.code).toBe("CONTACT_ALREADY_REGISTERED");
      }
    });
  });

  // =========================================================================
  // TC-AUTH-005: Xác thực OTP hợp lệ
  // =========================================================================
  describe("TC-AUTH-005: Xác thực OTP hợp lệ", () => {
    it("xác thực thành công trong thời hạn 180s và trả về đúng thông tin tài khoản ACTIVE", async () => {
      const reg = await authService.requestRegistration({
        email: "valid.otp@example.com",
        password: "Password123!",
        fullName: "Nguyễn OTP",
        gender: "MALE" as Gender,
        dateOfBirth: "1996-06-06",
      });

      const otp = sentOtps[0].otp;
      // Advance 120s (still within 180s TTL)
      advanceTimeBy(120);

      const result = await authService.verifyRegistration({
        registrationId: reg.registrationId,
        otp,
      });

      expect(result.status).toBe("ACTIVE");
      expect(result.role).toBe(Role.PATIENT);
      expect(result.userId).toBeDefined();
      expect(result.phrId).toBeDefined();

      const user = usersStore.get(result.userId);
      expect(user?.status).toBe(UserStatus.ACTIVE);
    });
  });

  // =========================================================================
  // TC-AUTH-006: Xác thực OTP hết hạn
  // =========================================================================
  describe("TC-AUTH-006: Xác thực OTP hết hạn", () => {
    it("từ chối xác thực khi đã quá 180 giây với HTTP 400 OTP_SESSION_INVALID", async () => {
      const reg = await authService.requestRegistration({
        email: "expired.otp@example.com",
        password: "Password123!",
        fullName: "Nguyễn Quá Hạn",
        gender: "OTHER" as Gender,
        dateOfBirth: "1998-08-08",
      });

      const otp = sentOtps[0].otp;

      // Advance time by 181 seconds (> 180s TTL)
      advanceTimeBy(181);

      await expect(
        authService.verifyRegistration({
          registrationId: reg.registrationId,
          otp,
        }),
      ).rejects.toThrow(BadRequestException);

      try {
        await authService.verifyRegistration({
          registrationId: reg.registrationId,
          otp,
        });
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
        const res = err.getResponse();
        expect(res.code).toBe("OTP_SESSION_INVALID");
        expect(res.message).toContain("Phiên OTP không tồn tại, đã hết hạn hoặc đã được sử dụng.");
      }

      // No user was activated in database
      const userList = Array.from(usersStore.values()).filter((u) => u.email === "expired.otp@example.com");
      expect(userList).toHaveLength(0);
    });
  });

  // =========================================================================
  // TC-AUTH-007: Xác thực OTP sai 5 lần (Lockout 15 phút)
  // =========================================================================
  describe("TC-AUTH-007: Xác thực OTP sai 5 lần (Lockout 15 phút)", () => {
    it("đếm số lần nhập sai từ 1-4, khóa 15 phút ở lần thứ 5 và từ chối các lần tiếp theo", async () => {
      const reg = await authService.requestRegistration({
        email: "lockout.otp@example.com",
        password: "Password123!",
        fullName: "Nguyễn Thử Sai",
        gender: "MALE" as Gender,
        dateOfBirth: "2000-01-01",
      });

      const wrongOtp = "000000";

      // Attempts 1 to 4: BadRequestException with remainingAttempts
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          await authService.verifyRegistration({
            registrationId: reg.registrationId,
            otp: wrongOtp,
          });
          fail(`Attempt ${attempt} should have thrown`);
        } catch (err: any) {
          expect(err).toBeInstanceOf(BadRequestException);
          expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
          const res = err.getResponse();
          expect(res.code).toBe("OTP_INVALID");
          expect(res.remainingAttempts).toBe(5 - attempt);
        }
      }

      // Attempt 5: Lockout trigger -> HTTP 429 Too Many Requests, OTP_LOCKED
      try {
        await authService.verifyRegistration({
          registrationId: reg.registrationId,
          otp: wrongOtp,
        });
        fail("Attempt 5 should have triggered lockout");
      } catch (err: any) {
        expect(err).toBeInstanceOf(HttpException);
        expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        const res = err.getResponse();
        expect(res.code).toBe("OTP_LOCKED");
        expect(res.message).toBe("OTP sai 5 lần. Vui lòng chờ 15 phút trước khi yêu cầu mã mới.");
        expect(res.retryAfter).toBe(900); // 15 minutes = 900 seconds
      }

      // Check session lockedUntil in repository
      const session = sessionsStore.get(reg.registrationId);
      expect(session).toBeDefined();
      expect(session?.failedAttempts).toBe(5);
      expect(session?.lockedUntil).toBeDefined();
      expect(session!.lockedUntil!.getTime()).toBe(currentTime.getTime() + 900 * 1000);

      // Attempt 6 during lockout: Still locked
      advanceTimeBy(60); // 1 minute into lockout
      try {
        await authService.verifyRegistration({
          registrationId: reg.registrationId,
          otp: sentOtps[0].otp, // Even with correct OTP!
        });
        fail("Should not allow verification while locked");
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        expect(err.getResponse().code).toBe("OTP_LOCKED");
        expect(err.getResponse().retryAfter).toBe(840); // 900 - 60 = 840s remaining
      }
    });
  });

  // =========================================================================
  // TC-AUTH-008: Phân quyền mặc định khi đăng ký (ROLE_PATIENT)
  // =========================================================================
  describe("TC-AUTH-008: Phân quyền mặc định khi đăng ký (ROLE_PATIENT)", () => {
    it("gán duy nhất ROLE_PATIENT cho tài khoản mới đăng ký, không cấp bất kỳ vai trò quản trị nào", async () => {
      const reg = await authService.requestRegistration({
        email: "default.role@example.com",
        password: "Password123!",
        fullName: "Bệnh Nhân Mặc Định",
        gender: "FEMALE" as Gender,
        dateOfBirth: "1999-09-09",
      });

      const res = await authService.verifyRegistration({
        registrationId: reg.registrationId,
        otp: sentOtps[0].otp,
      });

      expect(res.role).toBe(Role.PATIENT);

      const assignedRoles = Array.from(userRolesStore.values()).filter((r) => r.userId === res.userId);
      expect(assignedRoles).toHaveLength(1);
      expect(assignedRoles[0].role).toBe(Role.PATIENT);
      expect(assignedRoles.some((r) => r.role === Role.ADMIN)).toBe(false);
      expect(assignedRoles.some((r) => r.role === Role.DOCTOR)).toBe(false);
      expect(assignedRoles.some((r) => r.role === Role.RECEPTIONIST)).toBe(false);
    });
  });

  // =========================================================================
  // TC-AUTH-009: Tạo hồ sơ sức khỏe cá nhân (PHR) tự động khi đăng ký
  // =========================================================================
  describe("TC-AUTH-009: Tạo hồ sơ sức khỏe cá nhân (PHR) tự động khi đăng ký", () => {
    it("tạo bản ghi PersonalHealthProfileEntity liên kết với userId mới tạo ngay khi đăng ký thành công", async () => {
      const reg = await authService.requestRegistration({
        email: "phr.auto@example.com",
        password: "Password123!",
        fullName: "Nguyễn Hồ Sơ",
        gender: "MALE" as Gender,
        dateOfBirth: "1997-07-07",
      });

      const res = await authService.verifyRegistration({
        registrationId: reg.registrationId,
        otp: sentOtps[0].otp,
      });

      expect(res.phrId).toBeDefined();
      const phr = phrStore.get(res.phrId);
      expect(phr).toBeDefined();
      expect(phr?.id).toBe(res.phrId);
      expect(phr?.userId).toBe(res.userId);
    });
  });

  // =========================================================================
  // TC-AUTH-017: Giới hạn số lần gửi lại OTP (SMS rate limit: 3 lần/10 phút)
  // =========================================================================
  describe("TC-AUTH-017: Giới hạn số lần gửi lại OTP (SMS rate limit: 3 lần/10 phút)", () => {
    it("cho phép gửi tối đa 3 mã OTP cho một SĐT trong 10 phút, từ chối lần thứ 4 với HTTP 429 OTP_SEND_LIMIT_EXCEEDED", async () => {
      const phoneDto = {
        phoneNumber: "0987654321",
        password: "Password123!",
        fullName: "Nguyễn Giới Hạn SMS",
        gender: "MALE" as Gender,
        dateOfBirth: "1993-03-03",
      };

      // Lần 1: Cho phép
      const send1 = await authService.requestRegistration(phoneDto);
      expect(send1.registrationId).toBeDefined();
      expect(mockDelivery.send).toHaveBeenCalledTimes(1);

      // Chờ 65 giây (> 60s cooldown resend)
      advanceTimeBy(65);

      // Lần 2: Cho phép
      const send2 = await authService.requestRegistration(phoneDto);
      expect(send2.registrationId).toBeDefined();
      expect(mockDelivery.send).toHaveBeenCalledTimes(2);

      // Chờ tiếp 65 giây
      advanceTimeBy(65);

      // Lần 3: Cho phép
      const send3 = await authService.requestRegistration(phoneDto);
      expect(send3.registrationId).toBeDefined();
      expect(mockDelivery.send).toHaveBeenCalledTimes(3);

      // Chờ tiếp 65 giây (tổng thời gian = 195s < 600s cửa sổ 10 phút)
      advanceTimeBy(65);

      // Lần 4: Vượt hạn mức 3 lần/10 phút -> HTTP 429 Too Many Requests
      await expect(authService.requestRegistration(phoneDto)).rejects.toThrow(HttpException);

      try {
        await authService.requestRegistration(phoneDto);
        fail("Lần thứ 4 phải bị chặn");
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        const res = err.getResponse();
        expect(res.code).toBe("OTP_SEND_LIMIT_EXCEEDED");
        expect(res.message).toBe("Chỉ được gửi tối đa 3 mã OTP cho một Số điện thoại trong 10 phút.");
        expect(res.retryAfter).toBeGreaterThan(0);
      }

      // Tổng số lần delivery.send vẫn là 3
      expect(mockDelivery.send).toHaveBeenCalledTimes(3);
    });
  });
});
