import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ResetPasswordDto } from "../src/modules/auth/dto/password-reset.dto";
import { UpdatePhrProfileDto } from "../src/modules/phr/dto/update-phr-profile.dto";
import { Gender } from "@shared/enums";

describe("password reset validation", () => {
  const valid = { identifier: "patient@example.com", otp: "012345", newPassword: "Abcd123!" };
  test("accepts six-digit OTP and SRS password policy", async () => {
    expect(await validate(plainToInstance(ResetPasswordDto, valid))).toEqual([]);
  });
  test.each(["12345", "abcdef", "1234567"])("rejects invalid OTP %s", async otp => {
    expect((await validate(plainToInstance(ResetPasswordDto, { ...valid, otp }))).some(e => e.property === "otp")).toBe(true);
  });
  test.each(["Ab1!aaa", "abcdefgh", "ABCDEFGH", "Abcdefgh", "Abcd1234"])("rejects weak password", async newPassword => {
    expect((await validate(plainToInstance(ResetPasswordDto, { ...valid, newPassword }))).some(e => e.property === "newPassword")).toBe(true);
  });
});

describe("PHR profile validation", () => {
  const validPhr = {
    fullName: "Nguyen Van A",
    citizenId: "001200000001",
    gender: Gender.MALE,
    dateOfBirth: "1995-05-15",
    address: "Ha Noi",
    healthInsurance: "DN 4 01 234567890",
    bloodType: "O+",
    allergies: "Penicillin",
    chronicDiseases: "None",
    surgeryHistory: "None",
  };

  test("accepts valid PHR profile with Vietnamese BHYT and blood type", async () => {
    expect(await validate(plainToInstance(UpdatePhrProfileDto, validPhr))).toEqual([]);
  });

  test.each(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"])("accepts valid blood type %s", async bloodType => {
    expect(await validate(plainToInstance(UpdatePhrProfileDto, { ...validPhr, bloodType }))).toEqual([]);
  });

  test.each(["XYZ", "C+", "O", "AB", ""])("rejects invalid blood type %s", async bloodType => {
    const errors = await validate(plainToInstance(UpdatePhrProfileDto, { ...validPhr, bloodType }));
    expect(errors.some(e => e.property === "bloodType")).toBe(true);
  });

  test.each(["DN4010123456789", "DN 4 01 234567890", "GD 2 79 1234567890", ""])("accepts valid BHYT format %s", async healthInsurance => {
    expect(await validate(plainToInstance(UpdatePhrProfileDto, { ...validPhr, healthInsurance }))).toEqual([]);
  });

  test.each(["12345", "INVALID", "DN1234", "DN 9 01 1234567890"])("rejects invalid BHYT format %s", async healthInsurance => {
    const errors = await validate(plainToInstance(UpdatePhrProfileDto, { ...validPhr, healthInsurance }));
    expect(errors.some(e => e.property === "healthInsurance")).toBe(true);
  });
});

