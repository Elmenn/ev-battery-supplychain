# Check for checkpoint/state tables
docker exec -it railgun-sepolia-v2-db-1 psql -U postgres -d squid -c "\dt" | Select-String -Pattern "state|checkpoint|status|processor"

# Also check all tables
docker exec -it railgun-sepolia-v2-db-1 psql -U postgres -d squid -c "\dt"




