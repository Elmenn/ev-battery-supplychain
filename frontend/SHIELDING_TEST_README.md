# 🛡️ Railgun Shielding Test Guide

This guide explains how to test the Railgun shielding functionality on Sepolia testnet.

## 📋 Prerequisites

Before testing, ensure you have:

1. **MetaMask connected to Sepolia testnet** (Chain ID: 11155111)
2. **At least 0.01 ETH** for gas fees
3. **Some WETH or ETH** to test with (recommended: 0.1+ ETH)
4. **React app running** with the Railgun SDK initialized

## 🧪 Testing Options

### Option 1: React Component (Recommended)

Add the `ShieldingTestButton` component to your app:

```jsx
import ShieldingTestButton from './components/ShieldingTestButton';

// Add this to your main component or page
<ShieldingTestButton />
```

This provides a user-friendly interface with:
- ✅ Balance checking
- ✅ Prerequisite validation
- ✅ WETH shielding tests
- ✅ ETH auto-wrapping tests
- ✅ Full test suite
- ✅ Real-time results display

### Option 2: Browser Console Script

Copy and paste the `test-shielding-console.js` script into your browser console.

**Available functions:**
- `testShielding()` - Full test suite
- `quickValidationTest()` - Quick validation
- `testWETHShielding()` - Test WETH shielding
- `testETHShielding()` - Test ETH shielding
- `checkBalances()` - Check current balances

### Option 3: Import Script

Use the `test-shielding.js` script for programmatic testing:

```javascript
import { testShielding } from './test-shielding.js';
await testShielding();
```

## 🚀 Quick Start Testing

### Step 1: Basic Validation
```javascript
// Check if prerequisites are met
await quickValidationTest();
```

### Step 2: Check Balances
```javascript
// See current ETH, WETH, and private balances
await checkBalances();
```

### Step 3: Test WETH Shielding
```javascript
// Shield 0.01 WETH to private balance
await testWETHShielding();
```

### Step 4: Test ETH Shielding
```javascript
// Shield 0.01 ETH (auto-wraps to WETH)
await testETHShielding();
```

## 📊 What Gets Tested

### ✅ Prerequisites Validation
- Network: Sepolia testnet confirmation
- ETH balance: Sufficient for gas fees
- WETH balance: Sufficient for shielding
- WETH allowance: Approved for Railgun

### 🛡️ Shielding Operations
- **WETH Shielding**: Direct WETH to private balance
- **ETH Shielding**: ETH → WETH → private balance
- **Auto-wrapping**: ETH to WETH conversion
- **Auto-approval**: WETH allowance for Railgun

### 💰 Balance Verification
- Public ETH balance
- Public WETH balance
- Private WETH balance
- Balance refresh after operations

### 🔧 Auto-Fixes
- **Insufficient WETH**: Auto-wrap ETH to WETH
- **Insufficient allowance**: Auto-approve WETH
- **Gas estimation**: Automatic gas calculation

## 🎯 Test Configuration

Default test amount: **0.01 WETH** (small enough for testing, large enough to be meaningful)

You can modify the test amount in:
- React component: Use the input field
- Console script: Modify `TEST_CONFIG.testAmount`
- Import script: Pass custom amount to functions

## 📝 Expected Test Flow

### Successful Test Run:
1. **Initialization**: Railgun SDK starts up
2. **Balance Check**: Current balances displayed
3. **Validation**: Prerequisites verified
4. **WETH Shielding**: 0.01 WETH shielded to private
5. **ETH Shielding**: 0.01 ETH wrapped and shielded
6. **Verification**: Private balances updated
7. **Completion**: All tests passed

### Common Issues & Solutions:

#### ❌ "Wrong network"
- **Solution**: Switch MetaMask to Sepolia testnet

#### ❌ "Insufficient ETH for gas"
- **Solution**: Get more Sepolia ETH from a faucet

#### ❌ "WETH contract not accessible"
- **Solution**: Check if Sepolia WETH contract is deployed

#### ❌ "Railgun client not accessible"
- **Solution**: Ensure React app is fully loaded and SDK initialized

## 🔍 Debugging Tips

### Enable Verbose Logging
Set environment variable: `REACT_APP_VERBOSE=true`

### Check Browser Console
All SDK operations log detailed information to the console.

### Monitor Network Tab
Watch for failed RPC calls or contract interactions.

### Verify Contract Addresses
Ensure you're using the correct Sepolia addresses:
- WETH: `0xfff9976782d46CC05630d1f6eBAb18b2324d6B14`
- Railgun contracts: Auto-resolved from `@railgun-community/deployments`

## 🎉 Success Indicators

Your shielding test is successful when you see:

1. ✅ **Transaction hashes** for both WETH and ETH shielding
2. ✅ **Private balance increases** after operations
3. ✅ **Fee calculations** displayed (0.25% RAILGUN fee)
4. ✅ **Auto-wrapping confirmation** for ETH operations
5. ✅ **Balance refresh success** after operations

## 🚨 Important Notes

- **Test amounts are small** (0.01 WETH) to minimize costs
- **RAILGUN fee is 0.25%** on all shielding operations
- **Private balances may take time** to sync after operations
- **Always test on Sepolia** before mainnet
- **Keep test results** for debugging purposes

## 📞 Getting Help

If tests fail:

1. **Check prerequisites** with `quickValidationTest()`
2. **Verify balances** with `checkBalances()`
3. **Review console logs** for detailed error messages
4. **Ensure SDK initialization** completed successfully
5. **Check network connectivity** and RPC endpoints

---

**Happy Testing! 🎯** Your Railgun shielding implementation should now be fully functional on Sepolia testnet.
