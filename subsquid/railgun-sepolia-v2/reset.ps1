# Reset script for Subsquid processor
# This deletes all data and checkpoints to force a fresh start from START_BLOCK

Write-Host "🔄 Resetting Subsquid processor..." -ForegroundColor Yellow

# Step 1: Delete all data
Write-Host "`n1. Deleting all indexed data..." -ForegroundColor Cyan
docker exec -it railgun-sepolia-v2-db-1 psql -U postgres -d squid -c "DELETE FROM transaction; DELETE FROM nullifier; DELETE FROM commitment; DELETE FROM unshield; DELETE FROM token;" 2>&1 | Out-Null
Write-Host "   ✅ Data deleted" -ForegroundColor Green

# Step 2: Delete all checkpoint schemas
Write-Host "`n2. Deleting checkpoint schemas..." -ForegroundColor Cyan
docker exec -it railgun-sepolia-v2-db-1 psql -U postgres -d squid -c "DROP SCHEMA IF EXISTS processor_state_v2 CASCADE; DROP SCHEMA IF EXISTS processor_state_v3_reset CASCADE; DROP SCHEMA IF EXISTS processor_state_v4_reset CASCADE; DROP SCHEMA IF EXISTS processor_state_v5_decode_arrays CASCADE;" 2>&1 | Out-Null
Write-Host "   ✅ Known checkpoints deleted" -ForegroundColor Green

# Step 3: List all schemas to find any other checkpoint schemas
Write-Host "`n3. Checking for other checkpoint schemas..." -ForegroundColor Cyan
$schemas = docker exec railgun-sepolia-v2-db-1 psql -U postgres -d squid -t -c "SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'processor%' OR schema_name LIKE '%state%';" 2>&1
if ($schemas -match '\S') {
    Write-Host "   Found additional schemas, deleting..." -ForegroundColor Yellow
    $schemas -split "`n" | ForEach-Object {
        $schema = $_.Trim()
        if ($schema -and $schema -notmatch '^\s*$') {
            docker exec -it railgun-sepolia-v2-db-1 psql -U postgres -d squid -c "DROP SCHEMA IF EXISTS $schema CASCADE;" 2>&1 | Out-Null
            Write-Host "   Deleted: $schema" -ForegroundColor Gray
        }
    }
}

Write-Host "`n✅ Reset complete! Processor will start from START_BLOCK (5944700) on next run." -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "  1. Run: npm run build" -ForegroundColor White
Write-Host "  2. Run: npm run process" -ForegroundColor White
Write-Host "`nNote: If processor still uses old checkpoint, update stateSchema name in src/main.ts" -ForegroundColor Yellow

