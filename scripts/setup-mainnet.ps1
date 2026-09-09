# Flywheel of Wisdom — mainnet x402 setup (PowerShell)
# Run from repo root:  .\scripts\setup-mainnet.ps1

$ErrorActionPreference = "Stop"

Write-Host "== Flywheel x402 mainnet setup ==" -ForegroundColor Cyan

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from .env.example — fill in CDP_API_KEY_ID and CDP_API_KEY_SECRET." -ForegroundColor Yellow
} else {
  Write-Host ".env already exists."
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js 22+ required. Install from https://nodejs.org"
}
$nodeVer = (node -v).TrimStart('v').Split('.')[0]
if ([int]$nodeVer -lt 22) { throw "Need Node 22+, found $nodeVer" }

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw "npm not found" }

Write-Host "Installing dependencies..."
npm install

Write-Host ""
Write-Host "Next:" -ForegroundColor Green
Write-Host "  1. Edit .env with your CDP API key"
Write-Host "  2. npm start"
Write-Host "  3. In another terminal: .\scripts\test-402.ps1"
