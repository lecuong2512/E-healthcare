import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ResetPasswordDto } from "../src/modules/auth/dto/password-reset.dto";

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
