// Run after npm run build:client. Node 22+ and local Chrome/Chromium are required.
// Uses synthetic API responses only; never connects to the real backend or printers.
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
const output = join(client, 'dist/print-qa');
const chromePath = process.env.CHROME_BIN || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].find(existsSync);
assert(chromePath, 'Set CHROME_BIN to a local Chrome/Chromium executable.');
assert(existsSync(join(dist, 'index.html')), 'Run npm run build:client first.');
await mkdir(output, { recursive: true });

let appointment;
let clinic;
let receipt;
let scenario;
let calls;
function reset({ long = false, unpaid = false, fail = false } = {}) {
  scenario = { long, unpaid, fail };
  calls = { checkIn: 0, payment: 0, reprint: 0, lookup: 0 };
  appointment = {
    id: '11111111-1111-4111-8111-111111111111', appointmentCode: 'APT-260923-0001',
    status: 'CONFIRMED', patientId: 'qa-patient', patientName: long ? 'Nguyễn Thị Ánh '.repeat(8).trim() : 'Nguyễn Thị Ánh',
    patientPhone: null, doctorId: 'qa-doctor', doctorName: 'Trần Minh',
    specialtyName: long ? 'Nội tổng quát và phục hồi chức năng '.repeat(4).trim() : 'Nội tổng quát',
    roomNumber: long ? 'PHONG-KHAM-'.repeat(6) : 'P101', date: '2026-09-23', startTime: '09:00:00', endTime: '09:30:00',
    paymentStatus: unpaid ? 'UNPAID' : 'PAID', paymentMethod: 'PAY_AT_CLINIC', totalAmount: long ? 999999999999 : 150000,
    queueNumber: null, checkedInAt: null, requiresPayment: unpaid, canCheckIn: !unpaid,
    blockedReason: unpaid ? 'Cần thanh toán trước khi check-in.' : null,
  };
  clinic = { clinicName: 'PHÒNG KHÁM KIỂM THỬ', address: 'Địa chỉ giả lập phục vụ kiểm tra bản in',
    phone: '02800000000', taxCode: 'TEST-TAX', licenseNumber: 'TEST-LICENSE',
    ...(long ? { logoUrl: '/missing-qa-logo.png' } : {}),
  };
  receipt = { receiptCode: 'REC-QA-0001', transactionCode: 'TXN-QA-0001', appointmentCode: appointment.appointmentCode,
    patientName: appointment.patientName, doctorName: appointment.doctorName, amount: appointment.totalAmount,
    amountTendered: appointment.totalAmount + 50000, changeAmount: 50000,
    paymentMethod: 'CASH', collectedBy: 'Lễ tân kiểm thử', paidAt: '2026-09-23T01:40:00.000Z',
  };
}
reset();
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const json = (body, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (url.pathname === '/api/v1/auth/refresh') return json({ accessToken: 'synthetic-qa-token', role: 'ROLE_RECEPTIONIST' });
  if (url.pathname === '/api/v1/reception/clinic-profile') return json(clinic);
  if (url.pathname === '/api/v1/reception/appointments/lookup') { calls.lookup++; return json([appointment]); }
  if (url.pathname.endsWith('/collect-payment')) {
    calls.payment++;
    appointment = { ...appointment, paymentStatus: 'PAID', requiresPayment: false, canCheckIn: true, blockedReason: null };
    return json(receipt, 201);
  }
  if (url.pathname.endsWith('/check-in')) {
    calls.checkIn++;
    if (scenario.fail) return json({ message: 'Lịch hẹn không hợp lệ để check-in.' }, 409);
    appointment = { ...appointment, status: 'CHECKED_IN', canCheckIn: false,
      queueNumber: scenario.long ? 1000 : 99, checkedInAt: '2026-09-23T01:45:00.000Z' };
    return json({ ...appointment, appointmentId: appointment.id, queueDate: appointment.date, queueSource: 'APPOINTMENT' }, 201);
  }
  if (url.pathname.endsWith('/receipt')) { calls.reprint++; return json(receipt); }
  if (url.pathname === '/preview.html') { res.setHeader('Content-Type', 'text/html'); return res.end('<!doctype html><html><head></head><body></body></html>'); }
  if (url.pathname.startsWith('/api/') || url.pathname === '/missing-qa-logo.png') { res.writeHead(404); return res.end(); }
  const path = resolve(dist, `.${decodeURIComponent(url.pathname)}`);
  if (!path.startsWith(`${dist}${sep}`) && path !== dist) { res.writeHead(403); return res.end(); }
  try {
    const asset = extname(path) ? path : join(dist, 'index.html');
    const content = await readFile(asset);
    res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' }[extname(asset)] || 'application/octet-stream');
    res.end(content);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(join(tmpdir(), 'ehealth-print-qa-'));
const browser = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
try {
  const websocketUrl = await new Promise((done, reject) => {
    let stderr = '';
    const timeout = setTimeout(() => reject(new Error('Chrome startup timed out.')), 15000);
    browser.once('error', (error) => { clearTimeout(timeout); reject(error); });
    browser.stderr.on('data', (chunk) => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timeout); done(match[1]); }
    });
  });
  socket = new WebSocket(websocketUrl);
  await new Promise((done, reject) => { socket.onopen = done; socket.onerror = reject; });
  let nextId = 0;
  const pending = new Map();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id); clearTimeout(request.timeout);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  };
  function send(method, params = {}, sessionId) {
    const id = ++nextId;
    return new Promise((resolveRequest, reject) => {
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 20000);
      pending.set(id, { resolve: resolveRequest, reject, timeout });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  async function newPage() {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Page.enable', {}, sessionId);
    return sessionId;
  }
  async function evaluate(session, expression) {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, session);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  async function waitFor(session, expression) {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate(session, expression)) return;
      await delay(100);
    }
    const state = await evaluate(session, `({ url: location.href, text: document.body.innerText.slice(0, 1200), tail:document.body.innerText.slice(-600), frames:document.querySelectorAll('iframe').length, prints:window.__prints?.length })`);
    throw new Error(`Timed out waiting for: ${expression}; state=${JSON.stringify(state)}; calls=${JSON.stringify(calls)}`);
  }
  const app = await newPage();
  const preview = await newPage();
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__prints = [];
    new MutationObserver(() => {
      document.querySelectorAll('iframe').forEach(frame => {
        if (frame.dataset.qaHooked) return;
        frame.dataset.qaHooked = 'true';
        frame.contentWindow.print = () => window.__prints.push(frame.contentDocument.documentElement.outerHTML);
      });
    }).observe(document, { childList: true, subtree: true });
  ` }, app);
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false }, app);
  async function lookup() {
    await send('Page.navigate', { url: `${origin}/receptionist/checkin` }, app);
    await waitFor(app, `!!document.querySelector('#manual-query')`);
    await delay(500);
    await evaluate(app, `(() => {
      const input = document.querySelector('#manual-query');
      input.value = 'APT-260923-0001'; input.dispatchEvent(new Event('input', {bubbles:true}));
    })()`);
    await click('Tra cứu');
    await waitFor(app, `!!document.querySelector('#appointment-title') && document.body.textContent.includes('APT-260923-0001')`);
  }
  async function click(label) {
    const expression = `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(label)})`;
    await waitFor(app, `!!(${expression}) && !(${expression}).disabled`);
    await evaluate(app, `(${expression}).click()`);
  }
  const report = { browser: await send('Browser.getVersion'), generatedAt: new Date().toISOString(), documents: [], scenarios: [] };
  async function capture(name, index, paper) {
    await waitFor(app, `window.__prints.length > ${index}`);
    const html = await evaluate(app, `window.__prints[${index}]`);
    assert(!html.includes('synthetic-qa-token'), 'Authentication token must not appear in receipt');
    await send('Page.navigate', { url: `${origin}/preview.html` }, preview);
    await waitFor(preview, `location.pathname === '/preview.html' && document.readyState === 'complete'`);
    await evaluate(preview, `document.open();document.write(${JSON.stringify(html)});document.close();`);
    await waitFor(preview, `document.readyState === 'complete' && !!document.querySelector('article')`);
    const loadedFonts = await evaluate(preview, `(async () => {
      await Promise.all([...document.querySelectorAll('link[rel="stylesheet"]')].map(link =>
        link.sheet ? Promise.resolve() : new Promise((resolve, reject) => {
          link.addEventListener('load', resolve, { once:true });
          link.addEventListener('error', () => reject(new Error('Stylesheet failed')), { once:true });
        })
      ));
      const sample = 'Tiếng Việt: Nguyễn Thị Ánh — Số thứ tự khám';
      const faces = (await Promise.all([
        document.fonts.load('400 11px "Noto Sans"', sample),
        document.fonts.load('700 11px "Noto Sans"', sample),
      ])).flat();
      await document.fonts.ready;
      return faces.map(face => ({ family: face.family, status: face.status }));
    })()`);
    assert(loadedFonts.length >= 4 && loadedFonts.every((font) => font.status === 'loaded'),
      `${name}: self-hosted Vietnamese font did not load: ${JSON.stringify(loadedFonts)}`);
    const layout = await evaluate(preview, `(() => {
      const article = document.querySelector('article'); const box = article.getBoundingClientRect();
      return {width:box.width, height:box.height, scrollWidth:article.scrollWidth,
        controls:article.querySelectorAll('button,input,select').length,
        font:getComputedStyle(article).fontFamily,
        text:article.innerText, qr:!!article.querySelector('svg path')};
    })()`);
    assert(layout.scrollWidth <= Math.ceil(layout.width), `${name}: horizontal overflow`);
    assert.equal(layout.controls, 0);
    assert(layout.text.includes('Nguyễn Thị Ánh'));
    assert(Math.abs(layout.width * 25.4 / 96 - (paper === 'k80' ? 72 : 124)) < 0.2,
      `${name}: expected ${paper}, got ${layout.width * 25.4 / 96} mm; ${layout.text.slice(0, 160)}`);
    if (paper === 'k80') { assert(layout.qr); assert(layout.text.includes('15 phút')); }
    else { assert(layout.text.includes('REC-QA-0001')); assert(layout.text.includes('Người thu tiền')); }
    const pdf = await send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false }, preview);
    const bytes = Buffer.from(pdf.data, 'base64');
    const raw = bytes.toString('latin1');
    assert(raw.includes('NotoSans'), `${name}: PDF did not embed Noto Sans`);
    const pages = [...raw.matchAll(/\/Type\s*\/Page\b/g)].length;
    const mediaBox = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(raw);
    assert(mediaBox, `${name}: missing PDF MediaBox`);
    const dimensionsMm = mediaBox.slice(1).map((n) => Math.round(Number(n) * 25.4 / 72 * 100) / 100);
    assert.equal(pages, 1, `${name}: unexpected extra/blank pages`);
    assert(Math.abs(dimensionsMm[0] - (paper === 'k80' ? 80 : 148)) < 0.5);
    if (paper === 'a5') assert(Math.abs(dimensionsMm[1] - 210) < 0.5);
    await writeFile(join(output, `${name}.pdf`), bytes);
    await send('Emulation.setDeviceMetricsOverride', { width: Math.ceil(layout.width) + 40,
      height: Math.ceil(layout.height) + 40, deviceScaleFactor: 2, mobile: false }, preview);
    const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, preview);
    await writeFile(join(output, `${name}.png`), Buffer.from(screenshot.data, 'base64'));
    report.documents.push({ name, pages, dimensionsMm, loadedFonts, layout });
    console.log(`${name}: ${pages} page, ${dimensionsMm.join(' x ')} mm, no horizontal overflow`);
  }
  await lookup();
  await click('Xác nhận check-in');
  await capture('k80', 0, 'k80');
  await evaluate(app, `document.querySelector('iframe').contentWindow.dispatchEvent(new Event('afterprint'))`);
  await click('In lại phiếu khám K80');
  await waitFor(app, 'window.__prints.length === 2');
  assert.equal(calls.checkIn, 1);
  report.scenarios.push('Check-in, return/cancel print, reprint without repeated POST: passed');

  for (const long of [false, true]) {
    reset({ long, unpaid: true });
    await lookup();
    await evaluate(app, `(() => { const input=document.querySelector('input[type="number"]');
      input.value=${JSON.stringify(String(receipt.amountTendered))}; input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await click('Xác nhận đã thu tiền');
    await capture(long ? 'a5-long' : 'a5', 0, 'a5');
    await click('Xác nhận check-in');
    await capture(long ? 'k80-long' : 'k80-after-payment', 1, 'k80');
    await click('In lại phiếu thu A5');
    await waitFor(app, 'window.__prints.length === 3');
    assert.deepEqual(calls, { checkIn: 1, payment: 1, reprint: 1, lookup: 2 });
    report.scenarios.push(`Payment -> A5 -> check-in -> K80 -> GET receipt reprint (${long ? 'long text, large amount, missing logo' : 'normal'}): passed`);
  }
  reset({ fail: true });
  await lookup(); await click('Xác nhận check-in');
  await waitFor(app, `document.querySelector('[role="alert"]')?.textContent.includes('không hợp lệ')`);
  assert.equal(await evaluate(app, 'window.__prints.length'), 0);
  report.scenarios.push('Failed check-in: no print: passed');
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`QA passed. Artifacts: ${output}`);
  await send('Browser.close');
} finally {
  socket?.close();
  browser.kill();
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}
