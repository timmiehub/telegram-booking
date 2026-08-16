# Build + vite preview + Cloudflare tunnel for Telegram Mini App
# Usage: powershell -ExecutionPolicy Bypass -File scripts/start_tunnel_preview.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$webapp = Join-Path $root "webapp"
$botEnv = Join-Path $root "bot\.env"

Write-Host "1) Building webapp..."
Set-Location $webapp
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw "build failed" }

Write-Host "2) Starting vite preview on :4173..."
$preview = Start-Process -FilePath "npm.cmd" -ArgumentList "run","preview","--","--host","127.0.0.1","--port","4173" -PassThru -WindowStyle Minimized -WorkingDirectory $webapp
Start-Sleep -Seconds 2

Write-Host "3) Starting cloudflared tunnel..."
$cf = Start-Process -FilePath "npx.cmd" -ArgumentList "--yes","cloudflared","tunnel","--url","http://127.0.0.1:4173" -PassThru -RedirectStandardOutput (Join-Path $env:TEMP "cf-tunnel-out.txt") -RedirectStandardError (Join-Path $env:TEMP "cf-tunnel-err.txt") -WindowStyle Minimized

$url = $null
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  $out = ""
  if (Test-Path (Join-Path $env:TEMP "cf-tunnel-err.txt")) {
    $out += Get-Content (Join-Path $env:TEMP "cf-tunnel-err.txt") -Raw -ErrorAction SilentlyContinue
  }
  if (Test-Path (Join-Path $env:TEMP "cf-tunnel-out.txt")) {
    $out += Get-Content (Join-Path $env:TEMP "cf-tunnel-out.txt") -Raw -ErrorAction SilentlyContinue
  }
  if ($out -match "https://[a-z0-9-]+\.trycloudflare\.com") {
    $url = $Matches[0]
    break
  }
}

if (-not $url) {
  Write-Host "Не удалось получить URL туннеля. Смотри логи cloudflared."
  exit 1
}

$webappUrl = "$url/?master=demo"
Write-Host ""
Write-Host "Tunnel OK: $webappUrl"
Write-Host "Preview PID: $($preview.Id)  Cloudflare PID: $($cf.Id)"
Write-Host ""
Write-Host "Обнови bot/.env:"
Write-Host "WEBAPP_URL=$webappUrl"
Write-Host "Потом перезапусти бота и в Telegram: /start  затем /pingweb"

if (Test-Path $botEnv) {
  $raw = Get-Content $botEnv -Raw
  if ($raw -match "WEBAPP_URL=") {
    $raw = $raw -replace "WEBAPP_URL=.*", "WEBAPP_URL=$webappUrl"
  } else {
    $raw = $raw.TrimEnd() + "`nWEBAPP_URL=$webappUrl`n"
  }
  Set-Content -Path $botEnv -Value $raw -NoNewline
  Write-Host "bot/.env обновлён автоматически."
}
