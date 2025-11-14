# Kill process using port 4000 on Windows
$port = 4000
$process = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique

if ($process) {
    Write-Host "Found process $process using port $port"
    Stop-Process -Id $process -Force
    Write-Host "✅ Process killed"
} else {
    Write-Host "No process found using port $port"
}




