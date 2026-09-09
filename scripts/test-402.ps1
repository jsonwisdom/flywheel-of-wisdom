# Probe the x402 rail. Expect HTTP 402 Payment Required on an unpaid request.
# Run: .\scripts\test-402.ps1   (server must be running: npm start)

$ErrorActionPreference = "Stop"
$base = if ($env:X402_BASE) { $env:X402_BASE } else { "http://localhost:8402" }

Write-Host "Probing $base/receipt (expect 402)..." -ForegroundColor Cyan
try {
  $resp = Invoke-WebRequest -Uri "$base/receipt" -Method GET -SkipHttpErrorCheck
  Write-Host "Status: $($resp.StatusCode)"
  if ($resp.StatusCode -eq 402) {
    Write-Host "PASS — 402 Payment Required returned. Rail is live." -ForegroundColor Green
    Write-Host "PAYMENT-REQUIRED header present: $($null -ne $resp.Headers['PAYMENT-REQUIRED'])"
  } else {
    Write-Host "Unexpected status $($resp.StatusCode). Body:" -ForegroundColor Red
    Write-Host $resp.Content
  }
} catch {
  Write-Host "Request failed: $_" -ForegroundColor Red
  Write-Host "Is the server running? (npm start)" -ForegroundColor Yellow
}
