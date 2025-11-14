# Debug: Check transaction hash format and find target transaction
Write-Host "Checking transaction hash format..." -ForegroundColor Cyan

Write-Host ""
Write-Host "1. Total transactions:" -ForegroundColor Yellow
docker exec -it railgun-sepolia-v2-db-1 psql -U postgres -d squid -c "SELECT COUNT(*) FROM transaction;"

Write-Host ""
Write-Host "2. Transactions near block 9536064:" -ForegroundColor Yellow
docker exec -it railgun-sepolia-v2-db-1 psql -U postgres -d squid -c "SELECT id, block_number, encode(transaction_hash, 'hex') as tx_hash_hex FROM transaction WHERE block_number BETWEEN 9536060 AND 9536070 ORDER BY block_number;"

Write-Host ""
Write-Host "3. Checking if hash exists:" -ForegroundColor Yellow
docker exec -it railgun-sepolia-v2-db-1 psql -U postgres -d squid -c "SELECT id, block_number, encode(transaction_hash, 'hex') as tx_hash FROM transaction WHERE encode(transaction_hash, 'hex') = '35d98f0b0f011f74e6f3bf0f56c15106fb4799bf44040b2d009a54a7db91f87a';"

