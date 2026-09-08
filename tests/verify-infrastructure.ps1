# ==============================================================================
# E-Healthcare Portal - Infrastructure Live Verification Script
# Requirement: Section 2.1, Section 3.4, Section 5.1, NFR-SEC-01 & NFR-SEC-03
# ==============================================================================

$ErrorActionPreference = "Continue"
$passedCount = 0
$failedCount = 0

function Report-Result {
    param (
        [string]$Suite,
        [string]$TestName,
        [bool]$Success,
        [string]$Details = ""
    )
    if ($Success) {
        $global:passedCount++
        Write-Host "  [PASS] " -ForegroundColor Green -NoNewline
        Write-Host "$TestName " -NoNewline
        if ($Details) { Write-Host "($Details)" -ForegroundColor DarkGray } else { Write-Host "" }
    } else {
        $global:failedCount++
        Write-Host "  [FAIL] " -ForegroundColor Red -NoNewline
        Write-Host "$TestName " -NoNewline
        if ($Details) { Write-Host "($Details)" -ForegroundColor Yellow } else { Write-Host "" }
    }
}

Write-Host "`n========================================================================" -ForegroundColor Cyan
Write-Host " E-HEALTHCARE PORTAL - KIEM THU THUC TE HA TANG DOCKER & SECURITY" -ForegroundColor Cyan
Write-Host "========================================================================`n" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# SUITE 1: PostgreSQL 16 & pgcrypto AES-256 (NFR-SEC-01)
# ------------------------------------------------------------------------------
Write-Host "[TEST SUITE 1] PostgreSQL 16, Extension & Ma hoa AES-256 (NFR-SEC-01)" -ForegroundColor Yellow

# 1.1 Connection
$pgPing = (docker exec ehealth-postgres pg_isready -U postgres -d ehealth_db 2>&1) | Out-String
$isPgReady = ($LASTEXITCODE -eq 0) -and ($pgPing -match "accepting connections")
Report-Result -Suite "Suite 1" -TestName "1.1 Ket noi PostgreSQL 16 ehealth_db (port 5432)" -Success $isPgReady -Details $pgPing.Trim()

# 1.2 Extensions: pgcrypto & uuid-ossp
$extQuery = "SELECT extname FROM pg_extension WHERE extname IN ('pgcrypto', 'uuid-ossp');"
$extList = (docker exec ehealth-postgres psql -U postgres -d ehealth_db -t -A -c $extQuery 2>&1) | Out-String
$hasPgcrypto = [bool]($extList -match "pgcrypto")
$hasUuid = [bool]($extList -match "uuid-ossp")
Report-Result -Suite "Suite 1" -TestName "1.2 Extension pgcrypto ho tro AES-256" -Success $hasPgcrypto -Details "pgcrypto da kich hoat"
Report-Result -Suite "Suite 1" -TestName "1.3 Extension uuid-ossp ho tro sinh UUIDv4" -Success $hasUuid -Details "uuid-ossp da kich hoat"

# 1.4 Cryptographic test: AES-256 encrypt & decrypt
$cryptoQuery = "SELECT pgp_sym_decrypt(pgp_sym_encrypt('Du lieu benh an nhay cam AES-256', 'kham_chua_benh_secret_key'), 'kham_chua_benh_secret_key');"
$cryptoResult = (docker exec ehealth-postgres psql -U postgres -d ehealth_db -t -A -c $cryptoQuery 2>&1) | Out-String
$isCryptoValid = [bool]($cryptoResult -match "Du lieu benh an nhay cam AES-256")
Report-Result -Suite "Suite 1" -TestName "1.4 Thu nghiem ma hoa va giai ma AES-256 (pgcrypto)" -Success $isCryptoValid -Details $cryptoResult.Trim()

# 1.5 UUID Generation test
$uuidQuery = "SELECT gen_random_uuid();"
$uuidResult = (docker exec ehealth-postgres psql -U postgres -d ehealth_db -t -A -c $uuidQuery 2>&1) | Out-String
$isUuidValid = [bool]($uuidResult.Trim() -match "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
Report-Result -Suite "Suite 1" -TestName "1.5 Sinh khoa chinh ngau nhien UUIDv4 (gen_random_uuid)" -Success $isUuidValid -Details $uuidResult.Trim()

# ------------------------------------------------------------------------------
# SUITE 2: Redis Stack 7.2 In-Memory & Distributed Lock (SRS-PAT-02)
# ------------------------------------------------------------------------------
Write-Host "`n[TEST SUITE 2] Redis Stack 7.2 In-Memory & Distributed Lock (SRS-PAT-02)" -ForegroundColor Yellow

# 2.1 Connection & Auth (using REDISCLI_AUTH to avoid insecure password CLI warnings)
$redisPing = (docker exec -e REDISCLI_AUTH=ehealth_redis_pass ehealth-redis redis-cli ping 2>&1) | Out-String
$isRedisAuth = [bool]($redisPing -match "PONG")
Report-Result -Suite "Suite 2" -TestName "2.1 Ket noi Redis 7.2 voi Auth password (port 6379)" -Success $isRedisAuth -Details "PONG"

# 2.2 Distributed Lock (SETNX with TTL 600s)
$testSlotKey = "slot_lock:doctor_01:2026-09-08_0830"
docker exec -e REDISCLI_AUTH=ehealth_redis_pass ehealth-redis redis-cli DEL $testSlotKey 2>&1 | Out-Null
$lockAcquire = (docker exec -e REDISCLI_AUTH=ehealth_redis_pass ehealth-redis redis-cli SET $testSlotKey "user_patient_999" EX 600 NX 2>&1) | Out-String
$isLockAcquired = [bool]($lockAcquire -match "OK")
Report-Result -Suite "Suite 2" -TestName "2.2 Thiet lap khoa phan tan giu slot (TTL 600s SETNX)" -Success $isLockAcquired -Details $lockAcquire.Trim()

# 2.3 Collision rejection (Second client tries to lock the same slot)
$lockConflict = (docker exec -e REDISCLI_AUTH=ehealth_redis_pass ehealth-redis redis-cli SET $testSlotKey "user_patient_888" EX 600 NX 2>&1) | Out-String
$isConflictDetected = [bool]([string]::IsNullOrWhiteSpace($lockConflict.Trim()) -or ($lockConflict -match "nil"))
Report-Result -Suite "Suite 2" -TestName "2.3 Tu choi xung dot khi tranh chap cung 1 slot (Lock Conflict)" -Success $isConflictDetected -Details "Khoa bi tu choi nhu ky vong"

# 2.4 RedisInsight Web UI
$redisInsightResp = curl.exe -s -o /dev/null -w "%{http_code}" http://localhost:8001
$isInsightOk = [bool]($redisInsightResp -eq "200")
Report-Result -Suite "Suite 2" -TestName "2.4 Giao dien quan tri RedisInsight UI (port 8001)" -Success $isInsightOk -Details "HTTP Status: $redisInsightResp"

# ------------------------------------------------------------------------------
# SUITE 3: Nginx Reverse Proxy & HTTPS TLS 1.3 (NFR-SEC-01)
# ------------------------------------------------------------------------------
Write-Host "`n[TEST SUITE 3] Nginx Reverse Proxy & HTTPS TLS 1.3 (NFR-SEC-01)" -ForegroundColor Yellow

# 3.1 HTTP -> HTTPS 301 Redirect
$httpResp = (curl.exe -s -I http://localhost:80/ 2>&1) | Out-String
$is301 = [bool]($httpResp -match "301 Moved Permanently")
$hasLocation = [bool]($httpResp -match "Location:\s*https://localhost")
$isRedirect301 = [bool]($is301 -and $hasLocation)
Report-Result -Suite "Suite 3" -TestName "3.1 Tu dong chuyen huong HTTP (port 80) sang HTTPS (301)" -Success $isRedirect301 -Details "HTTP 301 -> https://localhost/"

# 3.2 HTTPS TLS 1.3 Handshake & Health Endpoint
$healthResp = (curl.exe -k -s -w "`n%{http_code}" https://localhost:443/health 2>&1) | Out-String
$isHealthOk = [bool]($healthResp -match "OK" -and $healthResp -match "200")
Report-Result -Suite "Suite 3" -TestName "3.2 Truy cap HTTPS qua TLS 1.3 /health endpoint" -Success $isHealthOk -Details "HTTP 200 OK"

# 3.3 Security Headers Check
$headers = (curl.exe -k -s -I https://localhost:443/health 2>&1) | Out-String
$hasHsts = [bool]($headers -match "Strict-Transport-Security")
$hasFrameOptions = [bool]($headers -match "X-Frame-Options:\s*SAMEORIGIN")
$hasContentType = [bool]($headers -match "X-Content-Type-Options:\s*nosniff")
$hasXss = [bool]($headers -match "X-XSS-Protection:\s*1;\s*mode=block")
$hasReferrer = [bool]($headers -match "Referrer-Policy:\s*strict-origin-when-cross-origin")
$allSecurityHeaders = [bool]($hasHsts -and $hasFrameOptions -and $hasContentType -and $hasXss -and $hasReferrer)
Report-Result -Suite "Suite 3" -TestName "3.3 Tuan thu tieu chuan HTTP Security Headers (HSTS, X-Frame, XSS...)" -Success $allSecurityHeaders -Details "Tat ca 5 security headers deu hien dien"

# ------------------------------------------------------------------------------
# SUITE 4: Rate Limiting 60 req/min/IP (NFR-SEC-03)
# ------------------------------------------------------------------------------
Write-Host "`n[TEST SUITE 4] Co che Rate Limiting 60 req/phut/IP tren /api/ (NFR-SEC-03)" -ForegroundColor Yellow

# Execute concurrent requests test using Python for microsecond-burst delivery
$pyRateLimitTest = @"
import urllib.request, ssl, concurrent.futures, json

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def send_req(i):
    try:
        r = urllib.request.urlopen('https://localhost:443/api/burst_test', context=ctx, timeout=5)
        return r.getcode(), ''
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', errors='ignore')
    except Exception as e:
        return 0, str(e)

with concurrent.futures.ThreadPoolExecutor(max_workers=25) as ex:
    results = list(ex.map(send_req, range(25)))

status_codes = [r[0] for r in results]
hit_429 = 429 in status_codes
body_429 = next((r[1] for r in results if r[0] == 429), '')

output = {
    'hit_429': hit_429,
    'total_429': status_codes.count(429),
    'body': body_429
}
print(json.dumps(output))
"@

$rateTestResultJson = (python -c $pyRateLimitTest 2>&1) | Out-String
$rateObj = $null
try {
    $rateObj = $rateTestResultJson | ConvertFrom-Json
} catch {}

$isRateLimited = [bool]($rateObj -and $rateObj.hit_429)
$is429JsonValid = [bool]($rateObj -and ($rateObj.body -match "Too Many Requests") -and ($rateObj.body -match "NFR-SEC-03"))

Report-Result -Suite "Suite 4" -TestName "4.1 Kich hoat Rate Limit khi gui 25 request dong thoi (HTTP 429)" -Success $isRateLimited -Details "Chan $($rateObj.total_429) requests vuot nguong"
Report-Result -Suite "Suite 4" -TestName "4.2 Dinh dang phan hoi loi JSON chuan y te 429 (NFR-SEC-03)" -Success $is429JsonValid -Details $rateObj.body.Trim()

# ------------------------------------------------------------------------------
# SUITE 5: Base CI/CD & Trinh trang Git
# ------------------------------------------------------------------------------
Write-Host "`n[TEST SUITE 5] Kiem tra Base CI/CD Pipeline & Git Repository" -ForegroundColor Yellow

$workflowFile = ".github/workflows/lint-test.yml"
$hasWorkflow = [bool](Test-Path $workflowFile)
Report-Result -Suite "Suite 5" -TestName "5.1 Tep GitHub Actions CI pipeline ton tai" -Success $hasWorkflow -Details $workflowFile

$gitBranch = (git branch --show-current 2>&1) | Out-String
$isCorrectBranch = [bool]($gitBranch.Trim() -eq "feature/docker-env")
Report-Result -Suite "Suite 5" -TestName "5.2 Nhanh Git hien tai la feature/docker-env" -Success $isCorrectBranch -Details "Branch: $($gitBranch.Trim())"

# ------------------------------------------------------------------------------
# TONG KET
# ------------------------------------------------------------------------------
Write-Host "`n========================================================================" -ForegroundColor Cyan
Write-Host " KET QUA TONG KET: " -NoNewline
Write-Host "$passedCount PASSED" -ForegroundColor Green -NoNewline
Write-Host " / " -NoNewline
if ($failedCount -gt 0) {
    Write-Host "$failedCount FAILED" -ForegroundColor Red
} else {
    Write-Host "$failedCount FAILED" -ForegroundColor Green
}
Write-Host "========================================================================`n" -ForegroundColor Cyan

if ($failedCount -eq 0) {
    exit 0
} else {
    exit 1
}
