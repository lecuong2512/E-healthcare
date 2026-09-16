import { environment } from "../src/config/environment";
import {
  refreshCookieOptions,
  usesSecureCookies,
} from "../src/modules/auth/cookie-security";

describe("Cấu hình Secure Cookie", () => {
  const originalSecure = environment.COOKIE_SECURE;
  const originalNodeEnv = environment.NODE_ENV;

  afterEach(() => {
    if (originalSecure === undefined) delete environment.COOKIE_SECURE;
    else environment.COOKIE_SECURE = originalSecure;
    if (originalNodeEnv === undefined) delete environment.NODE_ENV;
    else environment.NODE_ENV = originalNodeEnv;
  });

  test("mặc định bật Secure Cookie", () => {
    delete environment.COOKIE_SECURE;
    environment.NODE_ENV = "development";
    expect(usesSecureCookies()).toBe(true);
  });

  test("cho phép HTTP local khi cấu hình rõ", () => {
    environment.NODE_ENV = "development";
    environment.COOKIE_SECURE = "false";
    expect(refreshCookieOptions(1)).toMatchObject({ secure: false });
  });

  test("production từ chối tắt Secure Cookie", () => {
    environment.NODE_ENV = "production";
    environment.COOKIE_SECURE = "false";
    expect(usesSecureCookies).toThrow("Production bắt buộc COOKIE_SECURE=true.");
  });
});
