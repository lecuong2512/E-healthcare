// Production Angular bundle, real Chrome, synthetic patient APIs. No gateway calls.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const client = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(client, 'dist/ehealth-web-client/browser');
const output = join(client, 'dist/payment-ui-qa');
const chrome = process.env.CHROME_BIN || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].find(existsSync);
assert(chrome && existsSync(join(dist, 'index.html')), 'Build the client and provide a local Chrome executable.');
await mkdir(output, { recursive: true });
const id = '44444444-4444-4444-8444-444444444444';
const key = '55555555-5555-4555-8555-555555555555';
const doctorId = '11111111-1111-4111-8111-111111111111';
const slotId = '22222222-2222-4222-8222-222222222222';
const pending = { appointmentId: id, provider: 'MOMO', idempotencyKey: key };
let status = { appointmentId: id, appointmentCode: 'APT-QA-01', appointmentStatus: 'PENDING_PAYMENT',
  paymentStatus: 'PENDING', provider: 'MOMO', idempotencyKey: key, transactionStatus: 'PENDING', expiresAt: null, paidAt: null };
status = { ...status, canRetry: true, canSwitchProvider: true, canFallbackToClinic: false };
const doctor = { id: doctorId, fullName: 'Nguyễn Văn An', academicTitle: 'BS.CKI',
  specialty: { id: 'specialty', name: 'Tim mạch' }, consultationFee: 350000,
  bioDescription: null, roomNumber: '101', ratingAverage: 4.9,
  availableSchedules: [{ id: slotId, doctorId, date: '2099-10-10', startTime: '08:00:00', endTime: '08:30:00', status: 'AVAILABLE' }] };
const calls = { initiate: [], confirm: [], cancel: 0 };
let cancelFails = false;
let statusFails = false;
let statusFailureCode = 503;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const json = (body, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  let data = '';
  for await (const chunk of req) data += chunk;
  const body = data ? JSON.parse(data) : {};
  if (url.pathname === '/api/v1/auth/refresh') return json({ accessToken: 'synthetic-patient-token', role: 'ROLE_PATIENT' });
  if (url.pathname === '/api/v1/doctors/search') return json({ data: [doctor], pagination: { page: 1, limit: 100, total: 1, totalPages: 1 } });
  if (url.pathname === `/api/v1/doctors/${doctorId}`) return json(doctor);
  if (url.pathname === '/api/v1/appointments/me/vouchers' || url.pathname === '/api/v1/appointments/me') return json([]);
  if (url.pathname.endsWith('/status')) return statusFails ? json({ message: 'Không thể tải trạng thái. Thử lại.' }, statusFailureCode) : json(status);
  if (url.pathname.endsWith('/fallback-to-clinic')) {
    status = { ...status, provider: 'PAY_AT_CLINIC', appointmentStatus: 'CONFIRMED', paymentStatus: 'UNPAID', canRetry: false, canFallbackToClinic: false };
    return json({ appointmentId: id });
  }
  if (url.pathname.endsWith('/initiate')) {
    calls.initiate.push({ ...body, key: req.headers['idempotency-key'] });
    status = { ...status, provider: body.provider, idempotencyKey: req.headers['idempotency-key'] };
    return json({ transactionId: 'qa-payment', appointmentId: id, provider: body.provider,
      merchantTransactionId: 'PAYQA', paymentUrl: body.provider === 'MOMO' ? 'https://test-payment.momo.vn/pay?qa=1' : 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?qa=1', expiresAt: '2099-01-01T00:00:00Z' }, 201);
  }
  if (url.pathname.endsWith('/cancel-pending')) {
    calls.cancel++;
    await delay(250);
    if (cancelFails) return json({ message: 'Không thể hủy lúc này. Vui lòng thử lại.' }, 503);
    status = { ...status, appointmentStatus: 'CANCELLED', paymentStatus: 'FAILED', transactionStatus: 'SUPERSEDED' };
    return json({ appointmentId: id, appointmentStatus: 'CANCELLED', paymentStatus: 'FAILED' });
  }
  if (url.pathname === '/api/v1/booking/reserve-slot') return json({ success: true, data: { doctorId, slotId,
    reservationId: '33333333-3333-4333-8333-333333333333', expiresAt: '2099-01-01T00:00:00Z', ttlSeconds: 600 } });
  if (url.pathname === '/api/v1/booking/confirm-booking') {
    calls.confirm.push(body);
    status = { ...status, appointmentStatus: 'CONFIRMED', paymentStatus: 'UNPAID', provider: body.paymentMethod, transactionStatus: null };
    return json({ id, appointmentCode: status.appointmentCode, status: 'CONFIRMED', paymentMethod: body.paymentMethod, paymentStatus: 'UNPAID' }, 201);
  }
  if (url.pathname === '/api/v1/booking/release-slot') return json({ success: true });
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io')) return json({}, 404);
  const path = resolve(dist, `.${decodeURIComponent(url.pathname)}`);
  if (!path.startsWith(`${dist}${sep}`) && path !== dist) { res.writeHead(403); return res.end(); }
  try {
    const asset = extname(path) ? path : join(dist, 'index.html');
    res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png' }[extname(asset)] || 'application/octet-stream');
    res.end(await readFile(asset));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(join(tmpdir(), 'ehealth-payment-ui-qa-'));
const browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
try {
  const endpoint = await new Promise((done, reject) => {
    let stderr = '';
    const timeout = setTimeout(() => reject(new Error('Chrome startup timed out')), 15000);
    browser.once('error', reject);
    browser.stderr.on('data', chunk => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timeout); done(match[1]); }
    });
  });
  socket = new WebSocket(endpoint);
  await new Promise((done, reject) => { socket.onopen = done; socket.onerror = reject; });
  let nextId = 0;
  const requests = new Map();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Fetch.requestPaused') {
      // Production API URLs must also stay local after Angular file replacements.
      void (async () => {
        const request = message.params.request;
        const url = new URL(request.url);
        if (url.hostname === 'api.ehealth-portal.vn') {
          const headers = [{ name: 'Content-Type', value: 'application/json' },
            { name: 'Access-Control-Allow-Origin', value: origin },
            { name: 'Access-Control-Allow-Credentials', value: 'true' },
            { name: 'Access-Control-Allow-Methods', value: 'GET, POST, DELETE, OPTIONS' },
            { name: 'Access-Control-Allow-Headers', value: 'authorization, content-type, idempotency-key' }];
          if (request.method === 'OPTIONS') {
            await send('Fetch.fulfillRequest', { requestId: message.params.requestId, responseCode: 204, responseHeaders: headers }, message.sessionId);
            return;
          }
          const localPath = url.pathname.startsWith('/v1') ? `/api${url.pathname}` : url.pathname;
          const response = await fetch(`${origin}${localPath}${url.search}`, {
            method: request.method, headers: request.headers,
            ...(request.postData ? { body: request.postData } : {}),
          });
          await send('Fetch.fulfillRequest', { requestId: message.params.requestId, responseCode: response.status,
            responseHeaders: headers,
            body: Buffer.from(await response.text()).toString('base64') }, message.sessionId);
        } else {
          await send('Fetch.fulfillRequest', { requestId: message.params.requestId, responseCode: 200,
            responseHeaders: [{ name: 'Content-Type', value: 'text/html' }], body: Buffer.from('<p>QA gateway stand-in</p>').toString('base64') }, message.sessionId);
        }
      })();
      return;
    }
    const request = requests.get(message.id);
    if (!request) return;
    requests.delete(message.id); clearTimeout(request.timeout);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  };
  function send(method, params = {}, sessionId) {
    const id = ++nextId;
    return new Promise((resolveRequest, reject) => {
      const timeout = setTimeout(() => { requests.delete(id); reject(new Error(`${method} timed out`)); }, 15000);
      requests.set(id, { resolve: resolveRequest, reject, timeout });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId: page } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, page);
  await send('Network.enable', {}, page);
  await send('Network.setBlockedURLs', { urls: ['wss://api.ehealth-portal.vn/*'] }, page);
  await send('Fetch.enable', { patterns: [{ urlPattern: 'https://sandbox.vnpayment.vn/*' }, { urlPattern: 'https://test-payment.momo.vn/*' }, { urlPattern: 'https://api.ehealth-portal.vn/*' }] }, page);
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `if (location.origin === ${JSON.stringify(origin)} && !sessionStorage.getItem('qaSeeded')) {
    sessionStorage.setItem('qaSeeded', 'true'); sessionStorage.setItem('pendingPaymentContext', ${JSON.stringify(JSON.stringify(pending))}); }` }, page);
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, page);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  async function waitFor(expression) {
    for (let i = 0; i < 100; i++) { if (await evaluate(`document.body && (${expression})`)) return; await delay(100); }
    throw new Error(`Timed out: ${expression}; ${await evaluate('document.body.innerText.slice(-1600)')}`);
  }
  async function navigate(path = '/patient/booking') {
    await send('Page.navigate', { url: `${origin}${path}` }, page);
    await waitFor('!!document.querySelector("app-booking-stepper-page, app-payment-result-page, app-payment-callback-page")');
    await evaluate(`(() => { const button = document.querySelector('app-dev-route-nav button');
      if (button?.textContent.includes('Ẩn Dev Nav')) button.click();
      // Development routing tools are unrelated to the patient payment UI.
      const devNav = document.querySelector('app-dev-route-nav'); if (devNav) devNav.hidden = true; })()`);
  }
  async function click(label, exact = true) {
    const selector = `[...(document.querySelector('.ant-modal') || document).querySelectorAll('button')].find(b => b.textContent.trim()${exact ? ' === ' : '.includes('}${JSON.stringify(label)}${exact ? '' : ')' })`;
    await waitFor(`!!(${selector}) && !(${selector}).disabled`);
    await evaluate(`(${selector}).focus(); (${selector}).click()`);
  }
  async function capture(name) {
    await delay(150);
    const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, page);
    await writeFile(join(output, `${name}.png`), Buffer.from(screenshot.data, 'base64'));
  }
  const report = { browser: await send('Browser.getVersion'), syntheticApis: true, developmentNavigatorHidden: true, checks: [] };
  for (const [width, height] of [[1280, 900], [768, 1024], [375, 812], [812, 375]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 }, page);
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, page);
    await navigate();
    await waitFor('document.body.innerText.includes("APT-QA-01") && document.body.innerText.includes("Bước 1: Chọn bác sĩ")');
    const metrics = await evaluate(`(() => {
      const recovery = document.querySelector('[aria-label="Khôi phục checkout"]');
      const title = recovery.querySelector('.ant-alert-message');
      const description = recovery.querySelector('.ant-alert-description');
      return { width: innerWidth, content: document.documentElement.scrollWidth,
        gap: description.getBoundingClientRect().top - title.getBoundingClientRect().bottom,
        buttons: [...recovery.querySelectorAll('button')].map(b => b.getBoundingClientRect().height),
        context: JSON.parse(sessionStorage.getItem('pendingPaymentContext')) };
    })()`);
    assert(metrics.content <= width, `Horizontal overflow at ${width}px`);
    assert(metrics.gap >= 4, `Banner title/description need separation at ${width}px`);
    assert(metrics.buttons.every(height => height >= 44), 'Recovery controls need 44px targets');
    assert.deepEqual(metrics.context, { appointmentId: id });
    assert.equal(calls.initiate.length, 0);
    await capture(`recovery-${width}`);
    report.checks.push({ scenario: 'passive recovery, responsive banner, ID-only persistence', ...metrics });
  }
  await click('Tiếp tục thanh toán / Đổi phương thức');
  await click('VNPay');
  await click('Thanh toán lịch hẹn hiện tại');
  await waitFor('!!document.querySelector(".ant-modal")');
  await delay(200);
  assert(await evaluate('!!document.activeElement.closest(".ant-modal-wrap")'), 'Modal should contain keyboard focus');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, page);
  await waitFor('!document.querySelector(".ant-modal")');
  assert.equal(calls.initiate.length, 0);
  await click('Thanh toán lịch hẹn hiện tại');
  await waitFor('!!document.querySelector(".ant-modal")');
  await capture('switch-confirmation');
  await click('Xác nhận đổi cổng');
  await waitFor('location.hostname === "sandbox.vnpayment.vn"');
  assert.equal(calls.initiate[0].provider, 'VNPAY');
  assert.equal(calls.initiate[0].supersedeActive, true);
  assert.notEqual(calls.initiate[0].key, key);
  assert.equal(calls.confirm.length, 0);
  await navigate();
  await click('Tiếp tục thanh toán / Đổi phương thức');
  await click('Thanh toán lịch hẹn hiện tại');
  await waitFor('location.hostname === "sandbox.vnpayment.vn"');
  assert.equal(calls.initiate[1].key, calls.initiate[0].key);
  assert.notEqual(calls.initiate[1].supersedeActive, true);
  report.checks.push({ scenario: 'switch confirmation, Escape, fresh switch key and same-key resume', pass: true });
  await navigate();
  cancelFails = true;
  await click('Hủy giao dịch chờ'); await waitFor('!!document.querySelector(".ant-modal")');
  await click('Xác nhận hủy');
  await waitFor('document.body.innerText.includes("Không thể hủy lúc này")');
  assert(await evaluate('!!sessionStorage.getItem("pendingPaymentContext")'));
  cancelFails = false;
  await click('Bắt đầu đặt lịch mới'); await waitFor('!!document.querySelector(".ant-modal")');
  await capture('cancel-confirmation'); await click('Xác nhận hủy');
  await waitFor('!document.querySelector("[aria-label=\\"Khôi phục checkout\\"]")');
  assert.equal(await evaluate('sessionStorage.getItem("pendingPaymentContext")'), null);
  await send('Page.reload', {}, page);
  await waitFor('!!document.querySelector("app-doctor-search-page")');
  assert.equal(await evaluate('location.pathname'), '/patient/doctor-search');
  report.checks.push({ scenario: 'cancellation errors keep context; acknowledged new booking clears it', pass: true });

  status = { ...status, appointmentStatus: 'PENDING_PAYMENT', paymentStatus: 'FAILED', provider: 'VNPAY',
    transactionStatus: 'FAILED', canRetry: true, canSwitchProvider: true, canFallbackToClinic: false };
  await evaluate(`sessionStorage.setItem('pendingPaymentContext', JSON.stringify({appointmentId:${JSON.stringify(id)}}))`);
  await navigate();
  assert(await evaluate('!!sessionStorage.getItem("pendingPaymentContext")'));
  await click('Tiếp tục thanh toán / Đổi phương thức');
  await click('Thanh toán tại viện', false);
  await click('Xác nhận thanh toán tại viện');
  await waitFor('!!document.querySelector(".ant-modal")');
  await click('Xác nhận');
  await waitFor('!!document.querySelector("app-payment-result-page") && document.body.innerText.includes("Lịch khám đã được xác nhận")');
  assert.equal(calls.confirm.length, 0);
  await send('Page.reload', {}, page);
  await waitFor('document.body.innerText.includes("Lịch khám đã được xác nhận") && document.body.innerText.includes("UNPAID")');
  report.checks.push({ scenario: 'FAILED with stale fallback flag allows clinic selection; backend confirms same appointment and survives reload', pass: true });

  status = { ...status, appointmentStatus: 'PENDING_PAYMENT', provider: 'VNPAY', paymentStatus: 'PENDING',
    transactionStatus: 'RECONCILIATION_REQUIRED', canRetry: false, canSwitchProvider: false, canFallbackToClinic: false };
  await evaluate(`sessionStorage.setItem('pendingPaymentContext', JSON.stringify({appointmentId:${JSON.stringify(id)}}))`);
  await navigate(); await click('Tiếp tục thanh toán / Đổi phương thức');
  await waitFor('[...document.querySelectorAll("button")].some(b => b.textContent.trim() === "Thanh toán lịch hẹn hiện tại")');
  assert(await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Thanh toán lịch hẹn hiện tại").disabled'));
  assert.equal(calls.initiate.length, 2);
  report.checks.push({ scenario: 'reconciliation blocks repeat payment', pass: true });
  statusFails = true;
  await navigate();
  await waitFor('document.body.innerText.includes("Không thể tải trạng thái")');
  assert(await evaluate('!!sessionStorage.getItem("pendingPaymentContext")'));
  statusFails = false;
  status = { ...status, appointmentStatus: 'CANCELLED' };
  await navigate();
  await waitFor('!document.querySelector("[aria-label=\\"Khôi phục checkout\\"]")');
  assert.equal(await evaluate('sessionStorage.getItem("pendingPaymentContext")'), null);
  assert.equal(await evaluate('location.pathname'), '/patient/booking');
  report.checks.push({ scenario: 'API failures preserve context; backend-terminal context clears without hijacking navigation', pass: true });
  status = { ...status, appointmentStatus: 'PENDING_PAYMENT', provider: 'MOMO', paymentStatus: 'FAILED',
    transactionStatus: 'FAILED', canRetry: true, canSwitchProvider: true, canFallbackToClinic: true };
  await evaluate(`sessionStorage.setItem('pendingPaymentContext', JSON.stringify({appointmentId:${JSON.stringify(id)}})); sessionStorage.setItem('pendingPaymentAppointmentId', ${JSON.stringify(id)})`);
  await navigate(`/patient/booking/payment-callback?appointmentId=${id}&resultCode=99&orderId=qa-momo`);
  await waitFor('document.body.innerText.includes("Quản lý checkout / Hủy để đặt lịch mới")');
  const cancelsBeforeRecovery = calls.cancel;
  await click('Quản lý checkout / Hủy để đặt lịch mới');
  await waitFor('!!document.querySelector("app-booking-stepper-page") && [...document.querySelectorAll("button")].some(b => b.textContent.trim() === "Thanh toán lịch hẹn hiện tại")');
  assert.equal(calls.cancel, cancelsBeforeRecovery);
  assert(await evaluate('!!sessionStorage.getItem("pendingPaymentContext")'));
  await click('Thanh toán lịch hẹn hiện tại');
  await waitFor('location.hostname === "test-payment.momo.vn"');
  assert.equal(calls.initiate.at(-1).provider, 'MOMO');
  report.checks.push({ scenario: 'MoMo callback delegates recovery without unsafe cancellation; retry redirects to trusted MoMo gateway URL', pass: true });
  statusFails = true;
  for (const code of [403, 404]) {
    statusFailureCode = code;
    await navigate();
    await evaluate(`sessionStorage.setItem('pendingPaymentContext', JSON.stringify({appointmentId:${JSON.stringify(id)}})); sessionStorage.setItem('pendingPaymentAppointmentId', ${JSON.stringify(id)})`);
    await navigate();
    await waitFor('!sessionStorage.getItem("pendingPaymentContext") && document.body.innerText.includes("Bước 1: Chọn bác sĩ")');
    assert.equal(await evaluate('sessionStorage.getItem("pendingPaymentAppointmentId")'), null);
  }
  report.checks.push({ scenario: '403 and 404 discard stale pointers and unlock booking', pass: true });
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`Payment browser QA passed (${report.checks.length} scenarios). Artifacts: ${output}`);
} finally {
  socket?.close(); browser.kill(); await new Promise(done => server.close(done));
}
