# Starts the production-configured x402 rail, verifies the unpaid challenge, then stops it.
# This script never signs a payment authorization and cannot spend USDC.
# Run from repo root: .\scripts\smoke-mainnet.ps1

$ErrorActionPreference = "Stop"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js 22+ is required."
}
$nodeMajor = [int]((node -v).TrimStart("v").Split(".")[0])
if ($nodeMajor -lt 22) {
  throw "Node.js 22+ is required; found major version $nodeMajor."
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm is required."
}
if (-not $env:CDP_API_KEY_ID -or -not $env:CDP_API_KEY_SECRET) {
  if (-not (Test-Path ".env")) {
    throw "Set CDP_API_KEY_ID and CDP_API_KEY_SECRET, or create .env from .env.example."
  }
}

$port = if ($env:PORT) { [int]$env:PORT } else { 8402 }
$env:X402_BASE = "http://127.0.0.1:$port"
$stdout = Join-Path $env:TEMP "flywheel-x402-$PID.stdout.log"
$stderr = Join-Path $env:TEMP "flywheel-x402-$PID.stderr.log"
$server = $null

try {
  $server = Start-Process -FilePath "npm.cmd" -ArgumentList "start" -PassThru -NoNewWindow -RedirectStandardOutput $stdout -RedirectStandardError $stderr

  $ready = $false
  for ($attempt = 1; $attempt -le 30; $attempt++) {
    if ($server.HasExited) {
      throw "Server exited before readiness. See $stderr"
    }
    try {
      $probe = Invoke-WebRequest -Uri "$env:X402_BASE/receipt" -Method GET -SkipHttpErrorCheck -TimeoutSec 3
      if ($probe.StatusCode -eq 402) {
        $ready = $true
        break
      }
    } catch {
      Start-Sleep -Seconds 1
    }
  }

  if (-not $ready) {
    throw "Server did not return HTTP 402 within 30 seconds. See $stderr"
  }

  & "$PSScriptRoot\test-402.ps1"
  if ($LASTEXITCODE -ne 0) {
    throw "x402 smoke probe failed with exit code $LASTEXITCODE."
  }
} finally {
  if ($server -and -not $server.HasExited) {
    & taskkill.exe /PID $server.Id /T /F | Out-Null
  }
}

Write-Host "PASS — server lifecycle and unpaid x402 challenge verified; no payment sent." -ForegroundColor Green
