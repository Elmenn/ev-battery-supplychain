$body = @{
    query = "{ transactions(limit: 1) { id blockNumber } }"
} | ConvertTo-Json

$response = Invoke-WebRequest -Uri "http://localhost:4000/graphql" -Method POST -ContentType "application/json" -Body $body

Write-Host "Status Code: $($response.StatusCode)"
Write-Host "Response:"
$response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10




