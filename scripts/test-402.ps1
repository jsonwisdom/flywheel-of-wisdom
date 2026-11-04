# Read-only x402 challenge probe; compatible with Windows PowerShell 5.1 and PowerShell 7.
# Usage: .\scripts\test-402.ps1 (start the server separately).
# Does not use a wallet, sign, or send payment credentials.
param(
  [string]$BaseUrl = $(if ($env:X402_BASE) { $env:X402_BASE } else { 'http://localhost:8402' }),
  [int]$TimeoutSec = 5
)
$ErrorActionPreference = 'Stop'
$uri = $BaseUrl.TrimEnd('/') + '/receipt'
try {
  $request = [System.Net.HttpWebRequest][System.Net.WebRequest]::Create($uri)
  $request.Method = 'GET'
  $request.Timeout = [Math]::Max(1, $TimeoutSec) * 1000
  $request.ReadWriteTimeout = [Math]::Max(1, $TimeoutSec) * 1000
  $request.AllowAutoRedirect = $false
  $request.Headers.Remove('PAYMENT-SIGNATURE')
  $response = $null
  try {
    $response = [System.Net.HttpWebResponse]$request.GetResponse()
  } catch [System.Net.WebException] {
    $response = $_.Exception.Response
    if (-not $response) { throw }
  }
  try {
    $status = [int]$response.StatusCode
    $challenge = $response.Headers['PAYMENT-REQUIRED']
    Write-Output "HTTP_STATUS=$status"
    Write-Output "PAYMENT_REQUIRED_HEADER_PRESENT=$([bool]$challenge)"
    if ($status -eq 402 -and -not [string]::IsNullOrWhiteSpace($challenge)) {
      Write-Output 'CHALLENGE_CHECK=PASS'
      Write-Output 'SETTLEMENT_CHECK=HOLD'
      exit 0
    }
    Write-Error "Challenge mismatch: expected 402 and PAYMENT-REQUIRED header; got $status."
    exit 1
  } finally {
    if ($response) { $response.Close() }
  }
} catch {
  [Console]::Error.WriteLine("CHALLENGE_CHECK=HOLD: $($_.Exception.Message)")
  exit 2
}
