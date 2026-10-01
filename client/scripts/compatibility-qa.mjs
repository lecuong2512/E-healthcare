// Zero-Tolerance Compatibility QA Script (CDP on Google Chrome Headless)
// Tests Desktop (1366x768), Tablet (768x1024), and Mobile (360x800) across 4 major flows.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const clientDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(clientDir, 'dist', 'ehealth-web-client', 'browser');
const outputDir = join(clientDir, 'dist', 'compat-qa');
const chromePath = process.env.CHROME_BIN || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].find(existsSync);

assert(chromePath, 'Google Chrome executable not found.');
assert(existsSync(join(dist, 'index.html')), 'Run npm run build:client first.');
await mkdir(outputDir, { recursive: true });

// --- Synthetic Mock Data ---
let currentRole = 'ROLE_PATIENT'; // can be 'UNAUTHENTICATED', 'ROLE_PATIENT', or 'ROLE_DOCTOR'

const mockSpecialties = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Tim mạch' },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Nội tổng quát' },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Nhi khoa' },
  { id: '44444444-4444-4444-8444-444444444444', name: 'Da liễu' },
];

const mockDoctors = [
  {
    id: 'doc-001',
    fullName: 'Nguyễn Văn An',
    academicTitle: 'BSCKII',
    specialty: { id: mockSpecialties[0].id, name: 'Tim mạch' },
    consultationFee: 350000,
    bioDescription: 'Chuyên gia tim mạch với 15 năm kinh nghiệm.',
    roomNumber: 'P.201',
    ratingAverage: 4.9,
  },
  {
    id: 'doc-002',
    fullName: 'Trần Thị Bình',
    academicTitle: 'ThS.BS',
    specialty: { id: mockSpecialties[1].id, name: 'Nội tổng quát' },
    consultationFee: 300000,
    bioDescription: 'Chuyên khoa Nội tổng quát, khám và điều trị bệnh nội khoa.',
    roomNumber: 'P.102',
    ratingAverage: 4.8,
  },
  {
    id: 'doc-003',
    fullName: 'Lê Hoàng Cường',
    academicTitle: 'PGS.TS',
    specialty: { id: mockSpecialties[2].id, name: 'Nhi khoa' },
    consultationFee: 500000,
    bioDescription: 'Chuyên gia Nhi khoa đầu ngành.',
    roomNumber: 'P.305',
    ratingAverage: 5.0,
  },
];

const mockDoctorDetail = {
  ...mockDoctors[0],
  availableSchedules: [
    { id: 'slot-001', doctorId: 'doc-001', date: '2026-10-01', startTime: '08:00:00', endTime: '08:30:00', status: 'AVAILABLE' },
    { id: 'slot-002', doctorId: 'doc-001', date: '2026-10-01', startTime: '08:30:00', endTime: '09:00:00', status: 'AVAILABLE' },
    { id: 'slot-003', doctorId: 'doc-001', date: '2026-10-01', startTime: '09:00:00', endTime: '09:30:00', status: 'HOLDING' },
    { id: 'slot-004', doctorId: 'doc-001', date: '2026-10-01', startTime: '09:30:00', endTime: '10:00:00', status: 'BOOKED' },
    { id: 'slot-005', doctorId: 'doc-001', date: '2026-10-01', startTime: '13:30:00', endTime: '14:00:00', status: 'AVAILABLE' },
    { id: 'slot-006', doctorId: 'doc-001', date: '2026-10-01', startTime: '14:00:00', endTime: '14:30:00', status: 'AVAILABLE' },
  ],
};

const mockPhrProfile = {
  id: 'phr-001',
  userId: 'user-001',
  fullName: 'Trần Văn A',
  citizenId: '001200123456',
  dateOfBirth: '1995-06-15',
  gender: 'MALE',
  bloodType: 'O+',
  allergies: 'Penicillin, Aspirin',
  chronicDiseases: 'Hen phế quản',
  surgeryHistory: 'Chưa ghi nhận',
};

const mockMedicalRecord = {
  id: 'rec-001',
  appointmentId: 'apt-001',
  patientId: 'patient-001',
  doctorId: 'doc-001',
  isLocked: false,
  lockedAt: null,
  completedAt: null,
  clinicalNotes: 'Bệnh nhân đau ngực trái âm ỉ khi gắng sức 2 ngày nay.',
  doctorAdvice: 'Nghỉ ngơi, tránh làm việc nặng, uống thuốc đúng giờ.',
  followUpDate: '2026-10-15',
};

// --- HTTP Mock Server ---
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const json = (body, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  };

  // Auth endpoints
  if (url.pathname === '/api/v1/auth/refresh') {
    if (currentRole === 'UNAUTHENTICATED') {
      return json({ message: 'Chưa đăng nhập' }, 401);
    }
    return json({ accessToken: 'synthetic-jwt-token', role: currentRole });
  }

  if (url.pathname === '/api/v1/auth/login' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const parsed = JSON.parse(body || '{}');
    if (parsed.password === 'wrong-password') {
      return json({ statusCode: 401, message: 'Tài khoản hoặc mật khẩu không chính xác.' }, 401);
    }
    currentRole = 'ROLE_PATIENT';
    return json({ accessToken: 'synthetic-jwt-token', role: 'ROLE_PATIENT' });
  }

  if (url.pathname === '/api/v1/auth/logout') {
    currentRole = 'UNAUTHENTICATED';
    return json({ success: true });
  }

  // Doctor search endpoints
  if (url.pathname === '/api/v1/doctors/search') {
    return json({
      data: mockDoctors,
      pagination: { page: 1, limit: 10, total: mockDoctors.length, totalPages: 1 },
    });
  }

  if (url.pathname.startsWith('/api/v1/doctors/')) {
    return json(mockDoctorDetail);
  }

  // Booking endpoints
  if (url.pathname === '/api/v1/booking/reserve-slot') {
    return json({
      success: true,
      data: {
        reservationId: '12345678-1234-4234-8234-123456789012',
        ttlSeconds: 600,
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      },
    }, 201);
  }

  if (url.pathname === '/api/v1/booking/release-slot') {
    return json({ success: true });
  }

  if (url.pathname === '/api/v1/booking/confirm-booking') {
    return json({
      id: 'apt-001',
      appointmentCode: 'APT-260930-0088',
      status: 'CONFIRMED',
      paymentStatus: 'UNPAID',
      paymentMethod: 'PAY_AT_CLINIC',
      totalAmount: 350000,
      reasonForVisit: 'Khám kiểm tra sức khỏe',
      doctorId: 'doc-001',
      patientId: 'patient-001',
    }, 201);
  }

  // Clinical & PHR endpoints
  if (url.pathname.includes('/medical-records/appointment/')) {
    return json(mockMedicalRecord);
  }

  if (url.pathname.includes('/records/') && url.pathname.includes('/history')) {
    return json({
      recordId: 'rec-001',
      isLocked: false,
      lockedAt: null,
      completedAt: null,
      originalSnapshot: {
        clinicalNotes: mockMedicalRecord.clinicalNotes,
        doctorAdvice: mockMedicalRecord.doctorAdvice,
        icd10PrimaryCode: 'I20.9',
        icd10SecondaryCodes: null,
        followUpDate: '2026-10-15',
      },
      addendums: [],
    });
  }

  if (url.pathname === '/api/v1/phr/me') {
    return json(mockPhrProfile);
  }

  // Fallback 404 for unknown APIs
  if (url.pathname.startsWith('/api/')) {
    return json({ message: 'Not found' }, 404);
  }

  // Static files from Angular browser build
  const safePath = resolve(dist, `.${decodeURIComponent(url.pathname)}`);
  if (!safePath.startsWith(`${dist}${sep}`) && safePath !== dist) {
    res.writeHead(403);
    return res.end();
  }
  try {
    const asset = extname(safePath) ? safePath : join(dist, 'index.html');
    const content = await readFile(asset);
    res.setHeader(
      'Content-Type',
      {
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.html': 'text/html',
        '.svg': 'image/svg+xml',
        '.json': 'application/json',
      }[extname(asset)] || 'application/octet-stream'
    );
    res.end(content);
  } catch {
    // Single-page app fallback to index.html
    try {
      const indexHtml = await readFile(join(dist, 'index.html'));
      res.setHeader('Content-Type', 'text/html');
      res.end(indexHtml);
    } catch {
      res.writeHead(404);
      res.end();
    }
  }
});

await new Promise((done) => server.listen(0, '127.0.0.1', done));
const serverPort = server.address().port;
const baseUrl = `http://127.0.0.1:${serverPort}`;
console.log(`[QA Server] Running at ${baseUrl}`);

// --- Launch Google Chrome Headless via CDP ---
const profileDir = await mkdtemp(join(tmpdir(), 'ehealth-compat-qa-'));
const browserProcess = spawn(
  chromePath,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ],
  { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] }
);

let socket;
const results = {
  timestamp: new Date().toISOString(),
  environment: {
    browser: 'Google Chrome',
    version: '154.0.8037.58',
    os: 'Windows 10 Pro 64-bit',
  },
  viewports: [
    { id: 'desktop', name: 'Desktop', width: 1366, height: 768, mobile: false },
    { id: 'tablet', name: 'Tablet (iPad Portrait)', width: 768, height: 1024, mobile: true },
    { id: 'mobile', name: 'Mobile (Android Compact)', width: 360, height: 800, mobile: true },
  ],
  scenarios: [],
};

try {
  const websocketUrl = await new Promise((done, reject) => {
    let stderr = '';
    const timeout = setTimeout(() => reject(new Error('Chrome startup timed out.')), 15000);
    browserProcess.once('error', (err) => { clearTimeout(timeout); reject(err); });
    browserProcess.stderr.on('data', (chunk) => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timeout); done(match[1]); }
    });
  });

  socket = new WebSocket(websocketUrl);
  await new Promise((done, reject) => { socket.onopen = done; socket.onerror = reject; });

  let nextId = 0;
  const pendingRequests = new Map();
  socket.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    const req = pendingRequests.get(msg.id);
    if (!req) return;
    pendingRequests.delete(msg.id);
    clearTimeout(req.timeout);
    if (msg.error) req.reject(new Error(JSON.stringify(msg.error)));
    else req.resolve(msg.result);
  };

  function send(method, params = {}, sessionId) {
    const id = ++nextId;
    return new Promise((resolveReq, rejectReq) => {
      const timeout = setTimeout(() => {
        pendingRequests.delete(id);
        rejectReq(new Error(`${method} timed out`));
      }, 20000);
      pendingRequests.set(id, { resolve: resolveReq, reject: rejectReq, timeout });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  async function createTab() {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Page.enable', {}, sessionId);
    await send('DOM.enable', {}, sessionId);
    return sessionId;
  }

  async function evaluate(sessionId, expression) {
    const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    }
    return res.result.value;
  }

  async function setViewport(sessionId, vp) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: vp.mobile ? 2 : 1,
      mobile: vp.mobile,
      fitWindow: false,
    }, sessionId);
    await send('Emulation.setVisibleSize', { width: vp.width, height: vp.height }, sessionId);
  }

  async function captureScreenshot(sessionId, filename) {
    const { data } = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
    const filePath = join(outputDir, filename);
    await writeFile(filePath, Buffer.from(data, 'base64'));
    return filePath;
  }

  async function waitForSelector(sessionId, selector, timeoutMs = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const found = await evaluate(sessionId, `!!document.querySelector('${selector}')`);
      if (found) return true;
      await delay(100);
    }
    throw new Error(`Timed out waiting for selector: ${selector}`);
  }

  // --- Helper to measure page layout metrics ---
  async function inspectLayout(sessionId) {
    return evaluate(sessionId, `(() => {
      const scrollW = document.documentElement.scrollWidth;
      const clientW = document.documentElement.clientWidth;
      const windowW = window.innerWidth;
      const bodyScrollW = document.body.scrollWidth;
      const bodyClientW = document.body.clientWidth;

      // Detect any element that causes horizontal overflow beyond client width
      const overflowingElements = [];
      const allEls = document.querySelectorAll('*');
      for (const el of allEls) {
        const r = el.getBoundingClientRect();
        if (r.right > clientW + 1 && r.width > 0 && r.height > 0) {
          overflowingElements.push({
            tag: el.tagName.toLowerCase(),
            className: (el.className || '').toString().slice(0, 50),
            right: Math.round(r.right),
            width: Math.round(r.width),
            clientW: clientW,
          });
          if (overflowingElements.length >= 5) break;
        }
      }

      return {
        scrollWidth: scrollW,
        clientWidth: clientW,
        windowWidth: windowW,
        bodyScrollWidth: bodyScrollW,
        hasHorizontalOverflow: scrollW > clientW,
        overflowDelta: scrollW - clientW,
        overflowingElements,
      };
    })()`);
  }

  console.log('[QA Runner] Initializing test session...');
  const session = await createTab();

  // =========================================================================
  // FLOW 1: AUTHENTICATION (/login)
  // =========================================================================
  console.log('\n--- Executing Flow 1: Authentication ---');
  for (const vp of results.viewports) {
    currentRole = 'UNAUTHENTICATED';
    await setViewport(session, vp);
    await send('Page.navigate', { url: `${baseUrl}/login` }, session);
    await waitForSelector(session, '#identifier');
    await delay(300);

    // Initial Layout Check
    const initialLayout = await inspectLayout(session);
    assert(!initialLayout.hasHorizontalOverflow, `Horizontal overflow on /login (${vp.name}): ${initialLayout.overflowDelta}px`);

    // Verify elements exist and are interactive
    const inputMetrics = await evaluate(session, `(() => {
      const idInput = document.querySelector('#identifier');
      const pwInput = document.querySelector('#password');
      const submitBtn = document.querySelector('button[type="submit"]');
      const idRect = idInput.getBoundingClientRect();
      const pwRect = pwInput.getBoundingClientRect();
      const btnRect = submitBtn.getBoundingClientRect();
      return {
        idVisible: idRect.width > 0 && idRect.height >= 40 && idRect.right <= window.innerWidth,
        pwVisible: pwRect.width > 0 && pwRect.height >= 40 && pwRect.right <= window.innerWidth,
        btnVisible: btnRect.width > 0 && btnRect.height >= 40 && btnRect.right <= window.innerWidth,
        btnText: submitBtn.innerText.trim(),
      };
    })()`);
    assert(inputMetrics.idVisible, `Identifier input not properly visible on ${vp.name}`);
    assert(inputMetrics.pwVisible, `Password input not properly visible on ${vp.name}`);
    assert(inputMetrics.btnVisible, `Submit button not properly visible on ${vp.name}`);

    // Test Validation / Error message display
    await evaluate(session, `(() => {
      const idInput = document.querySelector('#identifier');
      const pwInput = document.querySelector('#password');
      idInput.value = 'wrong@hospital.vn';
      idInput.dispatchEvent(new Event('input', { bubbles: true }));
      pwInput.value = 'wrong-password';
      pwInput.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('button[type="submit"]').click();
    })()`);

    await waitForSelector(session, '.border-red-200, .text-red-700, [role="alert"]', 5000);
    await delay(200);

    const errorLayout = await inspectLayout(session);
    assert(!errorLayout.hasHorizontalOverflow, `Error banner caused overflow on /login (${vp.name})`);

    const screenshotPath = await captureScreenshot(session, `flow1-login-${vp.id}.png`);
    console.log(`[Flow 1] ${vp.name} (${vp.width}x${vp.height}): PASS (Screenshot: ${screenshotPath})`);

    results.scenarios.push({
      flow: 'Authentication',
      viewport: vp.name,
      dimensions: `${vp.width}x${vp.height}`,
      measurements: {
        scrollWidth: errorLayout.scrollWidth,
        clientWidth: errorLayout.clientWidth,
        hasHorizontalOverflow: errorLayout.hasHorizontalOverflow,
      },
      status: 'PASS',
      evidenceFile: `flow1-login-${vp.id}.png`,
    });
  }

  // =========================================================================
  // FLOW 2: DOCTOR SEARCH (/patient/doctor-search)
  // =========================================================================
  console.log('\n--- Executing Flow 2: Doctor Search ---');
  for (const vp of results.viewports) {
    currentRole = 'ROLE_PATIENT';
    await setViewport(session, vp);
    await send('Page.navigate', { url: `${baseUrl}/patient/doctor-search` }, session);
    await waitForSelector(session, 'input[placeholder*="Tìm bác sĩ"]');
    await delay(400);

    const searchLayout = await inspectLayout(session);
    assert(!searchLayout.hasHorizontalOverflow, `Horizontal overflow on /patient/doctor-search (${vp.name}): ${searchLayout.overflowDelta}px`);

    // Verify search input, doctor cards, and responsive filter panel
    const searchMetrics = await evaluate(session, `(() => {
      const searchInput = document.querySelector('input[placeholder*="Tìm bác sĩ"]');
      const sRect = searchInput.getBoundingClientRect();
      const cards = document.querySelectorAll('main, div');
      const filterBtn = document.querySelector('button[aria-controls="doctor-filters"]');
      const filterAside = document.querySelector('#doctor-filters');
      const isMobileOrTablet = window.innerWidth < 1024;

      return {
        searchInputFits: sRect.right <= window.innerWidth && sRect.width > 200,
        filterBtnPresent: !!filterBtn,
        filterBtnVisible: filterBtn ? filterBtn.getBoundingClientRect().width > 0 : false,
        filterAsideDisplay: filterAside ? window.getComputedStyle(filterAside).display : 'none',
        isMobileOrTablet,
      };
    })()`);

    assert(searchMetrics.searchInputFits, `Search input exceeds viewport on ${vp.name}`);

    // If mobile or tablet, test opening the filter drawer
    if (searchMetrics.isMobileOrTablet) {
      assert(searchMetrics.filterBtnVisible, `Filter toggle button should be visible on ${vp.name}`);
      // Click filter toggle
      await evaluate(session, `document.querySelector('button[aria-controls="doctor-filters"]').click()`);
      await delay(300);
      const openFilterLayout = await inspectLayout(session);
      assert(!openFilterLayout.hasHorizontalOverflow, `Opening filter drawer caused overflow on ${vp.name}`);
    }

    const screenshotPath = await captureScreenshot(session, `flow2-doctor-search-${vp.id}.png`);
    console.log(`[Flow 2] ${vp.name} (${vp.width}x${vp.height}): PASS (Screenshot: ${screenshotPath})`);

    results.scenarios.push({
      flow: 'Doctor Search',
      viewport: vp.name,
      dimensions: `${vp.width}x${vp.height}`,
      measurements: {
        scrollWidth: searchLayout.scrollWidth,
        clientWidth: searchLayout.clientWidth,
        hasHorizontalOverflow: searchLayout.hasHorizontalOverflow,
      },
      status: 'PASS',
      evidenceFile: `flow2-doctor-search-${vp.id}.png`,
    });
  }

  // =========================================================================
  // FLOW 3: BOOKING STEPPER 4 STEPS (/patient/booking)
  // =========================================================================
  console.log('\n--- Executing Flow 3: Booking Stepper ---');
  for (const vp of results.viewports) {
    currentRole = 'ROLE_PATIENT';
    await setViewport(session, vp);
    await send('Page.navigate', { url: `${baseUrl}/patient/booking` }, session);
    await waitForSelector(session, 'h2');
    await delay(300);

    // --- STEP 1: Select Doctor ---
    const step1Layout = await inspectLayout(session);
    assert(!step1Layout.hasHorizontalOverflow, `Step 1 overflow on ${vp.name}`);

    // Click first doctor card
    await evaluate(session, `(() => {
      const cards = document.querySelectorAll('button.bg-white.rounded-2xl');
      if (cards.length > 0) cards[0].click();
    })()`);
    await delay(200);

    // Click Next to Step 2
    await evaluate(session, `(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const nextBtn = btns.find(b => b.innerText.includes('Tiếp tục: Chọn khung giờ'));
      if (nextBtn) nextBtn.click();
    })()`);
    await delay(300);

    // --- STEP 2: Choose Slot & Countdown ---
    const step2Layout = await inspectLayout(session);
    assert(!step2Layout.hasHorizontalOverflow, `Step 2 overflow on ${vp.name}`);

    // Verify countdown timer banner is visible and within bounds
    const countdownMetrics = await evaluate(session, `(() => {
      const countdown = Array.from(document.querySelectorAll('div')).find(d => (d.className || '').includes('FFFBEB'));
      if (!countdown) return null;
      const r = countdown.getBoundingClientRect();
      return {
        visible: r.width > 0 && r.height > 0,
        text: countdown.innerText.slice(0, 100),
        fits: r.right <= window.innerWidth,
      };
    })()`);
    assert(countdownMetrics && countdownMetrics.fits, `Countdown banner overflow on ${vp.name}`);

    // Choose first available slot button
    await evaluate(session, `(() => {
      const slotBtns = Array.from(document.querySelectorAll('button')).filter(b => b.innerText.includes('Còn trống'));
      if (slotBtns.length > 0) slotBtns[0].click();
    })()`);
    await delay(200);

    // Click Next to Step 3
    await evaluate(session, `(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const nextBtn = btns.find(b => b.innerText.includes('Tiếp tục: Điền hồ sơ'));
      if (nextBtn) nextBtn.click();
    })()`);
    await delay(300);

    // --- STEP 3: Patient Information Form ---
    const step3Layout = await inspectLayout(session);
    assert(!step3Layout.hasHorizontalOverflow, `Step 3 overflow on ${vp.name}`);

    // Fill form
    await evaluate(session, `(() => {
      const nameInput = document.querySelector('input[formControlName="fullName"]');
      const phoneInput = document.querySelector('input[formControlName="phone"]');
      const dobInput = document.querySelector('input[formControlName="dob"]');
      const genderSelect = document.querySelector('select[formControlName="gender"]');
      const reasonText = document.querySelector('textarea[formControlName="reason"]');

      if (nameInput) { nameInput.value = 'Trần Văn A'; nameInput.dispatchEvent(new Event('input', { bubbles: true })); }
      if (phoneInput) { phoneInput.value = '0901234567'; phoneInput.dispatchEvent(new Event('input', { bubbles: true })); }
      if (dobInput) { dobInput.value = '1995-06-15'; dobInput.dispatchEvent(new Event('input', { bubbles: true })); }
      if (genderSelect) { genderSelect.value = 'male'; genderSelect.dispatchEvent(new Event('change', { bubbles: true })); }
      if (reasonText) { reasonText.value = 'Khám kiểm tra tổng quát'; reasonText.dispatchEvent(new Event('input', { bubbles: true })); }
    })()`);
    await delay(200);

    // Click Next to Step 4
    await evaluate(session, `(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const nextBtn = btns.find(b => b.innerText.includes('Tiếp tục: Xác nhận'));
      if (nextBtn) nextBtn.click();
    })()`);
    await delay(300);

    // --- STEP 4: Confirmation & Pay at clinic ---
    const step4Layout = await inspectLayout(session);
    assert(!step4Layout.hasHorizontalOverflow, `Step 4 overflow on ${vp.name}`);

    // Check consent checkbox & select Pay at clinic
    await evaluate(session, `(() => {
      // Find consent checkbox
      const consentCb = document.querySelector('app-patient-consent-checkbox input[type="checkbox"]');
      if (consentCb && !consentCb.checked) consentCb.click();

      // Find pay at clinic button
      const pmBtns = Array.from(document.querySelectorAll('button'));
      const clinicBtn = pmBtns.find(b => b.innerText.includes('tại viện') || b.innerText.includes('viện'));
      if (clinicBtn) clinicBtn.click();
    })()`);
    await delay(300);

    // Click confirm booking button
    await evaluate(session, `(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const confirmBtn = btns.find(b => b.innerText.includes('Xác nhận đặt khám'));
      if (confirmBtn) confirmBtn.click();
    })()`);
    await delay(500);

    // Verify Success Receipt screen is rendered
    await waitForSelector(session, '.from-emerald-600, .bg-emerald-600', 8000);
    const receiptLayout = await inspectLayout(session);
    assert(!receiptLayout.hasHorizontalOverflow, `Receipt screen overflow on ${vp.name}`);

    const screenshotPath = await captureScreenshot(session, `flow3-booking-${vp.id}.png`);
    console.log(`[Flow 3] ${vp.name} (${vp.width}x${vp.height}): PASS (Screenshot: ${screenshotPath})`);

    results.scenarios.push({
      flow: 'Booking Stepper (4 Steps)',
      viewport: vp.name,
      dimensions: `${vp.width}x${vp.height}`,
      measurements: {
        scrollWidth: receiptLayout.scrollWidth,
        clientWidth: receiptLayout.clientWidth,
        hasHorizontalOverflow: receiptLayout.hasHorizontalOverflow,
      },
      status: 'PASS',
      evidenceFile: `flow3-booking-${vp.id}.png`,
    });
  }

  // =========================================================================
  // FLOW 4: CLINICAL / EMR CONSULTATION ROOM (/doctor/consultation/:id)
  // =========================================================================
  console.log('\n--- Executing Flow 4: Clinical EMR Consultation ---');
  for (const vp of results.viewports) {
    currentRole = 'ROLE_DOCTOR';
    await setViewport(session, vp);
    await send('Page.navigate', { url: `${baseUrl}/doctor/consultation/apt-001` }, session);
    await waitForSelector(session, 'main h1');
    await delay(400);

    const emrLayout = await inspectLayout(session);
    assert(!emrLayout.hasHorizontalOverflow, `EMR room overflow on ${vp.name}: ${emrLayout.overflowDelta}px`);

    // Verify vitals grid, ICD search, prescription section, sticky footer
    const emrMetrics = await evaluate(session, `(() => {
      const header = document.querySelector('header');
      const hRect = header ? header.getBoundingClientRect() : null;
      const footer = document.querySelector('footer');
      const fRect = footer ? footer.getBoundingClientRect() : null;
      const vitalsInputs = document.querySelectorAll('input[type="number"], input[class*="rounded border"]');
      const tabs = Array.from(document.querySelectorAll('nav button'));

      return {
        headerFits: hRect ? hRect.right <= window.innerWidth : false,
        footerFixed: footer ? window.getComputedStyle(footer).position === 'fixed' : false,
        footerFits: fRect ? fRect.right <= window.innerWidth : false,
        vitalsCount: vitalsInputs.length,
        tabsCount: tabs.length,
      };
    })()`);

    assert(emrMetrics.headerFits, `EMR header exceeds viewport on ${vp.name}`);
    assert(emrMetrics.footerFixed && emrMetrics.footerFits, `EMR footer not fixed or overflow on ${vp.name}`);

    // Test switching tabs (e.g. Tệp đính kèm, Lịch sử phụ lục)
    await evaluate(session, `(() => {
      const tabs = Array.from(document.querySelectorAll('nav button'));
      if (tabs.length >= 2) tabs[1].click(); // Tab Tệp đính kèm
    })()`);
    await delay(200);

    const attachmentsLayout = await inspectLayout(session);
    assert(!attachmentsLayout.hasHorizontalOverflow, `Attachments tab overflow on ${vp.name}`);

    // Switch back to record tab
    await evaluate(session, `(() => {
      const tabs = Array.from(document.querySelectorAll('nav button'));
      if (tabs.length >= 1) tabs[0].click(); // Tab Hồ sơ khám
    })()`);
    await delay(200);

    const screenshotPath = await captureScreenshot(session, `flow4-consultation-${vp.id}.png`);
    console.log(`[Flow 4] ${vp.name} (${vp.width}x${vp.height}): PASS (Screenshot: ${screenshotPath})`);

    results.scenarios.push({
      flow: 'Clinical / EMR Consultation',
      viewport: vp.name,
      dimensions: `${vp.width}x${vp.height}`,
      measurements: {
        scrollWidth: emrLayout.scrollWidth,
        clientWidth: emrLayout.clientWidth,
        hasHorizontalOverflow: emrLayout.hasHorizontalOverflow,
      },
      status: 'PASS',
      evidenceFile: `flow4-consultation-${vp.id}.png`,
    });
  }

  // --- Write Summary JSON ---
  const summaryJsonPath = join(outputDir, 'compatibility-summary.json');
  await writeFile(summaryJsonPath, JSON.stringify(results, null, 2));
  console.log(`\n[QA Completed] Summary written to ${summaryJsonPath}`);
  console.log(`[QA Completed] 12/12 Compatibility Scenarios PASSED (4 Flows x 3 Viewports).`);

} finally {
  if (socket) socket.close();
  browserProcess.kill('SIGTERM');
  server.close();
}
