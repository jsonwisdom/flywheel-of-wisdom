# Flywheel read-only audit; Windows PowerShell 5.1 and PowerShell 7.
# No Git subprocess is spawned; no CDP APIs, payments, writes to source, or signing.
param([string]$Project = (Get-Location).Path, [int]$TimeoutSec = 5)
$ErrorActionPreference = 'Stop'
$results = [ordered]@{
  schema_version = '1.0'
  mode = 'READ_ONLY_NO_PAYMENT'
  timestamp_utc = (Get-Date).ToUniversalTime().ToString('o')
  project = $Project
  checks = [ordered]@{}
  settlement = 'HOLD'
  production = 'HOLD'
}
function Add-Check([string]$name,[string]$state,[string]$detail) {
  $results.checks[$name] = [ordered]@{ status = $state; detail = $detail }
  Write-Output ("{0}: {1} - {2}" -f $name,$state,$detail)
}
try {
  $clientPath = Join-Path $Project 'client-sepolia.ts'
  $serverPath = Join-Path $Project 'server.ts'
  if (Test-Path -LiteralPath $clientPath) {
    $c = [IO.File]::ReadAllText($clientPath)
    $guardPos = $c.IndexOf('EXECUTE_TEST_PAYMENT')
    $cdpPos = $c.IndexOf('new CdpClient')
    if ($guardPos -ge 0 -and $cdpPos -gt $guardPos) {
      Add-Check 'guard_before_cdp' 'PASS' 'EXECUTE_TEST_PAYMENT appears before new CdpClient (textual ordering only)'
    } else { Add-Check 'guard_before_cdp' 'HOLD' 'Guard absent or not before first CDP client construction' }
    if ($c -match '1000000n' -and $c -match 'amount\s*!==\s*MAX_ATOMIC') {
      Add-Check 'exact_amount_static' 'PASS' 'Exact 1000000n comparison found (static check only)'
    } else { Add-Check 'exact_amount_static' 'HOLD' 'Exact amount pattern not independently established' }
  } else { Add-Check 'local_client' 'HOLD' 'client-sepolia.ts not found' }
  if (Test-Path -LiteralPath $serverPath) {
    $s = [IO.File]::ReadAllText($serverPath)
    if ($s.Contains('eip155:84532')) {
      Add-Check 'testnet_source' 'PASS' 'Base Sepolia identifier appears in local server source'
    } else { Add-Check 'testnet_source' 'HOLD' 'Base Sepolia identifier not found' }
  } else { Add-Check 'server_source' 'HOLD' 'server.ts not found' }
  $sha = [ordered]@{}
  foreach ($name in @('client-sepolia.ts','server.ts','package.json','package-lock.json','scripts/test-402.ps1')) {
    $p = Join-Path $Project $name
    if (Test-Path -LiteralPath $p) {
      $sha[$name] = (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()
    }
  }
  $results.file_sha256 = $sha
  $uri = 'http://localhost:8402/receipt'
  try {
    $request = [System.Net.HttpWebRequest][System.Net.WebRequest]::Create($uri)
    $request.Method = 'GET'
    $request.AllowAutoRedirect = $false
    $request.Timeout = [Math]::Max(1,$TimeoutSec) * 1000
    $request.ReadWriteTimeout = [Math]::Max(1,$TimeoutSec) * 1000
    $response = $null
    try { $response = [System.Net.HttpWebResponse]$request.GetResponse() }
    catch [System.Net.WebException] {
      $response = $_.Exception.Response
      if (-not $response) { throw }
    }
    try {
      $status = [int]$response.StatusCode
      $header = $response.Headers['PAYMENT-REQUIRED']
      if ($status -eq 402 -and $header) {
        $decoded = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($header)) | ConvertFrom-Json
        $offers = @($decoded.accepts)
        if ($decoded.x402Version -eq 2 -and $offers.Count -eq 1 -and $offers[0].scheme -eq 'exact' -and $offers[0].network -eq 'eip155:84532' -and [string]$offers[0].amount -eq '1000000' -and [string]$offers[0].asset -ieq '0x036CbD53842c5426634e7929541eC2318f3dCF7e' -and [string]$offers[0].payTo -ieq '0xa380552a27b0a5a2874ea7aa52cac09f542002e8') {
          Add-Check 'local_unpaid_challenge' 'PASS' 'HTTP 402; exact single Base Sepolia 1 USDC offer; asset and recipient checked'
        } else { Add-Check 'local_unpaid_challenge' 'HOLD' 'Challenge terms differ from exact expected values' }
      } else { Add-Check 'local_unpaid_challenge' 'HOLD' "HTTP $status or missing PAYMENT-REQUIRED header" }
    } finally { if ($response) { $response.Close() } }
  } catch {
    Add-Check 'local_unpaid_challenge' 'HOLD' $_.Exception.Message
  }
} catch {
  Add-Check 'audit_exception' 'HOLD' $_.Exception.Message
} finally {
  $dir = Join-Path $HOME 'flywheel-audits'
  if (-not (Test-Path -LiteralPath $dir)) { [void](New-Item -ItemType Directory -Path $dir -Force) }
  $name = 'verification-' + (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss-fff') + '.json'
  $path = Join-Path $dir $name
  ($results | ConvertTo-Json -Depth 8) | Set-Content -LiteralPath $path -Encoding UTF8
  Write-Output "REPORT=$path"
  Write-Output 'SETTLEMENT=HOLD'
  Write-Output 'PRODUCTION=HOLD'
}
