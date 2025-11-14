# Quick test script
Write-Host "🔍 Testing Subsquid Indexer..." -ForegroundColor Cyan

Write-Host "`n1. Checking if target transaction exists..." -ForegroundColor Yellow
docker exec -it railgun-sepolia-v2-db-1 psql -U postgres -d squid -c "SELECT id, block_number, array_length(nullifiers, 1) as nullifier_count, array_length(commitments, 1) as commitment_count FROM transaction WHERE transaction_hash = '\x35d98f0b0f011f74e6f3bf0f56c15106fb4799bf44040b2d009a54a7db91f87a';"

Write-Host "`n2. Total transactions indexed:" -ForegroundColor Yellow
docker exec -it railgun-sepolia-v2-db-1 psql -U postgres -d squid -c "SELECT COUNT(*) as total_transactions FROM transaction;"

Write-Host "`n3. Transactions with nullifiers:" -ForegroundColor Yellow
docker exec -it railgun-sepolia-v2-db-1 psql -U postgres -d squid -c "SELECT COUNT(*) as transactions_with_nullifiers FROM transaction WHERE array_length(nullifiers, 1) > 0;"

Write-Host "`n4. Transactions with commitments:" -ForegroundColor Yellow
docker exec -it railgun-sepolia-v2-db-1 psql -U postgres -d squid -c "SELECT COUNT(*) as transactions_with_commitments FROM transaction WHERE array_length(commitments, 1) > 0;"

Write-Host "`n✅ Test complete!" -ForegroundColor Green
Write-Host "`nNext: Start GraphQL server (npm run serve) and test queries" -ForegroundColor Cyan




