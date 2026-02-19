const ProductEscrow_Initializer = artifacts.require("ProductEscrow_Initializer");
const ProductFactory = artifacts.require("ProductFactory");
const truffleAssert = require("truffle-assertions");

contract("EscrowTimeouts", (accounts) => {
  const [deployer, seller, buyer, transporter1, transporter2, anyone] = accounts;

  const BOND_AMOUNT = web3.utils.toWei("0.01", "ether");
  const TWO_DAYS = 2 * 24 * 60 * 60; // 172800 seconds
  const COMMITMENT = web3.utils.keccak256("secret-price-salt");
  const VC_CID = "QmTestCID12345";
  const DELIVERY_FEE = web3.utils.toWei("0.005", "ether");

  // Use unique memo/tx hashes per test to avoid MemoAlreadyUsed errors
  let testCounter = 0;
  const uniqueMemoHash = () => web3.utils.keccak256("memo-" + (++testCounter));
  const uniqueTxRef = () => web3.utils.keccak256("txref-" + testCounter);

  const Phase = {
    Listed: 0,
    Purchased: 1,
    OrderConfirmed: 2,
    Bound: 3,
    Delivered: 4,
    Expired: 5,
  };

  const advanceTime = async (seconds) => {
    await new Promise((resolve, reject) => {
      web3.currentProvider.send(
        { jsonrpc: "2.0", method: "evm_increaseTime", params: [seconds], id: Date.now() },
        (err) => (err ? reject(err) : resolve())
      );
    });
    await new Promise((resolve, reject) => {
      web3.currentProvider.send(
        { jsonrpc: "2.0", method: "evm_mine", params: [], id: Date.now() + 1 },
        (err) => (err ? reject(err) : resolve())
      );
    });
  };

  // Helper: deploy fresh factory + create product
  const freshEscrow = async () => {
    const impl = await ProductEscrow_Initializer.new({ from: deployer });
    const fact = await ProductFactory.new(impl.address, { from: deployer });
    await fact.setBondAmount(BOND_AMOUNT, { from: deployer });
    const tx = await fact.createProduct("Test Battery", COMMITMENT, {
      from: seller,
      value: BOND_AMOUNT,
    });
    const addr = tx.logs.find((l) => l.event === "ProductCreated").args.product;
    const esc = await ProductEscrow_Initializer.at(addr);
    // FCFS pattern: no designateBuyer needed. Any non-seller caller becomes buyer.
    return esc;
  };

  const toPurchased = async (esc) => {
    const id = await esc.id();
    await esc.recordPrivatePayment(id, uniqueMemoHash(), uniqueTxRef(), { from: buyer });
  };

  const toOrderConfirmed = async (esc) => {
    await toPurchased(esc);
    await esc.confirmOrder(VC_CID, { from: seller });
  };

  const toBound = async (esc) => {
    await toOrderConfirmed(esc);
    await esc.createTransporter(DELIVERY_FEE, { from: transporter1, value: BOND_AMOUNT });
    await esc.setTransporter(transporter1, { from: seller, value: DELIVERY_FEE });
  };

  const toDelivered = async (esc) => {
    await toBound(esc);
    const hash = web3.utils.keccak256(web3.utils.utf8ToHex(VC_CID));
    await esc.confirmDelivery(hash, { from: transporter1 });
  };

  // ═══════════════════════════════════════════════════════════════════
  //  1. sellerTimeout
  // ═══════════════════════════════════════════════════════════════════

  describe("sellerTimeout", () => {
    it("slashes seller bond to buyer, sets Expired, zeroes state, emits BondSlashed", async () => {
      const esc = await freshEscrow();
      await toPurchased(esc);

      const buyerBalBefore = BigInt(await web3.eth.getBalance(buyer));
      await advanceTime(TWO_DAYS + 1);
      const tx = await esc.sellerTimeout({ from: anyone });
      const buyerBalAfter = BigInt(await web3.eth.getBalance(buyer));

      // Buyer receives seller bond (anyone pays gas, not buyer)
      assert.equal((buyerBalAfter - buyerBalBefore).toString(), BOND_AMOUNT.toString(),
        "Buyer should receive seller bond");

      assert.equal((await esc.phase()).toNumber(), Phase.Expired);
      assert.equal((await esc.sellerBond()).toString(), "0");
      assert.equal((await web3.eth.getBalance(esc.address)).toString(), "0");

      truffleAssert.eventEmitted(tx, "BondSlashed", (ev) =>
        ev.from === seller && ev.to === buyer && ev.amount.toString() === BOND_AMOUNT.toString()
      );
    });

    it("reverts before window expires", async () => {
      const esc = await freshEscrow();
      await toPurchased(esc);
      // Do NOT advance time
      await truffleAssert.reverts(esc.sellerTimeout({ from: anyone }));
    });

    it("reverts at exact TWO_DAYS boundary (<=)", async () => {
      const esc = await freshEscrow();
      await toPurchased(esc);
      await advanceTime(TWO_DAYS);
      await truffleAssert.reverts(esc.sellerTimeout({ from: anyone }));
    });

    it("succeeds at TWO_DAYS + 1", async () => {
      const esc = await freshEscrow();
      await toPurchased(esc);
      await advanceTime(TWO_DAYS + 1);
      await esc.sellerTimeout({ from: anyone });
      assert.equal((await esc.phase()).toNumber(), Phase.Expired);
    });

    it("reverts in Listed phase", async () => {
      const esc = await freshEscrow();
      await advanceTime(TWO_DAYS + 1);
      await truffleAssert.reverts(esc.sellerTimeout({ from: anyone }));
    });

    it("reverts in OrderConfirmed phase", async () => {
      const esc = await freshEscrow();
      await toOrderConfirmed(esc);
      await advanceTime(TWO_DAYS + 1);
      await truffleAssert.reverts(esc.sellerTimeout({ from: anyone }));
    });

    it("reverts in Bound phase", async () => {
      const esc = await freshEscrow();
      await toBound(esc);
      await advanceTime(TWO_DAYS + 1);
      await truffleAssert.reverts(esc.sellerTimeout({ from: anyone }));
    });

    it("is permissionless (anyone can call)", async () => {
      const esc = await freshEscrow();
      await toPurchased(esc);
      await advanceTime(TWO_DAYS + 1);
      await esc.sellerTimeout({ from: anyone });
      assert.equal((await esc.phase()).toNumber(), Phase.Expired);
    });

    it("confirmOrder reverts after seller window expiry", async () => {
      const esc = await freshEscrow();
      await toPurchased(esc);
      await advanceTime(TWO_DAYS + 1);
      await truffleAssert.reverts(esc.confirmOrder(VC_CID, { from: seller }));
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  2. bidTimeout
  // ═══════════════════════════════════════════════════════════════════

  describe("bidTimeout", () => {
    it("returns seller bond, sets Expired, emits BondReturned", async () => {
      const esc = await freshEscrow();
      await toOrderConfirmed(esc);

      const sellerBalBefore = BigInt(await web3.eth.getBalance(seller));
      await advanceTime(TWO_DAYS + 1);
      const tx = await esc.bidTimeout({ from: anyone });
      const sellerBalAfter = BigInt(await web3.eth.getBalance(seller));

      assert.equal((sellerBalAfter - sellerBalBefore).toString(), BOND_AMOUNT.toString(),
        "Seller should receive their bond back");
      assert.equal((await esc.phase()).toNumber(), Phase.Expired);

      truffleAssert.eventEmitted(tx, "BondReturned", (ev) =>
        ev.to === seller && ev.amount.toString() === BOND_AMOUNT.toString()
      );
    });

    it("does NOT auto-return transporter bonds; withdrawBid works after", async () => {
      const esc = await freshEscrow();
      await toOrderConfirmed(esc);
      await esc.createTransporter(DELIVERY_FEE, { from: transporter1, value: BOND_AMOUNT });
      await esc.createTransporter(DELIVERY_FEE, { from: transporter2, value: BOND_AMOUNT });

      await advanceTime(TWO_DAYS + 1);
      await esc.bidTimeout({ from: anyone });

      // Contract still holds transporter bonds
      const contractBal = BigInt(await web3.eth.getBalance(esc.address));
      assert.equal(contractBal.toString(), (BigInt(BOND_AMOUNT) * 2n).toString(),
        "Should still hold transporter bonds");

      // Transporters can withdraw
      await esc.withdrawBid({ from: transporter1 });
      await esc.withdrawBid({ from: transporter2 });

      assert.equal((await web3.eth.getBalance(esc.address)).toString(), "0",
        "Contract empty after all withdrawals");
    });

    it("reverts before window expires", async () => {
      const esc = await freshEscrow();
      await toOrderConfirmed(esc);
      await truffleAssert.reverts(esc.bidTimeout({ from: anyone }));
    });

    it("reverts in Listed phase", async () => {
      const esc = await freshEscrow();
      await advanceTime(TWO_DAYS + 1);
      await truffleAssert.reverts(esc.bidTimeout({ from: anyone }));
    });

    it("reverts in Purchased phase", async () => {
      const esc = await freshEscrow();
      await toPurchased(esc);
      await advanceTime(TWO_DAYS + 1);
      await truffleAssert.reverts(esc.bidTimeout({ from: anyone }));
    });

    it("is permissionless", async () => {
      const esc = await freshEscrow();
      await toOrderConfirmed(esc);
      await advanceTime(TWO_DAYS + 1);
      await esc.bidTimeout({ from: anyone });
      assert.equal((await esc.phase()).toNumber(), Phase.Expired);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  3. deliveryTimeout
  // ═══════════════════════════════════════════════════════════════════

  describe("deliveryTimeout", () => {
    it("slashes transporter bond + returns seller bond + fee to seller, events emitted", async () => {
      const esc = await freshEscrow();
      await toBound(esc);

      const sellerBalBefore = BigInt(await web3.eth.getBalance(seller));
      await advanceTime(TWO_DAYS + 1);
      const tx = await esc.deliveryTimeout({ from: anyone });
      const sellerBalAfter = BigInt(await web3.eth.getBalance(seller));

      const expectedTotal = BigInt(BOND_AMOUNT) + BigInt(BOND_AMOUNT) + BigInt(DELIVERY_FEE);
      assert.equal((sellerBalAfter - sellerBalBefore).toString(), expectedTotal.toString(),
        "Seller should receive sellerBond + transporterBond + deliveryFee");

      assert.equal((await esc.phase()).toNumber(), Phase.Expired);
      assert.equal((await esc.sellerBond()).toString(), "0");
      assert.equal((await esc.securityDeposits(transporter1)).toString(), "0");
      assert.equal((await esc.deliveryFee()).toString(), "0");
      assert.equal((await web3.eth.getBalance(esc.address)).toString(), "0");

      truffleAssert.eventEmitted(tx, "BondReturned", (ev) =>
        ev.to === seller && ev.amount.toString() === BOND_AMOUNT.toString()
      );
      truffleAssert.eventEmitted(tx, "BondSlashed", (ev) =>
        ev.from === transporter1 && ev.to === seller && ev.amount.toString() === BOND_AMOUNT.toString()
      );
    });

    it("reverts before window expires", async () => {
      const esc = await freshEscrow();
      await toBound(esc);
      await truffleAssert.reverts(esc.deliveryTimeout({ from: anyone }));
    });

    it("reverts at exact TWO_DAYS boundary (<=)", async () => {
      const esc = await freshEscrow();
      await toBound(esc);
      await advanceTime(TWO_DAYS);
      await truffleAssert.reverts(esc.deliveryTimeout({ from: anyone }));
    });

    it("reverts in Listed phase", async () => {
      const esc = await freshEscrow();
      await advanceTime(TWO_DAYS + 1);
      await truffleAssert.reverts(esc.deliveryTimeout({ from: anyone }));
    });

    it("reverts in OrderConfirmed phase", async () => {
      const esc = await freshEscrow();
      await toOrderConfirmed(esc);
      await advanceTime(TWO_DAYS + 1);
      await truffleAssert.reverts(esc.deliveryTimeout({ from: anyone }));
    });

    it("is permissionless", async () => {
      const esc = await freshEscrow();
      await toBound(esc);
      await advanceTime(TWO_DAYS + 1);
      await esc.deliveryTimeout({ from: anyone });
      assert.equal((await esc.phase()).toNumber(), Phase.Expired);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  4. Edge cases
  // ═══════════════════════════════════════════════════════════════════

  describe("Timeout edge cases", () => {
    it("cannot call any timeout after successful delivery", async () => {
      const esc = await freshEscrow();
      await toDelivered(esc);
      await advanceTime(TWO_DAYS + 1);

      await truffleAssert.reverts(esc.sellerTimeout({ from: anyone }));
      await truffleAssert.reverts(esc.bidTimeout({ from: anyone }));
      await truffleAssert.reverts(esc.deliveryTimeout({ from: anyone }));
    });

    it("cannot call timeout twice (already Expired)", async () => {
      const esc = await freshEscrow();
      await toPurchased(esc);
      await advanceTime(TWO_DAYS + 1);
      await esc.sellerTimeout({ from: anyone });
      await truffleAssert.reverts(esc.sellerTimeout({ from: anyone }));
    });

    it("after bidTimeout, all other timeouts revert", async () => {
      const esc = await freshEscrow();
      await toOrderConfirmed(esc);
      await advanceTime(TWO_DAYS + 1);
      await esc.bidTimeout({ from: anyone });

      await truffleAssert.reverts(esc.sellerTimeout({ from: anyone }));
      await truffleAssert.reverts(esc.bidTimeout({ from: anyone }));
      await truffleAssert.reverts(esc.deliveryTimeout({ from: anyone }));
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  5. Double-payment regression
  // ═══════════════════════════════════════════════════════════════════

  describe("Double-payment regression", () => {
    it("sellerTimeout: contract balance exactly 0", async () => {
      const esc = await freshEscrow();
      await toPurchased(esc);
      assert.equal((await web3.eth.getBalance(esc.address)).toString(), BOND_AMOUNT.toString());

      await advanceTime(TWO_DAYS + 1);
      await esc.sellerTimeout({ from: anyone });
      assert.equal((await web3.eth.getBalance(esc.address)).toString(), "0");
    });

    it("bidTimeout: only transporter bonds remain, withdrawal empties contract", async () => {
      const esc = await freshEscrow();
      await toOrderConfirmed(esc);
      await esc.createTransporter(DELIVERY_FEE, { from: transporter1, value: BOND_AMOUNT });

      assert.equal(
        (await web3.eth.getBalance(esc.address)).toString(),
        (BigInt(BOND_AMOUNT) * 2n).toString()
      );

      await advanceTime(TWO_DAYS + 1);
      await esc.bidTimeout({ from: anyone });
      assert.equal((await web3.eth.getBalance(esc.address)).toString(), BOND_AMOUNT.toString());

      await esc.withdrawBid({ from: transporter1 });
      assert.equal((await web3.eth.getBalance(esc.address)).toString(), "0");
    });

    it("deliveryTimeout: exact single payout, contract balance 0", async () => {
      const esc = await freshEscrow();
      await toBound(esc);

      const expected = BigInt(BOND_AMOUNT) * 2n + BigInt(DELIVERY_FEE);
      assert.equal((await web3.eth.getBalance(esc.address)).toString(), expected.toString());

      const sellerBalBefore = BigInt(await web3.eth.getBalance(seller));
      await advanceTime(TWO_DAYS + 1);
      await esc.deliveryTimeout({ from: anyone });
      const sellerBalAfter = BigInt(await web3.eth.getBalance(seller));

      assert.equal((sellerBalAfter - sellerBalBefore).toString(), expected.toString());
      assert.equal((await web3.eth.getBalance(esc.address)).toString(), "0");
    });
  });
});
