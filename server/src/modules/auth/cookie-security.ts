import { CookieOptions } from "express";
import { environment } from "../../config/environment";

/** Secure Cookie mặc định bật; dev HTTP phải chủ động đặt COOKIE_SECURE=false. */
export function usesSecureCookies(): boolean {
  const configured = environment.COOKIE_SECURE;
  if (configured === undefined || configured === "" || configured === "true")
    return true;
  if (configured === "false") {
    if (environment.NODE_ENV === "production")
      throw new Error("Production bắt buộc COOKIE_SECURE=true.");
    return false;
  }
  throw new Error("COOKIE_SECURE chỉ nhận giá trị true hoặc false.");
}

export function refreshCookieOptions(maxAge: number): CookieOptions {
  return {
    httpOnly: true,
    secure: usesSecureCookies(),
    sameSite: "strict",
    path: "/api/v1/auth",
    maxAge,
  };
}

export function googleCookieBase(): Pick<
  CookieOptions,
  "httpOnly" | "secure" | "path"
> {
  return {
    httpOnly: true,
    secure: usesSecureCookies(),
    path: "/api/v1/auth/google",
  };
}
