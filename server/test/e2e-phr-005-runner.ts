import "reflect-metadata";
import "./test-environment";
import { spawn, ChildProcess } from "node:child_process";
import { createServer, Server, IncomingMessage, ServerResponse } from "node:http";
import { request as httpRequest } from "node:http";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, extname } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerGuard } from "@nestjs/throttler";
import { DataSource } from "typeorm";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/configure-app";
import { environment } from "../src/config/environment";
import { DatabaseModule } from "../src/database/database.module";
import { createDataSource } from "../src/database/database-options";
import { SessionService } from "../src/modules/auth/session.service";
import {
  Role,
  Gender,
  DateOfBirthPrecision,
  UserStatus,
  SlotStatus,
  AppointmentStatus,
  PaymentStatus,
  PaymentMethod,
} from "@shared/enums";

// Kiểm tra nghiêm ngặt CSDL test
environment.COOKIE_SECURE = "false";
environment.FRONTEND_URL = "http://127.0.0.1:4200";
const url = environment.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.startsWith("/ehealth_phr_test_db")) {
  throw new Error("TEST_DATABASE_URL phải trỏ đến CSDL ehealth_phr_test_db riêng.");
}

const clientDist = resolve(__dirname, "../../client/dist/ehealth-web-client/browser");
const screenshotsDir = resolve(__dirname, "../../docs/screenshots");
const chromePath = process.env.CHROME_BIN || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find(existsSync);

assert(chromePath, "Google Chrome binary not found.");
assert(existsSync(join(clientDist, "index.html")), "Build client bundle first.");

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

// IDs
const specialtyId = "e1111111-1111-4111-8111-111111111111";

// Doctor A (BS.CKII Lê Cường)
const userDoctorAId = "d1111111-1111-4111-8111-111111111111";
const doctorAId = "d1111111-2222-4111-8111-222222222222";
const doctorAEmail = "doctor.a@hospital.vn";
const doctorAPassword = "DoctorPass123!";

// Doctor B (BS. ThS Trần Hoa)
const userDoctorBId = "d2222222-1111-4111-8111-111111111111";
const doctorBId = "d2222222-2222-4111-8111-222222222222";
const doctorBEmail = "doctor.b@hospital.vn";
const doctorBPassword = "DoctorPass123!";

// Patient A (Lê Văn Một)
const patientAId = "11111111-1111-4111-8111-111111111111";
const patientAEmail = "patient.a@hospital.vn";
const patientAPassword = "PatientPass123!";

// Schedule & Appointment 1
const schedule1Id = "c1111111-1111-4111-8111-111111111111";
const appointment1Id = "b1111111-1111-4111-8111-111111111111";
const appointment1Code = "APT-E2E-2026-001";

async function main() {
  console.log("================================================================================");
  console.log("FINAL E2E RETEST: TC-PHR-005 THEO SRS-EHEALTH-2026-V1");
  console.log("Database: ehealth_phr_test_db | Chrome: Headless CDP");
  console.log("================================================================================");

  let app: INestApplication | null = null;
  let database: DataSource | null = null;
  let webServer: Server | null = null;
  let browserProcess: ChildProcess | null = null;
  let profileDir: string | null = null;

  try {
    // 1. Khởi tạo CSDL thật
    console.log("\n[1/6] Kết nối PostgreSQL test DB ehealth_phr_test_db và chạy migration...");
    database = await createDataSource(url!).initialize();
    await database.runMigrations();

    // 2. Dọn dẹp và Seed dữ liệu ban đầu
    console.log("[2/6] Dọn dẹp sạch sẽ và Seed dữ liệu ca khám kiểm thử...");
    await database.query(
      `TRUNCATE appointments, doctor_schedules, doctors, specialties,
                personal_health_profiles, auth_sessions, user_roles, users CASCADE`,
    );

    const doctorHash = await bcrypt.hash(doctorAPassword, 10);
    const patientHash = await bcrypt.hash(patientAPassword, 10);

    // Specialty
    await database.query(
      `INSERT INTO specialties (id, name, description, is_active)
       VALUES ($1, 'Khoa Nội Tổng Quát', 'Khoa Nội tổng quát khám và chẩn đoán', true)`,
      [specialtyId],
    );

    // Doctor A
    await database.query(
      `INSERT INTO users (id, email, phone_number, password_hash, full_name, gender, date_of_birth, date_of_birth_precision, status)
       VALUES ($1, $2, '+84901000001', $3, 'BS.CKII Lê Cường', $4, '1980-01-01', $5, $6)`,
      [userDoctorAId, doctorAEmail, doctorHash, Gender.MALE, DateOfBirthPrecision.FULL_DATE, UserStatus.ACTIVE],
    );
    await database.query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, $2)`,
      [userDoctorAId, Role.DOCTOR],
    );
    await database.query(
      `INSERT INTO doctors (id, user_id, specialty_id, license_number, academic_title, consultation_fee, room_number, rating_average, years_experience)
       VALUES ($1, $2, $3, 'CCHN-00123', 'BSCKII', 300000, 'P.201', 5.00, 15)`,
      [doctorAId, userDoctorAId, specialtyId],
    );

    // Doctor B
    await database.query(
      `INSERT INTO users (id, email, phone_number, password_hash, full_name, gender, date_of_birth, date_of_birth_precision, status)
       VALUES ($1, $2, '+84901000002', $3, 'BS. ThS Trần Hoa', $4, '1985-05-15', $5, $6)`,
      [userDoctorBId, doctorBEmail, doctorHash, Gender.FEMALE, DateOfBirthPrecision.FULL_DATE, UserStatus.ACTIVE],
    );
    await database.query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, $2)`,
      [userDoctorBId, Role.DOCTOR],
    );
    await database.query(
      `INSERT INTO doctors (id, user_id, specialty_id, license_number, academic_title, consultation_fee, room_number, rating_average, years_experience)
       VALUES ($1, $2, $3, 'CCHN-00456', 'ThS.BS', 250000, 'P.202', 4.90, 10)`,
      [doctorBId, userDoctorBId, specialtyId],
    );

    // Patient A (Lê Văn Một)
    await database.query(
      `INSERT INTO users (id, email, phone_number, password_hash, full_name, gender, date_of_birth, date_of_birth_precision, status)
       VALUES ($1, $2, '+84911000001', $3, 'Lê Văn Một', $4, '1992-04-12', $5, $6)`,
      [patientAId, patientAEmail, patientHash, Gender.MALE, DateOfBirthPrecision.FULL_DATE, UserStatus.ACTIVE],
    );
    await database.query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, $2)`,
      [patientAId, Role.PATIENT],
    );
    await database.query(
      `INSERT INTO personal_health_profiles (
         user_id, citizen_id, address, health_insurance,
         blood_type, allergies, chronic_diseases, surgery_history
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        patientAId,
        "001200000001",
        "123 Nguyễn Trãi, Quận 1, TP.HCM",
        "DN4010123456789",
        "B+",
        "Penicillin, Sulfonamide",
        "Hen phế quản mãn tính",
        "Mổ ruột thừa năm 2018",
      ],
    );

    // Schedule & Appointment 1 (Doctor A + Patient A)
    await database.query(
      `INSERT INTO doctor_schedules (id, doctor_id, date, start_time, end_time, status)
       VALUES ($1, $2, '2026-10-05', '08:00:00', '08:30:00', $3)`,
      [schedule1Id, doctorAId, SlotStatus.BOOKED],
    );
    // Initial status: CHECKED_IN (Bệnh nhân đã có mặt tại phòng khám và được tiếp đón)
    await database.query(
      `INSERT INTO appointments (
         id, appointment_code, patient_id, doctor_id, schedule_id,
         status, reason_for_visit, payment_status, payment_method, total_amount
       ) VALUES ($1, $2, $3, $4, $5, $6, 'Đau thắt ngực khi gắng sức', $7, $8, 300000)`,
      [
        appointment1Id,
        appointment1Code,
        patientAId,
        doctorAId,
        schedule1Id,
        AppointmentStatus.CHECKED_IN,
        PaymentStatus.PAID,
        PaymentMethod.PAY_AT_CLINIC,
      ],
    );

    // 3. Khởi động Backend NestJS
    console.log("[3/6] Khởi động NestJS backend server trên cổng 3333...");
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideModule(DatabaseModule)
      .useModule({
        module: class TestDatabaseModule {},
        providers: [{ provide: DataSource, useValue: database }],
        exports: [DataSource],
      })
      .overrideProvider(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.listen(3333);
    console.log("   -> Backend live at: http://127.0.0.1:3333");

    // 4. Khởi động Frontend Web Server Reverse Proxy
    console.log("[4/6] Khởi động Frontend Web Server trên cổng 4200 (kèm reverse-proxy /api/v1 -> 3333)...");
    webServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const parsedUrl = new URL(req.url || "/", "http://127.0.0.1:4200");

      // Proxy API requests directly to NestJS backend
      if (parsedUrl.pathname.startsWith("/api/")) {
        const proxyReq = httpRequest(
          {
            hostname: "127.0.0.1",
            port: 3333,
            path: req.url,
            method: req.method,
            headers: {
              ...req.headers,
              host: "127.0.0.1:3333",
            },
          },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
            proxyRes.pipe(res);
          },
        );

        proxyReq.on("error", (err) => {
          res.writeHead(502, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        });

        req.pipe(proxyReq);
        return;
      }

      // Serve static client bundle
      let filePath = join(clientDist, parsedUrl.pathname === "/" ? "index.html" : parsedUrl.pathname);
      if (!existsSync(filePath) || parsedUrl.pathname.indexOf(".") === -1) {
        // SPA Fallback
        filePath = join(clientDist, "index.html");
      }

      try {
        const content = await readFile(filePath);
        const ext = extname(filePath).toLowerCase();
        res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
        res.end(content);
      } catch (err: any) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found: " + err.message);
      }
    });

    await new Promise<void>((resolveServer) => webServer!.listen(4200, "127.0.0.1", resolveServer));
    console.log("   -> Frontend live at: http://127.0.0.1:4200");

    // 5. STEP 1: NGHIỆP VỤ BÁC SĨ "TIẾP NHẬN KHÁM" (SRS-DOC-02)
    console.log("\n--- BƯỚC 1: BÁC SĨ THỰC HIỆN TIẾP NHẬN KHÁM (SRS-DOC-02) ---");
    // Doctor A logs in to obtain JWT
    const loginDoctorRes = await fetch("http://127.0.0.1:3333/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: doctorAEmail, password: doctorAPassword }),
    });
    assert.equal(loginDoctorRes.status, 200, "Doctor A login must return HTTP 200");
    const doctorALoginData = (await loginDoctorRes.json()) as any;
    const doctorAToken = doctorALoginData.accessToken;
    console.log(`   -> Bác sĩ A đăng nhập thành công. Role: ${doctorALoginData.role}`);

    // Call business transition API: PATCH /api/v1/appointments/:id/status
    console.log(`   -> Bác sĩ A nhấn 'Tiếp nhận khám' cho lịch hẹn ${appointment1Code}...`);
    const transitionRes = await fetch(`http://127.0.0.1:3333/api/v1/appointments/${appointment1Id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${doctorAToken}`,
      },
      body: JSON.stringify({ status: AppointmentStatus.IN_CONSULTATION }),
    });
    assert.equal(transitionRes.status, 200, "Transition to IN_CONSULTATION must return HTTP 200");
    const transitionData = (await transitionRes.json()) as any;
    assert.equal(transitionData.status, AppointmentStatus.IN_CONSULTATION, "Appointment status must be IN_CONSULTATION");

    // Query real PostgreSQL database to verify status persisted
    const [dbAppointment] = await database.query(
      `SELECT id, status, appointment_code FROM appointments WHERE id = $1`,
      [appointment1Id],
    );
    assert.equal(dbAppointment.status, AppointmentStatus.IN_CONSULTATION, "Database status must be IN_CONSULTATION");
    console.log(`   [PASS] SRS-DOC-02: Ca khám ${dbAppointment.appointment_code} đã chuyển sang trạng thái IN_CONSULTATION trong PostgreSQL.`);

    // 6. STEP 2: TIỀN ĐIỀU KIỆN MÀN HÌNH KHÁM (SRS-DOC-03)
    console.log("\n--- BƯỚC 2: KIỂM TRA TIỀN ĐIỀU KIỆN BUỒNG KHÁM (SRS-DOC-03) ---");
    assert.equal(dbAppointment.status, AppointmentStatus.IN_CONSULTATION);
    console.log(`   [PASS] SRS-DOC-03 Tiền điều kiện: appointment.status === 'IN_CONSULTATION' (Hợp lệ).`);

    // 7. STEP 3: MỞ TRÌNH DUYỆT GOOGLE CHROME THỰC TẾ & TỰ ĐỘNG HIỂN THỊ PHR (SRS-AUTH-03 & SRS-DOC-03)
    console.log("\n--- BƯỚC 3: MỞ BROWSER CHROME HEADLESS & ĐIỀU HƯỚNG VÀO BUỒNG KHÁM ---");
    profileDir = await mkdtemp(join(tmpdir(), "ehealth-e2e-phr005-"));
    browserProcess = spawn(
      chromePath!,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--remote-debugging-port=0",
        `--user-data-dir=${profileDir}`,
        "about:blank",
      ],
      { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
    );

    const websocketUrl = await new Promise<string>((done, reject) => {
      let stderr = "";
      const timeout = setTimeout(() => reject(new Error("Chrome startup timed out.")), 15000);
      browserProcess!.stderr!.on("data", (chunk) => {
        stderr += chunk;
        const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) {
          clearTimeout(timeout);
          done(match[1]);
        }
      });
    });

    console.log(`   -> Kết nối Chrome DevTools Protocol qua WebSocket...`);
    const ws = new WebSocket(websocketUrl);
    await new Promise<void>((done, reject) => {
      ws.onopen = () => done();
      ws.onerror = reject;
    });

    let nextId = 0;
    const pending = new Map<number, { resolve: (res: any) => void; reject: (err: any) => void }>();
    ws.onmessage = ({ data }) => {
      const msg = JSON.parse(data.toString());
      const req = pending.get(msg.id);
      if (req) {
        pending.delete(msg.id);
        if (msg.error) req.reject(new Error(JSON.stringify(msg.error)));
        else req.resolve(msg.result);
      }
    };

    function send(method: string, params: any = {}, sessionId?: string): Promise<any> {
      const id = ++nextId;
      return new Promise((resolveReq, rejectReq) => {
        pending.set(id, { resolve: resolveReq, reject: rejectReq });
        ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
    }

    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    await send("Page.enable", {}, sessionId);
    await send("DOM.enable", {}, sessionId);
    await send("Network.enable", {}, sessionId);
    await send("Runtime.enable", {}, sessionId);

    // Track network requests to prove real API was requested by Angular
    let phrApiRequested = false;
    let phrApiStatus = 0;
    ws.onmessage = ({ data }) => {
      const msg = JSON.parse(data.toString());
      if (msg.method === "Network.requestWillBeSent") {
        const req = msg.params.request;
        if (req.url.includes("/api/")) {
          console.log(`   [Browser Net >>] ${req.method} ${req.url}`);
        }
      }
      if (msg.method === "Network.responseReceived") {
        const resp = msg.params.response;
        if (resp.url.includes("/api/")) {
          console.log(`   [Browser Net <<] ${resp.status} ${resp.url}`);
        }
        if (resp.url.includes(`/api/v1/clinical/appointments/${appointment1Id}/patient-phr`)) {
          phrApiRequested = true;
          phrApiStatus = resp.status;
          console.log(`   -> [Browser Network] GET /api/v1/clinical/appointments/${appointment1Id}/patient-phr intercepted. Status: ${resp.status}`);
        }
      }
      if (msg.method === "Runtime.consoleAPICalled") {
        const text = msg.params.args?.map((a: any) => a.value || a.description).join(" ");
        console.log(`   [Browser Console] ${msg.params.type}: ${text}`);
      }
      if (msg.method === "Runtime.exceptionThrown") {
        console.log(`   [Browser Exception]`, JSON.stringify(msg.params.exceptionDetails));
      }
      const req = pending.get(msg.id);
      if (req) {
        pending.delete(msg.id);
        if (msg.error) req.reject(new Error(JSON.stringify(msg.error)));
        else req.resolve(msg.result);
      }
    };

    // Navigate to Login page
    const targetUrl = `http://127.0.0.1:4200/login`;
    console.log(`   -> Điều hướng browser đến: ${targetUrl}`);
    await send("Page.navigate", { url: targetUrl }, sessionId);
    
    // Wait for login inputs to be mounted
    let inputReady = false;
    for (let i = 0; i < 30; i++) {
      await delay(300);
      const checkInput = await send(
        "Runtime.evaluate",
        { expression: "!!document.querySelector('input#identifier')" },
        sessionId,
      );
      if (checkInput.result?.value) {
        inputReady = true;
        break;
      }
    }
    assert(inputReady, "Màn hình đăng nhập (/login) phải hiển thị ô nhập liệu.");

    // Fill in Doctor credentials
    console.log("   -> Điền thông tin đăng nhập Bác sĩ A...");
    await send(
      "Runtime.evaluate",
      {
        expression: `(() => {
          const idInput = document.querySelector('input#identifier');
          const passInput = document.querySelector('input#password');
          if (!idInput || !passInput) throw new Error('Login inputs not found');
          idInput.value = '${doctorAEmail}';
          idInput.dispatchEvent(new Event('input', { bubbles: true }));
          idInput.dispatchEvent(new Event('change', { bubbles: true }));
          passInput.value = '${doctorAPassword}';
          passInput.dispatchEvent(new Event('input', { bubbles: true }));
          passInput.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        })()`,
        awaitPromise: true,
      },
      sessionId,
    );

    await delay(300);

    // Submit form
    console.log("   -> Submit form đăng nhập...");
    await send(
      "Runtime.evaluate",
      {
        expression: `(() => {
          const form = document.querySelector('form');
          const submitBtn = document.querySelector('button[type="submit"]');
          if (submitBtn && !submitBtn.disabled) {
            submitBtn.click();
          } else if (form) {
            form.requestSubmit();
          } else {
            throw new Error('No form or button found');
          }
          return true;
        })()`,
        awaitPromise: true,
      },
      sessionId,
    );

    // Wait for login redirect
    console.log("   -> Chờ đăng nhập Bác sĩ A thành công...");
    let loggedIn = false;
    for (let i = 0; i < 30; i++) {
      await delay(500);
      const state = await send(
        "Runtime.evaluate",
        {
          expression: `(() => {
            const err = document.querySelector('p.text-red-600')?.textContent || '';
            const btn = document.querySelector('button[type="submit"]');
            return {
              url: window.location.href,
              error: err.trim(),
              btnDisabled: btn?.disabled,
              loading: btn?.getAttribute('aria-busy')
            };
          })()`,
          returnByValue: true,
        },
        sessionId,
      );
      const val = state.result?.value;
      if (val && !val.url.includes("/login")) {
        loggedIn = true;
        console.log(`   -> Đăng nhập thành công, URL hiện tại: ${val.url}`);
        break;
      }
      if (i % 5 === 0) {
        console.log(`   [Poll ${i}] URL: ${val?.url}, Error: "${val?.error}", BtnDisabled: ${val?.btnDisabled}`);
      }
    }
    assert(loggedIn, "Đăng nhập Bác sĩ A phải thành công.");

    // Navigate to consultation page
    console.log(`   -> Điều hướng browser vào buồng khám: /doctor/consultation/${appointment1Id}...`);
    await send(
      "Page.navigate",
      { url: `http://127.0.0.1:4200/doctor/consultation/${appointment1Id}` },
      sessionId,
    );

    // Wait for redirect to /doctor/consultation/:appointment1Id
    console.log("   -> Chờ Angular load buồng khám và gọi endpoint PHR bệnh nhân...");
    let loaded = false;
    for (let i = 0; i < 30; i++) {
      await delay(500);
      const urlNow = await send("Runtime.evaluate", { expression: "window.location.href" }, sessionId);
      if (urlNow.result?.value && urlNow.result.value.includes(`/doctor/consultation/${appointment1Id}`)) {
        loaded = true;
        break;
      }
    }
    assert(loaded, "Must navigate to consultation page after login.");

    // Wait for PHR section in DOM
    let phrRendered = false;
    for (let i = 0; i < 30; i++) {
      await delay(300);
      const hasPhr = await send(
        "Runtime.evaluate",
        { expression: "!!document.querySelector('section.bg-amber-50')" },
        sessionId,
      );
      if (hasPhr.result.value) {
        phrRendered = true;
        break;
      }
    }
    assert(phrRendered, "PHR section (.bg-amber-50) must render in DOM.");

    // Inspect live DOM values
    const domPhr = await send(
      "Runtime.evaluate",
      {
        expression: `(() => {
          const header = document.querySelector('header h1')?.textContent || '';
          const badge = document.querySelector('app-consultation-page header')?.textContent || document.querySelector('.bg-purple-100')?.textContent || '';
          const phrSection = document.querySelector('section.bg-amber-50')?.textContent || '';
          const recordCode = document.querySelector('p.font-mono')?.textContent || '';
          return { header, badge, phrSection, recordCode };
        })()`,
        returnByValue: true,
      },
      sessionId,
    );

    const domVal = domPhr.result.value;
    console.log("\n   [Live DOM Extracted Data]:");
    console.log(`     - Header (Bệnh nhân): "${domVal.header.trim()}"`);
    console.log(`     - Trạng thái ca khám: "${domVal.badge.includes('Đang khám') ? 'Đang khám' : 'Khác'}"`);
    console.log(`     - Mã ca khám / hồ sơ: "${domVal.recordCode.trim()}"`);
    console.log(`     - Nội dung tiền sử PHR: "${domVal.phrSection.trim()}"`);

    // Capture E2E Screenshot 1
    const { data: img1 } = await send("Page.captureScreenshot", { format: "png" }, sessionId);
    const shot1Path = join(screenshotsDir, "tc-phr-005-consultation-e2e.png");
    await writeFile(shot1Path, Buffer.from(img1, "base64"));
    console.log(`   -> [Screenshot] Đã lưu ảnh chụp giao diện: ${shot1Path}`);

    // Assertions for Step 3
    assert(phrApiRequested, "Angular MUST make live HTTP request to patient-phr endpoint");
    assert.equal(phrApiStatus, 200, "patient-phr endpoint must return HTTP 200");
    assert(domVal.header.includes("Lê Văn Một"), "UI must display patient name 'Lê Văn Một'");
    assert(domVal.badge.includes("Đang khám"), "UI must display status badge 'Đang khám'");
    assert(domVal.phrSection.includes("B+"), "UI must display Blood Group 'B+'");
    assert(domVal.phrSection.includes("Penicillin, Sulfonamide"), "UI must display Allergies");
    assert(domVal.phrSection.includes("Hen phế quản mãn tính"), "UI must display Chronic Diseases");
    assert(domVal.phrSection.includes("Mổ ruột thừa năm 2018"), "UI must display Surgery History");
    console.log("   [PASS] SRS-AUTH-03 & SRS-DOC-03: PHR của đúng bệnh nhân đã tự động hiển thị đầy đủ trên Consultation UI.");

    // 8. STEP 4: DYNAMIC DATABASE UPDATE VERIFICATION (Prompt Requirement #6)
    console.log("\n--- BƯỚC 4: KIỂM CHỨNG DỮ LIỆU ĐỘNG TỪ POSTGRESQL (DYNAMIC DB UPDATE) ---");
    // Patient A updates PHR via API
    const loginPatRes = await fetch("http://127.0.0.1:3333/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: patientAEmail, password: patientAPassword }),
    });
    const patientAToken = ((await loginPatRes.json()) as any).accessToken;

    console.log("   -> Bệnh nhân A thực hiện cập nhật PHR mới qua PUT /api/v1/phr/me...");
    const updatePhrRes = await fetch("http://127.0.0.1:3333/api/v1/phr/me", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${patientAToken}`,
      },
      body: JSON.stringify({
        fullName: "Lê Văn Một (Cập Nhật 2026)",
        citizenId: "001200000001",
        gender: Gender.MALE,
        dateOfBirth: "1992-04-12",
        address: "789 Nguyễn Thị Minh Khai, Quận 3, TP.HCM",
        healthInsurance: "DN4010123456789",
        bloodType: "AB+",
        allergies: "Penicillin, Sulfonamide, Cephalosporin",
        chronicDiseases: "Hen phế quản mãn tính đã kiểm soát tốt",
        surgeryHistory: "Mổ ruột thừa năm 2018, Nội soi khớp gối 2024",
      }),
    });
    assert.equal(updatePhrRes.status, 200, "Update PHR must return 200");
    console.log("   -> CSDL PostgreSQL đã cập nhật thành công.");

    // Reload page in Chrome Headless to verify dynamic retrieval
    console.log("   -> Reload trang buồng khám trong browser...");
    await send("Page.reload", {}, sessionId);
    await delay(2500);

    const domPhrUpdated = await send(
      "Runtime.evaluate",
      {
        expression: `(() => {
          const header = document.querySelector('header h1')?.textContent || '';
          const phrSection = document.querySelector('section.bg-amber-50')?.textContent || '';
          return { header, phrSection };
        })()`,
        returnByValue: true,
      },
      sessionId,
    );

    const domValUp = domPhrUpdated.result.value;
    console.log("   [Live DOM Extracted Data After Reload]:");
    console.log(`     - Header mới: "${domValUp.header.trim()}"`);
    console.log(`     - PHR mới: "${domValUp.phrSection.trim()}"`);

    // Capture E2E Screenshot 2
    const { data: img2 } = await send("Page.captureScreenshot", { format: "png" }, sessionId);
    const shot2Path = join(screenshotsDir, "tc-phr-005-dynamic-update-e2e.png");
    await writeFile(shot2Path, Buffer.from(img2, "base64"));
    console.log(`   -> [Screenshot] Đã lưu ảnh chụp giao diện cập nhật: ${shot2Path}`);

    assert(domValUp.phrSection.includes("AB+"), "Updated Blood Group 'AB+' must appear in DOM");
    assert(domValUp.phrSection.includes("Cephalosporin"), "Updated Allergies must appear in DOM");
    assert(domValUp.phrSection.includes("Hen phế quản mãn tính đã kiểm soát tốt"), "Updated Chronic Diseases must appear in DOM");
    assert(domValUp.phrSection.includes("Nội soi khớp gối 2024"), "Updated Surgery History must appear in DOM");
    console.log("   [PASS] Dữ liệu PHR được load động 100% từ CSDL PostgreSQL thật, không phải fixture cứng.");

    // 9. STEP 5: AUTHORIZATION & PATIENT ISOLATION (SRS Mục 5.4, Prompt Requirement #7 & #8)
    console.log("\n--- BƯỚC 5: KIỂM TRA PHÂN QUYỀN VÀ CÁCH LY BỆNH NHÂN (SRS MỤC 5.4) ---");
    // Doctor B logs in
    const loginDocBRes = await fetch("http://127.0.0.1:3333/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: doctorBEmail, password: doctorBPassword }),
    });
    const doctorBToken = ((await loginDocBRes.json()) as any).accessToken;

    // Doctor B attempts to view Doctor A's appointment PHR
    console.log("   -> Bác sĩ B cố gắng truy cập ca khám của Bác sĩ A...");
    const docBAccessRes = await fetch(`http://127.0.0.1:3333/api/v1/clinical/appointments/${appointment1Id}/patient-phr`, {
      headers: { Authorization: `Bearer ${doctorBToken}` },
    });
    assert.equal(docBAccessRes.status, 403, "Doctor B accessing Doctor A appointment must return HTTP 403");
    const docBBody = (await docBAccessRes.json()) as any;
    assert.equal(docBBody.code, "UNAUTHORIZED_DOCTOR");
    assert.equal(docBBody.bloodType, undefined, "Zero patient data leaked");
    console.log("   [PASS] SRS 5.4: Bác sĩ B bị từ chối với HTTP 403 UNAUTHORIZED_DOCTOR, không lộ dữ liệu.");

    // Patient calls doctor endpoint
    console.log("   -> Người dùng vai trò PATIENT gọi endpoint buồng khám...");
    const patAccessRes = await fetch(`http://127.0.0.1:3333/api/v1/clinical/appointments/${appointment1Id}/patient-phr`, {
      headers: { Authorization: `Bearer ${patientAToken}` },
    });
    assert.equal(patAccessRes.status, 403, "Patient role must be rejected with 403");
    console.log("   [PASS] Vai trò PATIENT bị từ chối truy cập endpoint buồng khám.");

    // Unauthenticated request
    console.log("   -> Yêu cầu không có token...");
    const unauthRes = await fetch(`http://127.0.0.1:3333/api/v1/clinical/appointments/${appointment1Id}/patient-phr`);
    assert.equal(unauthRes.status, 401, "Unauthenticated request must be rejected with 401");
    console.log("   [PASS] Yêu cầu không xác thực bị từ chối với HTTP 401 Unauthorized.");

    // Client-side patientId tampering test
    console.log("   -> Kiểm tra chống giả mạo patientId...");
    const tamperRes = await fetch(`http://127.0.0.1:3333/api/v1/clinical/appointments/${appointment1Id}/patient-phr?patientId=arbitrary-id`, {
      headers: { Authorization: `Bearer ${doctorAToken}` },
    });
    assert.equal(tamperRes.status, 200);
    const tamperData = (await tamperRes.json()) as any;
    assert.equal(tamperData.fullName, "Lê Văn Một (Cập Nhật 2026)", "Endpoint strictly resolves patient from appointmentId in DB, ignoring arbitrary query parameters");
    console.log("   [PASS] Backend xác định bệnh nhân duy nhất từ appointmentId trong CSDL PostgreSQL, hoàn toàn miễn nhiễm can thiệp phía client.");

    console.log("\n================================================================================");
    console.log("KẾT QUẢ FINAL E2E RETEST TC-PHR-005: 100% CÁC BƯỚC ĐẠT (PASS)");
    console.log("================================================================================");
  } finally {
    console.log("\n[Clean Up] Thu dọn tiến trình và tài nguyên...");
    if (browserProcess) {
      browserProcess.kill();
      console.log("   - Google Chrome process terminated.");
    }
    if (profileDir && existsSync(profileDir)) {
      await rm(profileDir, { recursive: true, force: true }).catch(() => {});
    }
    if (webServer) {
      await new Promise<void>((resolveClose) => webServer!.close(() => resolveClose()));
      console.log("   - Web server closed.");
    }
    if (app) {
      await app.close();
      console.log("   - NestJS backend closed.");
    }
    if (database && database.isInitialized) {
      await database.destroy();
      console.log("   - Database connection closed.");
    }
  }
}

main().catch((err) => {
  console.error("\nFATAL ERROR trong E2E Retest:", err);
  process.exit(1);
});
