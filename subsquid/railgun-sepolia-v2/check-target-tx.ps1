# Check if target transaction has populated arrays
Write-Host "🔍 Checking target transaction..." -ForegroundColor Cyan

docker exec -it railgun-sepolia-v2-db-1 psql -U postgres -d squid -c "SELECT id, block_number, array_length(nullifiers, 1) as nullifier_count, array_length(commitments, 1) as commitment_count FROM transaction WHERE transaction_hash = '\x35d98f0b0f011f74e6f3bf0f56c15106fb4799bf44040b2d009a54a7db91f87a';"

