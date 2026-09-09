# Probe the x402 rail. An unpaid request must return HTTP 402 and a payment challenge.
# Run: .\scripts\test-402.ps1   (server must be running: npm start)

$ErrorActionPreference = "Stop"
$base = if ($env:X402_BASE) { $env:X402_BASE.TrimEnd("/") } else { "http://localhost:8402" }

Write-Host "Probing $base/receipt (expect 402)..." -ForegroundColor Cyan

try {
  $resp = Invoke-WebRequest -Uri "$base/receipt" -Method GET -SkipHttpErrorCheck
} catch {
  throw "Request failed. Is the server running? $($_.Exception.Message)"
}

Write-Host "Status: $($resp.StatusCode)"
if ($resp.StatusCode -ne 402) {
  throw "Expected HTTP 402, received $($resp.StatusCode). Body: $($resp.Content)"
}

$challenge = $resp.Headers["PAYMENT-REQUIRED"]
if (-not $challenge) {
  throw "HTTP 402 did not include the PAYMENT-REQUIRED header."
}

Write-Host "PASS — unpaid request returned 402 with PAYMENT-REQUIRED." -ForegroundColor Green
