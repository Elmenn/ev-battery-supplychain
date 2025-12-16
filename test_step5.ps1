# Test script for Step 5: TX Hash Commitment in VC
# This script tests VC creation and EIP-712 signing with the new commitment field

Write-Host "`nStep 5: Testing TX Hash Commitment in VC`n" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# Check if ZKP backend is running
Write-Host "`nChecking if ZKP backend is running..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:5010/zkp/commit-tx-hash" -Method POST -Body '{"tx_hash":"0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"}' -ContentType "application/json" -ErrorAction Stop
    Write-Host "ZKP backend is running" -ForegroundColor Green
} catch {
    Write-Host "ZKP backend is not running!" -ForegroundColor Red
    Write-Host "Please start it with: cd zkp-backend; cargo run --bin bulletproof-demo" -ForegroundColor Yellow
    exit 1
}

# Test 1: API Endpoint
Write-Host "`nTest 1: API Endpoint Test" -ForegroundColor Cyan
$txHash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
$body = @{ tx_hash = $txHash } | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://localhost:5010/zkp/commit-tx-hash" -Method Post -Body $body -ContentType "application/json"
    
    if ($response.verified -eq $true) {
        Write-Host "API endpoint works correctly" -ForegroundColor Green
        Write-Host "Commitment: $($response.commitment.Substring(0, 20))..." -ForegroundColor Gray
        Write-Host "Proof size: $($response.proof.Length / 2) bytes" -ForegroundColor Gray
        $commitment = $response.commitment
        $proof = $response.proof
    } else {
        Write-Host "API returned unverified commitment" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "API test failed: $_" -ForegroundColor Red
    exit 1
}

# Test 2: Check if frontend files exist
Write-Host "`nTest 2: Frontend Files Check" -ForegroundColor Cyan
$files = @(
    "frontend/src/utils/vcBuilder.mjs",
    "frontend/src/utils/signVcWithMetamask.js",
    "frontend/src/App.js"
)

$allExist = $true
foreach ($file in $files) {
    if (Test-Path $file) {
        Write-Host "$file exists" -ForegroundColor Green
    } else {
        Write-Host "$file not found" -ForegroundColor Red
        $allExist = $false
    }
}

if (-not $allExist) {
    Write-Host "Some frontend files are missing" -ForegroundColor Red
    exit 1
}

# Test 3: Check if buildStage3VC accepts txHashCommitment
Write-Host "`nTest 3: VC Builder Function Check" -ForegroundColor Cyan
$vcBuilderContent = Get-Content "frontend/src/utils/vcBuilder.mjs" -Raw

if ($vcBuilderContent -match "txHashCommitment") {
    Write-Host "buildStage3VC accepts txHashCommitment parameter" -ForegroundColor Green
} else {
    Write-Host "buildStage3VC does not accept txHashCommitment" -ForegroundColor Red
    exit 1
}

if ($vcBuilderContent -match "credentialSubject\.txHashCommitment") {
    Write-Host "VC stores txHashCommitment in credentialSubject" -ForegroundColor Green
} else {
    Write-Host "VC does not store txHashCommitment" -ForegroundColor Red
    exit 1
}

# Test 4: Check if signing excludes txHashCommitment
Write-Host "`nTest 4: EIP-712 Signing Check" -ForegroundColor Cyan
$signingContent = Get-Content "frontend/src/utils/signVcWithMetamask.js" -Raw

if ($signingContent -match "txHashCommitment.*delete|delete.*txHashCommitment") {
    Write-Host "signVcWithMetamask excludes txHashCommitment from signing payload" -ForegroundColor Green
} else {
    Write-Host "signVcWithMetamask does not exclude txHashCommitment" -ForegroundColor Red
    exit 1
}

# Summary
Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "Test Results Summary" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Test 1 (API Endpoint):           PASS" -ForegroundColor Green
Write-Host "Test 2 (Frontend Files):         PASS" -ForegroundColor Green
Write-Host "Test 3 (VC Builder):             PASS" -ForegroundColor Green
Write-Host "Test 4 (EIP-712 Signing):        PASS" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "ALL TESTS PASSED!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan

Write-Host "`nNext Steps:" -ForegroundColor Yellow
Write-Host "   1. Start the frontend: cd frontend; npm start" -ForegroundColor Gray
Write-Host "   2. Test the full flow: purchase -> VC creation -> verification" -ForegroundColor Gray
Write-Host "   3. Verify the VC contains txHashCommitment in IPFS" -ForegroundColor Gray
