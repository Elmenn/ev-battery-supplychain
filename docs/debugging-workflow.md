# Debugging Workflow: Confidential Commitments

This guide documents the step-by-step process for debugging and verifying the confidential price commitment workflow in the EV Battery Supplychain project. It covers both smart contract (Truffle console) and frontend (browser/web console) debugging.

---

## 1. **Product Creation (Frontend)**
- When a product is created, a random blinding factor and price are used to compute a price commitment.
- These values are stored in the browser's `localStorage` for later use.

**Frontend logs to note:**
- `Product deployed at: 0x...` (ProductEscrow address)
- `🔒 Price commitment: 0x...` (commitment value)
- `Blinding (hex): 0x...` (blinding factor)
- `Price (wei): ...` (price in wei)

---

## 2. **Retrieving Values for Debugging**

### **A. Get the ProductEscrow Address**
- From frontend logs after product creation, or:
- In Truffle console:
  ```js
  let factory = await ProductFactory.deployed();
  let products = await factory.getProducts();
  let lastEscrow = products[products.length - 1];
  console.log(lastEscrow);
  ```

### **B. Get priceWei and priceBlinding (Browser Console)**
1. Open your dApp in the browser.
2. Open DevTools (F12 → Console).
3. Run:
   ```js
   const addr = "0xYOUR_PRODUCT_ESCROW_ADDRESS";
   console.log("priceWei:", localStorage.getItem(`priceWei_${addr}`));
   console.log("priceBlinding:", localStorage.getItem(`priceBlinding_${addr}`));
   ```

---

## 3. **Compute the Commitment (Browser Console)**
If using ethers.js in the browser:
```js
const price = ethers.toBigInt("<priceWei from above>");
const blinding = "<priceBlinding from above>";
const commitment = ethers.keccak256(
  ethers.solidityPacked(["uint256", "bytes32"], [price, blinding])
);
console.log("Computed commitment:", commitment);
```

---

## 4. **Check On-Chain State (Truffle Console)**
```js
let escrow = await ProductEscrow.at("0xYOUR_PRODUCT_ESCROW_ADDRESS");
await escrow.priceCommitment(); // Should match computed commitment
await escrow.buyer();           // Should be set after purchase
await escrow.transporter();     // Should be set after transporter selection
```

---

## 5. **Compare and Debug**
- The computed commitment (browser) should match the on-chain value (Truffle).
- If not, check that you are using the correct address, price, and blinding.
- If buyer/transporter are zero, the product was not purchased or transporter not set.

---

## 6. **Common Pitfalls & Tips**
- Always use the same browser for product creation and debugging (localStorage is browser-specific).
- Make sure you are on the same network in both frontend and Truffle.
- Double-check addresses and values for typos.
- If you clear browser storage, you will lose the blinding/price for existing products.
- Use the browser console for localStorage, Truffle for on-chain state.

---

## 7. **Quick Reference Table**
| What to check         | Where/How to check                                 |
|---------------------- |----------------------------------------------------|
| ProductEscrow address | Frontend log or Truffle console                    |
| priceWei              | Browser: `localStorage.getItem('priceWei_ADDRESS')`|
| priceBlinding         | Browser: `localStorage.getItem('priceBlinding_ADDRESS')`|
| priceCommitment       | Compute in browser, check on-chain in Truffle      |
| buyer/transporter     | Truffle: `await escrow.buyer()`/`transporter()`    |

---

**This workflow ensures you can always debug, verify, and trust the confidential commitment logic in your dApp!** 