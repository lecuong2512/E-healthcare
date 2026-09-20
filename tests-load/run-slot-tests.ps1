[CmdletBinding()]
param(
  [ValidateSet('Run', 'Seed', 'Verify', 'Cleanup')]
  [string]$Action = 'Run',

  [ValidateSet('smoke', 'contention', 'microburst', 'idempotency', 'ttl', 'release', 'confirm', 'throughput', 'ccu', 'all')]
  [string]$Profile = 'contention',

  [ValidateSet('local', 'test', 'testing', 'qa', 'staging', 'performance')]
  [string]$Environment = 'local',

  [string]$RunId,
  [string]$BaseUrl = 'http://host.docker.internal:3000',
  [string[]]$AllowedApiHost = @(),
  [string]$EvidenceRoot,
  [string]$K6Script,
  [string]$K6Image = 'grafana/k6:0.50.0',

  [ValidateRange(2, 10000)]
  [int]$ContenderCount = 100,

  [ValidateRange(0, 10000)]
  [int]$SlotCount = 0,

  [ValidateRange(1, 65535)]
  [int]$PostgresPort = 55432,

  [ValidateRange(1, 65535)]
  [int]$RedisPort = 56379,

  [ValidateRange(1, 65535)]
  [int]$RedisInsightPort = 58001,

  [string]$PostgresUser,
  [string]$PostgresDatabase,
  [string]$PostgresPassword,
  [string]$RedisPassword,

  [switch]$SkipInfrastructureStart,
  [switch]$SkipMigrations,
  [switch]$SkipApiPreflight,
  [switch]$KeepFixture,
  [switch]$DryRun
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$script:TestsLoadRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$script:RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$script:FixtureRoot = Join-Path $PSScriptRoot 'fixtures'
$script:EvidenceDirectory = $null
$script:ExecutionLog = $null
$script:ComposePrefix = @(
  'compose',
  '--project-name', 'ehealth-card26',
  '--project-directory', $script:RepoRoot,
  '-f', (Join-Path $PSScriptRoot 'docker-compose.slot-test.yml')
)

function Get-DefaultValue {
  param([string]$Value, [string]$EnvironmentName, [string]$Fallback)

  if (-not [string]::IsNullOrWhiteSpace($Value)) {
    return $Value
  }

  $environmentValue = [Environment]::GetEnvironmentVariable($EnvironmentName)
  if (-not [string]::IsNullOrWhiteSpace($environmentValue)) {
    return $environmentValue
  }

  return $Fallback
}

function Write-RunLog {
  param([string]$Message, [ValidateSet('INFO', 'WARN', 'ERROR')][string]$Level = 'INFO')

  $line = '{0} [{1}] {2}' -f (Get-Date).ToUniversalTime().ToString('o'), $Level, $Message
  Write-Host $line
  if ($script:ExecutionLog) {
    for ($attempt = 1; $attempt -le 3; $attempt++) {
      try {
        Add-Content -LiteralPath $script:ExecutionLog -Value $line -Encoding UTF8
        break
      }
      catch {
        if ($attempt -eq 3) {
          # A transient antivirus/indexer lock must not turn a successful test
          # into a false orchestration failure. The same line remains visible
          # on stdout and the warning documents the evidence limitation.
          Write-Warning "Could not append to orchestrator.log after 3 attempts: $($_.Exception.Message)"
        }
        else {
          Start-Sleep -Milliseconds 100
        }
      }
    }
  }
}

function Assert-CommandAvailable {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found on PATH."
  }
}

function Invoke-NativeCommand {
  param(
    [Parameter(Mandatory = $true)][string]$Executable,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [AllowNull()][string]$StandardInput,
    [string]$OutputFile,
    [switch]$AllowFailure
  )

  # Windows PowerShell can promote a native process' stderr to a terminating
  # NativeCommandError when the script-level preference is Stop. Capture both
  # streams first and decide failure exclusively from the native exit code.
  $previousErrorPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    if ($PSBoundParameters.ContainsKey('StandardInput')) {
      $nativeOutput = $StandardInput | & $Executable @Arguments 2>&1
    }
    else {
      $nativeOutput = & $Executable @Arguments 2>&1
    }
    $exitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousErrorPreference
  }
  $textOutput = ($nativeOutput | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine

  if ($OutputFile) {
    Set-Content -LiteralPath $OutputFile -Value $textOutput -Encoding UTF8
  }

  if ($exitCode -ne 0 -and -not $AllowFailure) {
    $safeMessage = if ([string]::IsNullOrWhiteSpace($textOutput)) {
      "No process output was captured."
    }
    else {
      $textOutput
    }
    throw "Command '$Executable' failed with exit code $exitCode. $safeMessage"
  }

  return [PSCustomObject]@{
    ExitCode = $exitCode
    Output = $textOutput.Trim()
  }
}

function Invoke-ComposeCommand {
  param(
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [string]$OutputFile,
    [switch]$AllowFailure
  )

  $allArguments = @($script:ComposePrefix) + $Arguments
  return Invoke-NativeCommand -Executable 'docker' -Arguments $allArguments `
    -OutputFile $OutputFile -AllowFailure:$AllowFailure
}

function Invoke-FixtureSql {
  param(
    [Parameter(Mandatory = $true)][string]$SqlFile,
    [Parameter(Mandatory = $true)][hashtable]$Variables
  )

  $arguments = @('exec', '-T', 'postgres', 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1')
  foreach ($entry in ($Variables.GetEnumerator() | Sort-Object Key)) {
    $arguments += @('-v', ('{0}={1}' -f $entry.Key, $entry.Value))
  }
  $arguments += @('-U', $PostgresUser, '-d', $PostgresDatabase)

  $sql = Get-Content -LiteralPath $SqlFile -Raw
  $result = Invoke-NativeCommand -Executable 'docker' `
    -Arguments (@($script:ComposePrefix) + $arguments) -StandardInput $sql

  $jsonLine = @($result.Output -split "`r?`n" | Where-Object { $_.Trim().StartsWith('{') }) |
    Select-Object -Last 1
  if (-not $jsonLine) {
    throw "SQL fixture did not return the expected JSON document: $SqlFile"
  }

  try {
    return $jsonLine | ConvertFrom-Json
  }
  catch {
    throw "SQL fixture returned invalid JSON from '$SqlFile': $jsonLine"
  }
}

function Invoke-RedisCommand {
  param(
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [switch]$AllowFailure
  )

  $composeArguments = @('exec', '-T')
  if (-not [string]::IsNullOrWhiteSpace($RedisPassword)) {
    # REDISCLI_AUTH avoids printing an authentication warning or putting the
    # password into evidence files. The orchestrator never logs process args.
    $composeArguments += @('-e', "REDISCLI_AUTH=$RedisPassword")
  }
  $composeArguments += @('redis', 'redis-cli', '--raw')
  $composeArguments += $Arguments

  return Invoke-ComposeCommand -Arguments $composeArguments -AllowFailure:$AllowFailure
}

function Assert-SafeTarget {
  $target = $null
  try {
    $target = [Uri]$BaseUrl
  }
  catch {
    throw 'BaseUrl must be an absolute HTTP(S) URL.'
  }

  if (-not $target.IsAbsoluteUri -or @('http', 'https') -notcontains $target.Scheme) {
    throw 'BaseUrl must be an absolute HTTP(S) URL.'
  }

  $hostname = $target.DnsSafeHost.ToLowerInvariant()
  if ($hostname -match '(^|[.-])prod(uction)?([.-]|$)') {
    throw "Refusing to run a load test against production-like host '$hostname'."
  }

  $allowedHosts = @('localhost', '127.0.0.1', '::1', 'host.docker.internal') +
    @($AllowedApiHost | ForEach-Object { $_.Trim().ToLowerInvariant() } | Where-Object { $_ })
  if ($allowedHosts -notcontains $hostname) {
    throw "Host '$hostname' is not allowlisted. Pass its exact non-production name via -AllowedApiHost."
  }
}

function Get-EffectiveSlotCount {
  if ($SlotCount -gt 0) {
    return $SlotCount
  }

  switch ($Profile) {
    'throughput' { return 6500 }
    'ccu' { return 1000 }
    'all' { return 7000 }
    default { return 100 }
  }
}

function Get-HostPreflightUrl {
  $hostUrl = $BaseUrl.TrimEnd('/')
  return $hostUrl -replace 'host\.docker\.internal', '127.0.0.1'
}

function Wait-InfrastructureHealthy {
  Write-RunLog 'Waiting for PostgreSQL and Redis health checks.'
  for ($attempt = 1; $attempt -le 30; $attempt++) {
    $postgres = Invoke-ComposeCommand -Arguments @(
      'exec', '-T', 'postgres', 'pg_isready', '-U', $PostgresUser, '-d', $PostgresDatabase
    ) -AllowFailure
    $redis = Invoke-RedisCommand -Arguments @('PING') -AllowFailure
    if ($postgres.ExitCode -eq 0 -and $redis.ExitCode -eq 0 -and $redis.Output -eq 'PONG') {
      Write-RunLog 'PostgreSQL and Redis are healthy.'
      return
    }
    Start-Sleep -Seconds 2
  }

  throw 'PostgreSQL or Redis did not become healthy within 60 seconds.'
}

function Assert-ApiReady {
  param([Parameter(Mandatory = $true)]$Fixture)

  # Prove that the API trusts the local load-generator proxy headers. Without
  # this, the application-wide 60 req/min/IP throttle would measure the Docker
  # gateway instead of the synthetic clients and invalidate 100 TPS evidence.
  $throttleProbeUrl = '{0}/api/v1/appointments/slot-lock/{1}/{2}' -f `
    (Get-HostPreflightUrl), $Fixture.doctorId, $Fixture.slotId
  $successfulThrottleProbes = 0
  for ($probe = 1; $probe -le 61; $probe++) {
    try {
      $probeResponse = Invoke-WebRequest -UseBasicParsing -Method Get `
        -Uri $throttleProbeUrl -TimeoutSec 10 `
        -Headers @{ 'X-Forwarded-For' = "198.19.0.$probe" }
      if ([int]$probeResponse.StatusCode -ne 200) {
        throw "unexpected HTTP $([int]$probeResponse.StatusCode)"
      }
      $successfulThrottleProbes++
    }
    catch {
      throw "Forwarded-client-IP preflight failed at request $probe of 61. Ensure the API trusts the local proxy CIDR. $($_.Exception.Message)"
    }
  }
  Save-JsonDocument -Value ([ordered]@{
      attempted = 61
      succeeded = $successfulThrottleProbes
      expectedStatus = 200
      purpose = 'Prove X-Forwarded-For isolation from the global 60 requests/minute/IP throttle.'
    }) -Path (Join-Path $script:EvidenceDirectory 'forwarded-client-ip-canary.json')

  # Redis canary: write the exact lock key through the test Redis connection,
  # then require the API to observe the same holder. This prevents a green run
  # when the API accidentally points at a different Redis instance.
  $setResult = Invoke-RedisCommand -Arguments @(
    'SET', [string]$Fixture.lockKey, [string]$Fixture.patientId, 'EX', '600', 'NX'
  )
  if ($setResult.Output -ne 'OK') {
    throw 'API topology preflight could not create the Redis canary lock.'
  }

  $url = $throttleProbeUrl
  try {
    $response = Invoke-RestMethod -Method Get -Uri $url -TimeoutSec 10
  }
  catch {
    throw "API preflight failed at '$url'. Start the API with the same database/Redis ports before running k6. $($_.Exception.Message)"
  }

  if ($null -eq $response -or $null -eq $response.isLocked) {
    throw 'API preflight returned an unexpected slot-lock response contract.'
  }
  if (-not [bool]$response.isLocked -or
      [string]$response.holder -ne [string]$Fixture.patientId) {
    throw 'API topology preflight detected that the API is not using the fixture Redis instance.'
  }

  # Database canary: confirmation must see the seeded doctor, patient, and slot
  # through the API's own database connection. The fixture is reset immediately
  # afterwards so the measured profiles always begin from a pristine state.
  $confirmUrl = '{0}/api/v1/appointments/confirm-booking' -f (Get-HostPreflightUrl)
  $confirmPayload = [ordered]@{
    patientId = [string]$Fixture.patientId
    doctorId = [string]$Fixture.doctorId
    slotId = [string]$Fixture.slotId
    reasonForVisit = "Card 2.6 topology canary - $RunId"
    paymentMethod = 'PAY_AT_CLINIC'
  }
  try {
    $confirmation = Invoke-RestMethod -Method Post -Uri $confirmUrl -TimeoutSec 15 `
      -ContentType 'application/json' -Body ($confirmPayload | ConvertTo-Json -Compress)
  }
  catch {
    throw "API database topology preflight failed at '$confirmUrl'. $($_.Exception.Message)"
  }
  if ($null -eq $confirmation -or
      [string]$confirmation.patientId -ne [string]$Fixture.patientId -or
      [string]$confirmation.doctorId -ne [string]$Fixture.doctorId -or
      [string]$confirmation.scheduleId -ne [string]$Fixture.slotId -or
      [string]$confirmation.status -ne 'CONFIRMED') {
    throw 'API database topology preflight returned an unexpected confirmation contract.'
  }

  $canaryVerification = Invoke-FixtureSql `
    -SqlFile (Join-Path $script:FixtureRoot 'verify-slot.sql') `
    -Variables @{ run_id = $RunId }
  if ([int]$canaryVerification.appointmentCount -ne 1 -or
      [int]$canaryVerification.confirmedAppointmentCount -ne 1 -or
      [int]$canaryVerification.bookedSlotCount -ne 1 -or
      [int]$canaryVerification.duplicateAppointmentSlotCount -ne 0) {
    throw 'API database topology preflight did not produce the expected DB state.'
  }
  Save-JsonDocument -Value ([ordered]@{
      redisObservation = $response
      confirmation = $confirmation
      databaseObservation = $canaryVerification
    }) -Path (Join-Path $script:EvidenceDirectory 'topology-canary.json')

  Remove-FixtureRedisLocks -Fixture $Fixture
  $reset = Invoke-FixtureSql -SqlFile (Join-Path $script:FixtureRoot 'cleanup-slot.sql') `
    -Variables @{ run_id = $RunId }
  Save-JsonDocument -Value $reset `
    -Path (Join-Path $script:EvidenceDirectory 'topology-canary-cleanup.json')
  $freshFixture = Invoke-FixtureSql -SqlFile (Join-Path $script:FixtureRoot 'seed-slot.sql') `
    -Variables @{
      run_id = $RunId
      contender_count = $ContenderCount
      slot_count = $effectiveSlotCount
    }
  Assert-NoFixtureRedisLocks -Fixture $freshFixture
  Write-RunLog 'API topology preflight passed for both Redis and PostgreSQL; fixture was reset.'
  return $freshFixture
}

function Assert-NoFixtureRedisLocks {
  param([Parameter(Mandatory = $true)]$Fixture)

  $pattern = 'lock:doctor:{0}:slot:*' -f $Fixture.doctorId
  $result = Invoke-RedisCommand -Arguments @('--scan', '--pattern', $pattern)
  if (-not [string]::IsNullOrWhiteSpace($result.Output)) {
    throw "Fixture preflight found stale Redis locks for run '$RunId'. Cleanup that run before retrying."
  }
  Write-RunLog 'Redis preflight passed; no lock exists for the fixture doctor.'
}

function Remove-FixtureRedisLocks {
  param([Parameter(Mandatory = $true)]$Fixture)

  $allowedSlots = @{}
  foreach ($slotId in @($Fixture.slotIds)) {
    $allowedSlots[[string]$slotId] = $true
  }
  $allowedHolders = @{}
  foreach ($userId in @($Fixture.contenderUserIds)) {
    $allowedHolders[[string]$userId] = $true
  }

  $pattern = 'lock:doctor:{0}:slot:*' -f $Fixture.doctorId
  $scan = Invoke-RedisCommand -Arguments @('--scan', '--pattern', $pattern) -AllowFailure
  if ($scan.ExitCode -ne 0) {
    throw 'Redis cleanup could not scan fixture lock keys.'
  }

  $deletedCount = 0
  $foreignCount = 0
  foreach ($key in @($scan.Output -split "`r?`n" | Where-Object { $_ })) {
    $slotId = ($key -split ':')[-1]
    $holderResult = Invoke-RedisCommand -Arguments @('GET', $key) -AllowFailure
    $holder = $holderResult.Output.Trim()
    $isRunScopedLoadHolder = $holder.StartsWith("$RunId-vu-", [StringComparison]::Ordinal)
    if (-not $allowedSlots.ContainsKey($slotId) -or
        (-not $allowedHolders.ContainsKey($holder) -and -not $isRunScopedLoadHolder)) {
      $foreignCount++
      continue
    }

    $lua = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end"
    $delete = Invoke-RedisCommand -Arguments @('EVAL', $lua, '1', $key, $holder) -AllowFailure
    if ($delete.ExitCode -eq 0 -and $delete.Output -eq '1') {
      $deletedCount++
    }
  }

  $redisEvidence = [ordered]@{
    runId = $RunId
    scannedPattern = $pattern
    deletedOwnedLocks = $deletedCount
    refusedForeignLocks = $foreignCount
    observedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
  }
  $redisEvidence | ConvertTo-Json -Depth 4 |
    Set-Content -LiteralPath (Join-Path $script:EvidenceDirectory 'redis-cleanup.json') -Encoding UTF8

  if ($foreignCount -gt 0) {
    throw "Redis cleanup refused to delete $foreignCount lock(s) without this run's ownership markers."
  }
  Write-RunLog "Redis cleanup removed $deletedCount lock(s) owned by this run."
}

function Save-JsonDocument {
  param(
    [Parameter(Mandatory = $true)]$Value,
    [Parameter(Mandatory = $true)][string]$Path
  )

  $Value | ConvertTo-Json -Depth 20 |
    Set-Content -LiteralPath $Path -Encoding UTF8
}

function Assert-DatabaseVerification {
  param(
    [Parameter(Mandatory = $true)]$Verification,
    [Parameter(Mandatory = $true)][bool]$ExpectConfirmedAppointment
  )

  $expectedAppointmentCount = if ($ExpectConfirmedAppointment) { 1 } else { 0 }
  $expectedBookedSlotCount = if ($ExpectConfirmedAppointment) { 1 } else { 0 }
  $expectedAvailableSlotCount = $effectiveSlotCount - $expectedBookedSlotCount
  $expectations = [ordered]@{
    doctorCount = 1
    patientCount = $ContenderCount
    slotCount = $effectiveSlotCount
    availableSlotCount = $expectedAvailableSlotCount
    bookedSlotCount = $expectedBookedSlotCount
    offSlotCount = 0
    appointmentCount = $expectedAppointmentCount
    confirmedAppointmentCount = $expectedAppointmentCount
    duplicateAppointmentSlotCount = 0
  }

  foreach ($property in $expectations.Keys) {
    if ($Verification.PSObject.Properties.Name -notcontains $property) {
      throw "Database verification result is missing required property '$property'."
    }
    $actual = [int]$Verification.$property
    $expected = [int]$expectations[$property]
    if ($actual -ne $expected) {
      throw "Database invariant failed for '$property': expected $expected, observed $actual."
    }
  }
  Write-RunLog 'Database invariants passed.'
}

function Get-TestSourceInventory {
  $inventory = @()
  $files = Get-ChildItem -LiteralPath $script:TestsLoadRoot -File -Recurse |
    Where-Object { $_.Extension -in @('.js', '.json', '.jmx', '.md', '.ps1', '.sql', '.yml', '.yaml') } |
    Sort-Object FullName
  foreach ($file in $files) {
    $relativePath = $file.FullName.Substring($script:RepoRoot.Length).TrimStart('\', '/') `
      -replace '\\', '/'
    $inventory += [ordered]@{
      path = $relativePath
      sha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
      bytes = $file.Length
    }
  }
  return @($inventory)
}

function Resolve-K6ScriptPath {
  param([Parameter(Mandatory = $true)][string]$SelectedProfile)

  if (-not [string]::IsNullOrWhiteSpace($K6Script)) {
    $customPath = if ([IO.Path]::IsPathRooted($K6Script)) {
      $K6Script
    }
    else {
      Join-Path $script:RepoRoot $K6Script
    }
    $customPath = [IO.Path]::GetFullPath($customPath)
    if (-not $customPath.StartsWith($script:TestsLoadRoot, [StringComparison]::OrdinalIgnoreCase)) {
      throw 'K6Script must be located under tests-load so it can be mounted read-only.'
    }
    if (-not (Test-Path -LiteralPath $customPath -PathType Leaf)) {
      throw "K6 script was not found: $customPath"
    }
    return $customPath
  }

  $candidates = switch ($SelectedProfile) {
    { $_ -in @('smoke', 'contention', 'microburst') } {
      @('k6-slot-concurrency.js')
      break
    }
    { $_ -in @('idempotency', 'ttl', 'release') } {
      @('k6-slot-lifecycle.js')
      break
    }
    'confirm' {
      # Confirm tests exercise a different DB transaction invariant. Never
      # silently substitute the concurrency/load script when it is unavailable.
      @('k6-slot-lifecycle.js')
      break
    }
    { $_ -in @('throughput', 'ccu') } {
      @('k6-slot-load.js', 'k6-performance.js')
      break
    }
    default {
      @('k6-slot-concurrency.js')
    }
  }

  foreach ($candidate in $candidates) {
    $path = Join-Path $script:TestsLoadRoot $candidate
    if (Test-Path -LiteralPath $path -PathType Leaf) {
      return $path
    }
  }

  throw "No k6 script is available for profile '$SelectedProfile'."
}

function Invoke-K6Profile {
  param(
    [Parameter(Mandatory = $true)][string]$SelectedProfile,
    [Parameter(Mandatory = $true)]$Fixture
  )

  $scriptPath = Resolve-K6ScriptPath -SelectedProfile $SelectedProfile
  $containerScript = '/tests-load/' + $scriptPath.Substring($script:TestsLoadRoot.Length).TrimStart('\', '/').Replace('\', '/')
  $summaryName = '{0}-summary.json' -f $SelectedProfile
  $logName = '{0}-k6.log' -f $SelectedProfile
  $legacyScenario = switch ($SelectedProfile) {
    'throughput' { 'booking' }
    'ccu' { 'peak' }
    default { $SelectedProfile }
  }

  $dockerArguments = @(
    'run', '--rm',
    '-v', ('{0}:/tests-load:ro' -f $script:TestsLoadRoot),
    '-v', ('{0}:/evidence' -f $script:EvidenceDirectory),
    '-e', "ENVIRONMENT=$Environment",
    '-e', "BASE_URL=$BaseUrl",
    '-e', "RUN_ID=$RunId",
    '-e', "DOCTOR_ID=$($Fixture.doctorId)",
    '-e', "SLOT_ID=$($Fixture.slotId)",
    '-e', "PATIENT_ID=$($Fixture.patientId)",
    '-e', 'CONTENDER_IDS_FILE=/evidence/fixture.json',
    '-e', 'SLOT_IDS_FILE=/evidence/slot-ids.json',
    '-e', 'EVIDENCE_DIR=/evidence',
    '-e', "PROFILE=$SelectedProfile",
    '-e', "TEST_PROFILE=$SelectedProfile",
    '-e', "TEST_SCENARIO=$legacyScenario",
    '-e', "LIFECYCLE_SCENARIO=$SelectedProfile",
    '-e', ("LOAD_PROFILE=" + $(if ($SelectedProfile -eq 'ccu') { 'peak' } else { $SelectedProfile })),
    '-e', "CONCURRENT_USERS=$ContenderCount"
  )
  if ($AllowedApiHost.Count -gt 0) {
    $dockerArguments += @('-e', ('ALLOWED_HOSTS=' + ($AllowedApiHost -join ',')))
  }
  $dockerArguments += @(
    $K6Image,
    'run', '--summary-export', "/evidence/$summaryName", $containerScript
  )

  Write-RunLog "Starting k6 profile '$SelectedProfile' with pinned image '$K6Image'."
  $result = Invoke-NativeCommand -Executable 'docker' -Arguments $dockerArguments `
    -OutputFile (Join-Path $script:EvidenceDirectory $logName) -AllowFailure
  if ($result.ExitCode -ne 0) {
    throw "k6 profile '$SelectedProfile' failed with exit code $($result.ExitCode)."
  }

  if ($SelectedProfile -eq 'ttl') {
    $holder = Invoke-RedisCommand -Arguments @('GET', [string]$Fixture.lockKey)
    $ttl = Invoke-RedisCommand -Arguments @('TTL', [string]$Fixture.lockKey)
    $expectedHolder = [string]@($Fixture.contenderUserIds)[1]
    $ttlSeconds = [int]$ttl.Output
    $ttlEvidence = [ordered]@{
      lockKey = [string]$Fixture.lockKey
      expectedReacquiredHolder = $expectedHolder
      observedHolder = $holder.Output
      observedTtlSeconds = $ttlSeconds
      passed = ($holder.Output -eq $expectedHolder -and $ttlSeconds -ge 1 -and $ttlSeconds -le 600)
    }
    Save-JsonDocument -Value $ttlEvidence `
      -Path (Join-Path $script:EvidenceDirectory 'ttl-redis-verification.json')
    if (-not $ttlEvidence.passed) {
      throw 'Direct Redis verification failed after TTL expiry and reacquisition.'
    }
    Remove-FixtureRedisLocks -Fixture $Fixture
  }
  elseif ($SelectedProfile -in @('idempotency', 'release', 'confirm')) {
    $exists = Invoke-RedisCommand -Arguments @('EXISTS', [string]$Fixture.lockKey)
    $lockEvidence = [ordered]@{
      profile = $SelectedProfile
      lockKey = [string]$Fixture.lockKey
      existsAfterProfile = [int]$exists.Output
      passed = ([int]$exists.Output -eq 0)
    }
    Save-JsonDocument -Value $lockEvidence `
      -Path (Join-Path $script:EvidenceDirectory "$SelectedProfile-redis-verification.json")
    if (-not $lockEvidence.passed) {
      throw "Redis lock still exists after '$SelectedProfile' profile."
    }
  }

  # handleSummary files are human-friendly but some scripts intentionally use
  # a stable name. Archive them per profile before a later profile can replace
  # them during an `all` run.
  $stableSummaryPrefix = switch ($SelectedProfile) {
    { $_ -in @('smoke', 'contention', 'microburst') } { 'k6-slot-concurrency-summary'; break }
    'release' { 'k6-slot-release-summary'; break }
    'idempotency' { 'k6-slot-idempotency-summary'; break }
    'ttl' { 'k6-slot-ttl-summary'; break }
    'throughput' { 'k6-slot-throughput-summary'; break }
    'ccu' { 'k6-slot-peak-summary'; break }
    'confirm' { 'k6-slot-confirm-summary'; break }
  }
  foreach ($extension in @('json', 'txt')) {
    $stableSummary = Join-Path $script:EvidenceDirectory "$stableSummaryPrefix.$extension"
    if (Test-Path -LiteralPath $stableSummary -PathType Leaf) {
      Copy-Item -LiteralPath $stableSummary `
        -Destination (Join-Path $script:EvidenceDirectory "$SelectedProfile-business-summary.$extension") `
        -Force
    }
  }
  Write-RunLog "k6 profile '$SelectedProfile' completed successfully."
}

function Get-ProfilesToRun {
  if ($Profile -ne 'all') {
    return @($Profile)
  }
  # Confirm is last because it intentionally changes one slot to BOOKED.
  return @('smoke', 'idempotency', 'contention', 'microburst', 'release', 'ttl', 'throughput', 'ccu', 'confirm')
}

Assert-SafeTarget

if ([string]::IsNullOrWhiteSpace($RunId)) {
  if ($Action -in @('Verify', 'Cleanup')) {
    throw '-RunId is required for Verify and Cleanup actions.'
  }
  $RunId = 'card26-{0}-{1}' -f (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss'),
    ([Guid]::NewGuid().ToString('N').Substring(0, 8))
}
if ($RunId -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{5,63}$') {
  throw 'RunId must be 6-64 characters and contain only letters, numbers, dot, underscore, or hyphen.'
}

$PostgresUser = Get-DefaultValue -Value $PostgresUser -EnvironmentName 'POSTGRES_USER' -Fallback 'postgres'
$PostgresDatabase = Get-DefaultValue -Value $PostgresDatabase -EnvironmentName 'POSTGRES_DB' -Fallback 'ehealth_db'
$PostgresPassword = Get-DefaultValue -Value $PostgresPassword -EnvironmentName 'POSTGRES_PASSWORD' -Fallback 'postgres_password'
$RedisPassword = Get-DefaultValue -Value $RedisPassword -EnvironmentName 'REDIS_PASSWORD' -Fallback ''
$effectiveSlotCount = Get-EffectiveSlotCount

if ([string]::IsNullOrWhiteSpace($EvidenceRoot)) {
  $EvidenceRoot = Join-Path $script:RepoRoot '..\reports\card-2.6-slot-concurrency'
}
$EvidenceRoot = [IO.Path]::GetFullPath($EvidenceRoot)
$repoPrefix = $script:RepoRoot.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
if ($EvidenceRoot.Equals($script:RepoRoot, [StringComparison]::OrdinalIgnoreCase) -or
    $EvidenceRoot.StartsWith($repoPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'EvidenceRoot must be outside the Git repository. Use the root-level ../reports directory.'
}

$commitResult = Invoke-NativeCommand -Executable 'git' -Arguments @('-C', $script:RepoRoot, 'rev-parse', '--short=12', 'HEAD')
$commitSha = $commitResult.Output.Trim()
$gitStatusResult = Invoke-NativeCommand -Executable 'git' -Arguments @(
  '-C', $script:RepoRoot, 'status', '--porcelain=v1', '--untracked-files=all', '--', 'tests-load'
)
$gitStatusLines = @($gitStatusResult.Output -split "`r?`n" | Where-Object { $_ })
$safeRunId = $RunId -replace '[^A-Za-z0-9._-]', '_'
$script:EvidenceDirectory = Join-Path $EvidenceRoot ('{0}_{1}_{2}' -f `
  (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmssfff'), $commitSha, $safeRunId)

$dryRunPlan = [ordered]@{
  action = $Action
  profile = $Profile
  environment = $Environment
  baseUrl = $BaseUrl
  runId = $RunId
  contenderCount = $ContenderCount
  slotCount = $effectiveSlotCount
  postgresPort = $PostgresPort
  redisPort = $RedisPort
  redisInsightPort = $RedisInsightPort
  evidenceDirectory = $script:EvidenceDirectory
  keepFixture = [bool]$KeepFixture
  k6Image = $K6Image
}

if ($DryRun) {
  Write-Host ($dryRunPlan | ConvertTo-Json -Depth 5)
  Write-Host 'Dry-run completed: no directory, container, database, Redis, API, or k6 state was changed.'
  exit 0
}

Assert-CommandAvailable -Name 'docker'
Assert-CommandAvailable -Name 'git'
if (-not $SkipMigrations -and $Action -in @('Run', 'Seed')) {
  Assert-CommandAvailable -Name 'npm'
}

New-Item -ItemType Directory -Path $script:EvidenceDirectory -Force | Out-Null
$script:ExecutionLog = Join-Path $script:EvidenceDirectory 'orchestrator.log'
$manifestPath = Join-Path $script:EvidenceDirectory 'manifest.json'
$dryRunPlan['commitSha'] = $commitSha
$dryRunPlan['worktreeDirty'] = ($gitStatusLines.Count -gt 0)
$dryRunPlan['gitStatus'] = $gitStatusLines
$dryRunPlan['testSourceInventory'] = @(Get-TestSourceInventory)
$dryRunPlan['startedAtUtc'] = (Get-Date).ToUniversalTime().ToString('o')
$dryRunPlan['status'] = 'running'
Save-JsonDocument -Value $dryRunPlan -Path $manifestPath

$savedEnvironment = @{}
foreach ($name in @('POSTGRES_PORT', 'REDIS_PORT', 'REDIS_INSIGHT_PORT', 'POSTGRES_USER', 'POSTGRES_DB', 'POSTGRES_PASSWORD', 'REDIS_PASSWORD', 'DATABASE_URL')) {
  $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

$fixture = $null
$fixtureWasSeeded = $false
$cleanupError = $null
$executionError = $null

try {
  $env:POSTGRES_PORT = [string]$PostgresPort
  $env:REDIS_PORT = [string]$RedisPort
  $env:REDIS_INSIGHT_PORT = [string]$RedisInsightPort
  $env:POSTGRES_USER = $PostgresUser
  $env:POSTGRES_DB = $PostgresDatabase
  $env:POSTGRES_PASSWORD = $PostgresPassword
  $env:REDIS_PASSWORD = $RedisPassword

  if (-not $SkipInfrastructureStart) {
    Write-RunLog "Starting isolated PostgreSQL/Redis ports $PostgresPort/$RedisPort (no volumes are removed)."
    Invoke-ComposeCommand -Arguments @('up', '-d', 'postgres', 'redis') |
      Out-Null
  }
  Wait-InfrastructureHealthy

  if (-not $SkipMigrations -and $Action -in @('Run', 'Seed')) {
    $escapedUser = [Uri]::EscapeDataString($PostgresUser)
    $escapedPassword = [Uri]::EscapeDataString($PostgresPassword)
    $escapedDatabase = [Uri]::EscapeDataString($PostgresDatabase)
    $env:DATABASE_URL = "postgresql://${escapedUser}:${escapedPassword}@127.0.0.1:${PostgresPort}/${escapedDatabase}"
    Write-RunLog 'Running the repository migration command (connection credentials are not logged).'
    Invoke-NativeCommand -Executable 'npm' -Arguments @(
      'run', 'migration:run', '--workspace=@ehealth/server'
    ) -OutputFile (Join-Path $script:EvidenceDirectory 'migration.log') | Out-Null
  }

  if ($Action -in @('Run', 'Seed')) {
    Write-RunLog "Seeding synthetic fixture for run '$RunId'."
    $fixture = Invoke-FixtureSql -SqlFile (Join-Path $script:FixtureRoot 'seed-slot.sql') `
      -Variables @{
        run_id = $RunId
        contender_count = $ContenderCount
        slot_count = $effectiveSlotCount
      }
    $fixtureWasSeeded = $true
    $idempotentFixture = Invoke-FixtureSql `
      -SqlFile (Join-Path $script:FixtureRoot 'seed-slot.sql') `
      -Variables @{
        run_id = $RunId
        contender_count = $ContenderCount
        slot_count = $effectiveSlotCount
      }
    if (($fixture | ConvertTo-Json -Depth 20 -Compress) -ne
        ($idempotentFixture | ConvertTo-Json -Depth 20 -Compress)) {
      throw 'Fixture idempotency check returned a different fixture identity or ordering.'
    }
    $fixture = $idempotentFixture
    Save-JsonDocument -Value ([ordered]@{
        passed = $true
        runId = $RunId
        doctorId = $fixture.doctorId
        patientCount = @($fixture.contenderUserIds).Count
        slotCount = @($fixture.slotIds).Count
      }) -Path (Join-Path $script:EvidenceDirectory 'fixture-idempotency.json')
    Save-JsonDocument -Value $fixture -Path (Join-Path $script:EvidenceDirectory 'fixture.json')
    Save-JsonDocument -Value @($fixture.slotIds) -Path (Join-Path $script:EvidenceDirectory 'slot-ids.json')
    Assert-NoFixtureRedisLocks -Fixture $fixture
  }
  else {
    Write-RunLog "Inspecting existing fixture for run '$RunId'."
    $fixture = Invoke-FixtureSql -SqlFile (Join-Path $script:FixtureRoot 'verify-slot.sql') `
      -Variables @{ run_id = $RunId }
  }

  if ($Action -eq 'Seed') {
    Write-RunLog 'Seed action completed. Fixture is intentionally retained for the requested runId.'
    $KeepFixture = $true
  }
  elseif ($Action -eq 'Verify') {
    Save-JsonDocument -Value $fixture -Path (Join-Path $script:EvidenceDirectory 'db-verification.json')
    Write-RunLog 'Verify action completed.'
  }
  elseif ($Action -eq 'Cleanup') {
    Remove-FixtureRedisLocks -Fixture $fixture
    $cleanup = Invoke-FixtureSql -SqlFile (Join-Path $script:FixtureRoot 'cleanup-slot.sql') `
      -Variables @{ run_id = $RunId }
    Save-JsonDocument -Value $cleanup -Path (Join-Path $script:EvidenceDirectory 'db-cleanup.json')
    Write-RunLog 'Cleanup action completed.'
  }
  else {
    if (-not $SkipApiPreflight) {
      $fixture = Assert-ApiReady -Fixture $fixture
      Save-JsonDocument -Value $fixture -Path (Join-Path $script:EvidenceDirectory 'fixture.json')
      Save-JsonDocument -Value @($fixture.slotIds) -Path (Join-Path $script:EvidenceDirectory 'slot-ids.json')
    }
    $profilesToRun = @(Get-ProfilesToRun)
    foreach ($selectedProfile in $profilesToRun) {
      Invoke-K6Profile -SelectedProfile $selectedProfile -Fixture $fixture
    }

    $verification = Invoke-FixtureSql -SqlFile (Join-Path $script:FixtureRoot 'verify-slot.sql') `
      -Variables @{ run_id = $RunId }
    Save-JsonDocument -Value $verification -Path (Join-Path $script:EvidenceDirectory 'db-verification.json')
    Assert-DatabaseVerification -Verification $verification `
      -ExpectConfirmedAppointment:($profilesToRun -contains 'confirm')
    Write-RunLog 'Database integrity evidence was captured and asserted.'
  }
}
catch {
  $executionError = $_
  Write-RunLog "Orchestration failed: $($_.Exception.Message)" 'ERROR'
}
finally {
  if ($fixtureWasSeeded -and -not $KeepFixture) {
    try {
      Write-RunLog "Cleaning fixture owned by run '$RunId'."
      Remove-FixtureRedisLocks -Fixture $fixture
      $cleanup = Invoke-FixtureSql -SqlFile (Join-Path $script:FixtureRoot 'cleanup-slot.sql') `
        -Variables @{ run_id = $RunId }
      Save-JsonDocument -Value $cleanup -Path (Join-Path $script:EvidenceDirectory 'db-cleanup.json')
      Write-RunLog 'Owned PostgreSQL and Redis fixture data was cleaned.'
    }
    catch {
      $cleanupError = $_
      Write-RunLog "Fixture cleanup failed: $($_.Exception.Message)" 'ERROR'
    }
  }

  foreach ($name in $savedEnvironment.Keys) {
    [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process')
  }

  $imageInspect = Invoke-NativeCommand -Executable 'docker' -Arguments @(
    'image', 'inspect', '--format', '{{.Id}}', $K6Image
  ) -AllowFailure
  $dryRunPlan['k6ImageId'] = if ($imageInspect.ExitCode -eq 0) { $imageInspect.Output } else { $null }
  $dryRunPlan['completedAtUtc'] = (Get-Date).ToUniversalTime().ToString('o')
  $dryRunPlan['cleanupStatus'] = if ($cleanupError) { 'failed' } elseif ($fixtureWasSeeded -and -not $KeepFixture) { 'passed' } else { 'not-requested' }
  $dryRunPlan['status'] = if ($executionError -or $cleanupError) { 'failed' } else { 'passed' }
  $dryRunPlan['error'] = if ($executionError) {
    $executionError.Exception.Message
  }
  elseif ($cleanupError) {
    $cleanupError.Exception.Message
  }
  else {
    $null
  }
  Save-JsonDocument -Value $dryRunPlan -Path $manifestPath
}

if ($executionError) {
  throw $executionError
}
if ($cleanupError) {
  throw $cleanupError
}
Write-RunLog "Orchestration completed. Evidence: $script:EvidenceDirectory"
