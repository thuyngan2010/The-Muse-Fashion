# Converts the locally installed MongoDB (Windows service "MongoDB") into a
# single-node replica set "rs0", so the API can use transactions.
# Run in PowerShell AS ADMINISTRATOR:
#   powershell -ExecutionPolicy Bypass -File scripts\setup-local-mongo-replset.ps1

$ErrorActionPreference = 'Stop'

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { throw 'Please run this script as Administrator.' }

$svc = Get-CimInstance Win32_Service -Filter "Name='MongoDB'"
if (-not $svc) { throw 'Windows service "MongoDB" not found. Install MongoDB Community Server (as a service) or use Docker.' }

$cfg = $null
if ($svc.PathName -match '--config\s+"([^"]+)"') { $cfg = $Matches[1] }
elseif ($svc.PathName -match '--config\s+(\S+)') { $cfg = $Matches[1] }
if (-not $cfg) { throw "Cannot find --config in service command: $($svc.PathName)" }
if (-not (Test-Path $cfg)) { throw "Config file not found: $cfg" }
Write-Host "Config file: $cfg"

$text = Get-Content -Raw -Path $cfg
if ($text -match '(?m)^\s*replication\s*:') {
    Write-Host 'mongod.cfg already has a replication section - leaving it unchanged.'
} else {
    $backup = "$cfg.bak"
    if (-not (Test-Path $backup)) { Copy-Item $cfg $backup }
    Write-Host "Backup saved: $backup"
    Add-Content -Path $cfg -Value "`r`nreplication:`r`n  replSetName: rs0`r`n"
    Write-Host 'Added replication.replSetName = rs0'
}

Restart-Service -Name MongoDB
Start-Sleep -Seconds 5

$mongosh = Get-Command mongosh -ErrorAction SilentlyContinue
if (-not $mongosh) {
    Write-Host ''
    Write-Host 'mongosh not found in PATH. Open the MONGOSH tab in Compass (connect to mongodb://127.0.0.1:27017/?directConnection=true) and run:'
    Write-Host '  rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "127.0.0.1:27017" }] })'
    exit 0
}

$js = 'try { rs.status().ok } catch (e) { rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "127.0.0.1:27017" }] }).ok }'
& mongosh 'mongodb://127.0.0.1:27017/?directConnection=true' --quiet --eval $js
Write-Host 'Done. Check with: mongosh "mongodb://127.0.0.1:27017/?directConnection=true" --eval "rs.status().myState"  (1 = PRIMARY)'
