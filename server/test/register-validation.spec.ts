import { BadRequestException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { compare, getRounds } from "bcrypt";
import { RegisterDto, VerifyRegisterDto } from "../src/auth/dto/register.dto";
import { hashPassword } from "../src/common/utils/crypto.util";
import { configureApp } from "../src/configure-app";
import { INestApplication } from "@nestjs/common";

const input = {
  email: "patient@example.com",
  password: "Abcd123!",
  fullName: "Nguyễn Văn A",
  gender: "MALE",
  dateOfBirth: "2000-02-29",
};

describe("SRS-AUTH-01 validation and BCrypt", () => {
  test.each([
    "Abc12!x",
    "abcd123!",
    "ABCD123!",
    "Abcdefg!",
    "Abcd1234",
    "Abcd123 ",
    "Abcd123é",
  ])("rejects weak password %s", async (password) => {
    const errors = await validate(
      plainToInstance(RegisterDto, { ...input, password }),
    );
    expect(errors.some((error) => error.property === "password")).toBe(true);
  });

  test("accepts an exactly 8-character strong password", async () => {
    expect(await validate(plainToInstance(RegisterDto, input))).toEqual([]);
  });

  test("hashes with cost 12, verifies the original, and uses random salts", async () => {
    const first = await hashPassword(input.password);
    const second = await hashPassword(input.password);
    expect(getRounds(first)).toBe(12);
    expect(first).not.toBe(input.password);
    expect(first).not.toBe(second);
    expect(await compare(input.password, first)).toBe(true);
    expect(await compare("Wrong123!", first)).toBe(false);
  });

  test("normalizes email/name without changing the password", async () => {
    const dto = plainToInstance(RegisterDto, {
      ...input,
      email: " PATIENT@Example.COM ",
      fullName: "  Nguyễn Văn A  ",
      password: " Abcd123!",
    });
    expect(dto.email).toBe("patient@example.com");
    expect(dto.fullName).toBe(input.fullName);
    expect(dto.password).toBe(" Abcd123!");
    expect(await validate(dto)).toEqual([]);
  });

  test.each([
    { email: "bad-email" },
    { email: undefined },
    { fullName: "   " },
    { gender: "UNKNOWN" },
    { dateOfBirth: "2001-02-29" },
    { dateOfBirth: "2000-13-01" },
    { dateOfBirth: "2000-01-01T00:00:00Z" },
    { phoneNumber: "123", email: undefined },
    { password: "A1!" + "a".repeat(70) },
  ])("rejects malformed data %j", async (patch) => {
    expect(
      (await validate(plainToInstance(RegisterDto, { ...input, ...patch })))
        .length,
    ).toBeGreaterThan(0);
  });

  test.each(["0901234567", "+84901234567", "+14155552671"])(
    "accepts phone %s",
    async (phoneNumber) => {
      expect(
        await validate(
          plainToInstance(RegisterDto, {
            ...input,
            email: undefined,
            phoneNumber,
          }),
        ),
      ).toEqual([]);
    },
  );

  test("rejects privileged fields via the actual global validation pipe", async () => {
    let pipe: any;
    configureApp({
      use: jest.fn(),
      setGlobalPrefix: jest.fn(),
      useGlobalPipes: (value: unknown) => {
        pipe = value;
      },
    } as unknown as INestApplication);
    await expect(
      pipe.transform(
        { ...input, role: "ROLE_ADMIN", status: "ACTIVE" },
        { type: "body", metatype: RegisterDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  test.each(["12345", "1234567", "abcdef", 123456])(
    "rejects malformed OTP %s",
    async (otp) => {
      expect(
        (
          await validate(
            plainToInstance(VerifyRegisterDto, {
              registrationId: "92fb6003-a8a7-43bb-9877-42eea4438263",
              otp,
            }),
          )
        ).some((error) => error.property === "otp"),
      ).toBe(true);
    },
  );
});
