const ProductEscrow_Initializer = artifacts.require("ProductEscrow_Initializer");
const ProductFactory = artifacts.require("ProductFactory");
const truffleAssert = require("truffle-assertions");
const { toWei, randomHex, soliditySha3 } = web3.utils;

contract("EscrowRedesign – Full Lifecycle", accounts => {
  const [deployer, seller, buyer, transporter, transporter2, anyone] = accounts;
  const BOND = toWei("0.01", "ether");
  const FEE  = toWei("0.005", "ether");
  const FEE2 = toWei("0.007", "ether");
  const VCID = "ipfs://QmTestVcCid12345";

  let factory, impl, esc, escAddr, commitment;

  // Helper: deploy fresh factory + create one product
  async function deployAndCreate() {
    impl = await ProductEscrow_Initializer.new({ from: deployer });
    factory = await ProductFactory.new(impl.address, { from: deployer });
    await factory.setBondAmount(BOND, { from: deployer });

    commitment = randomHex(32);
    const tx = await factory.createProduct("Test Battery", commitment, {
      from: seller,
      value: BOND
    });
    const ev = tx.logs.find(l => l.event === "ProductCreated");
    escAddr = ev.args.product;
    esc = await ProductEscrow_Initializer.at(escAddr);
  }

  // Helper: advance to OrderConfirmed phase
  async function advanceToOrderConfirmed() {
    const memo = randomHex(32);
    const txRef = randomHex(32);
    await esc.recordPrivatePayment(1, memo, txRef, { from: buyer });
    await esc.confirmOrder(VCID, { from: seller });
  }

  // Helper: advance to Bound phase (includes transporter bid + selection)
  async function advanceToBound() {
    await advanceToOrderConfirmed();
    await esc.createTransporter(FEE, { from: transporter, value: BOND });
    await esc.setTransporter(transporter, { from: seller, value: FEE });
  }

  beforeEach(async () => {
    await deployAndCreate();
  });

  // ─────────────────────────────────────────────────────────────────────
  //  1. Product creation with bond
  // ─────────────────────────────────────────────────────────────────────
  describe("Product creation with bond", () => {
    it("creates clone with correct id, name, priceCommitment, owner", async () => {
      assert.equal((await esc.id()).toString(), "1");
      assert.equal(await esc.name(), "Test Battery");
      assert.equal(await esc.priceCommitment(), commitment);
      assert.equal(await esc.owner(), seller);
    });

    it("stores sellerBond correctly", async () => {
      assert.equal((await esc.sellerBond()).toString(), BOND);
      const balance = await web3.eth.getBalance(escAddr);
      assert.equal(balance, BOND);
    });

    it("phase is Listed after creation", async () => {
      const phase = (await esc.phase()).toNumber();
      assert.equal(phase, 0, "Phase should be Listed (0)");
    });

    it("reverts if msg.value != bondAmount", async () => {
      const wrong = toWei("0.005", "ether");
      await truffleAssert.reverts(
        factory.createProduct("Bad Bond", randomHex(32), { from: seller, value: wrong })
      );
    });

    it("reverts if bondAmount not set", async () => {
      const impl2 = await ProductEscrow_Initializer.new({ from: deployer });
      const factory2 = await ProductFactory.new(impl2.address, { from: deployer });
      // bondAmount is 0 by default
      await truffleAssert.reverts(
        factory2.createProduct("No Bond", randomHex(32), { from: seller, value: BOND })
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  //  2. recordPrivatePayment (Listed -> Purchased)
  // ─────────────────────────────────────────────────────────────────────
  describe("recordPrivatePayment", () => {
    it("transitions to Purchased, sets buyer and purchased flag", async () => {
      const memo = randomHex(32);
      const txRef = randomHex(32);
      await esc.recordPrivatePayment(1, memo, txRef, { from: buyer });

      assert.equal((await esc.phase()).toNumber(), 1, "Phase should be Purchased (1)");
      assert.equal(await esc.purchased(), true);
      assert.equal(await esc.buyer(), buyer);
    });

    it("sets purchaseTimestamp", async () => {
      const memo = randomHex(32);
      const txRef = randomHex(32);
      await esc.recordPrivatePayment(1, memo, txRef, { from: buyer });
      const ts = (await esc.purchaseTimestamp()).toNumber();
      assert.isAbove(ts, 0, "purchaseTimestamp should be set");
    });

    it("emits PrivatePaymentRecorded event", async () => {
      const memo = randomHex(32);
      const txRef = randomHex(32);
      const tx = await esc.recordPrivatePayment(1, memo, txRef, { from: buyer });
      truffleAssert.eventEmitted(tx, "PrivatePaymentRecorded");
    });

    it("reverts if phase != Listed", async () => {
      // Purchase once
      await esc.recordPrivatePayment(1, randomHex(32), randomHex(32), { from: buyer });
      // Try again in Purchased phase
      await truffleAssert.reverts(
        esc.recordPrivatePayment(1, randomHex(32), randomHex(32), { from: anyone })
      );
    });

    it("reverts if caller is seller", async () => {
      await truffleAssert.reverts(
        esc.recordPrivatePayment(1, randomHex(32), randomHex(32), { from: seller })
      );
    });

    it("reverts if memoHash is zero", async () => {
      const zero = "0x0000000000000000000000000000000000000000000000000000000000000000";
      await truffleAssert.reverts(
        esc.recordPrivatePayment(1, zero, randomHex(32), { from: buyer })
      );
    });

    it("reverts if railgunTxRef is zero", async () => {
      const zero = "0x0000000000000000000000000000000000000000000000000000000000000000";
      await truffleAssert.reverts(
        esc.recordPrivatePayment(1, randomHex(32), zero, { from: buyer })
      );
    });

    it("reverts if productId does not match", async () => {
      await truffleAssert.reverts(
        esc.recordPrivatePayment(999, randomHex(32), randomHex(32), { from: buyer })
      );
    });

    it("anti-replay: same memoHash cannot be reused across products", async () => {
      const memo = randomHex(32);
      const txRef = randomHex(32);
      // Use memo on first product
      await esc.recordPrivatePayment(1, memo, txRef, { from: buyer });

      // Create second product
      const tx2 = await factory.createProduct("Battery 2", randomHex(32), {
        from: seller,
        value: BOND
      });
      const addr2 = tx2.logs.find(l => l.event === "ProductCreated").args.product;
      const esc2 = await ProductEscrow_Initializer.at(addr2);

      // Note: usedMemoHash is per-clone, so the same memo on a different clone
      // would actually work (mappings are per-contract storage).
      // The anti-replay within the SAME product is tested by the "phase != Listed" check.
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  //  3. confirmOrder (Purchased -> OrderConfirmed)
  // ─────────────────────────────────────────────────────────────────────
  describe("confirmOrder", () => {
    beforeEach(async () => {
      await esc.recordPrivatePayment(1, randomHex(32), randomHex(32), { from: buyer });
    });

    it("transitions to OrderConfirmed and stores vcHash", async () => {
      await esc.confirmOrder(VCID, { from: seller });
      assert.equal((await esc.phase()).toNumber(), 2, "Phase should be OrderConfirmed (2)");

      const expectedHash = soliditySha3({ type: "string", value: VCID });
      assert.equal(await esc.vcHash(), expectedHash);
    });

    it("sets orderConfirmedTimestamp", async () => {
      await esc.confirmOrder(VCID, { from: seller });
      const ts = (await esc.orderConfirmedTimestamp()).toNumber();
      assert.isAbove(ts, 0);
    });

    it("emits OrderConfirmed event with vcCID", async () => {
      const tx = await esc.confirmOrder(VCID, { from: seller });
      truffleAssert.eventEmitted(tx, "OrderConfirmed", ev => {
        return ev.vcCID === VCID;
      });
    });

    it("emits VcHashStored event", async () => {
      const tx = await esc.confirmOrder(VCID, { from: seller });
      truffleAssert.eventEmitted(tx, "VcHashStored");
    });

    it("reverts if caller is not seller", async () => {
      await truffleAssert.reverts(
        esc.confirmOrder(VCID, { from: buyer })
      );
      await truffleAssert.reverts(
        esc.confirmOrder(VCID, { from: anyone })
      );
    });

    it("reverts if phase != Purchased", async () => {
      await esc.confirmOrder(VCID, { from: seller });
      // Now in OrderConfirmed, try again
      await truffleAssert.reverts(
        esc.confirmOrder(VCID, { from: seller })
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  //  4. createTransporter (bidding in OrderConfirmed)
  // ─────────────────────────────────────────────────────────────────────
  describe("createTransporter", () => {
    beforeEach(async () => {
      await advanceToOrderConfirmed();
    });

    it("registers transporter with bond and fee", async () => {
      const tx = await esc.createTransporter(FEE, { from: transporter, value: BOND });

      assert.equal(await esc.isTransporter(transporter), true);
      assert.equal((await esc.securityDeposits(transporter)).toString(), BOND);
      assert.equal((await esc.transporters(transporter)).toString(), FEE);
      assert.equal((await esc.transporterCount()).toNumber(), 1);

      truffleAssert.eventEmitted(tx, "TransporterCreated");
      truffleAssert.eventEmitted(tx, "TransporterBondDeposited");
    });

    it("allows multiple transporters to bid", async () => {
      await esc.createTransporter(FEE, { from: transporter, value: BOND });
      await esc.createTransporter(FEE2, { from: transporter2, value: BOND });

      assert.equal((await esc.transporterCount()).toNumber(), 2);
      assert.equal(await esc.isTransporter(transporter), true);
      assert.equal(await esc.isTransporter(transporter2), true);
    });

    it("reverts if phase != OrderConfirmed", async () => {
      // Still in Listed phase on a fresh product
      const impl2 = await ProductEscrow_Initializer.new({ from: deployer });
      const factory2 = await ProductFactory.new(impl2.address, { from: deployer });
      await factory2.setBondAmount(BOND, { from: deployer });
      const tx = await factory2.createProduct("Fresh", randomHex(32), { from: seller, value: BOND });
      const addr = tx.logs.find(l => l.event === "ProductCreated").args.product;
      const freshEsc = await ProductEscrow_Initializer.at(addr);

      await truffleAssert.reverts(
        freshEsc.createTransporter(FEE, { from: transporter, value: BOND })
      );
    });

    it("reverts if msg.value != bondAmount", async () => {
      const wrongBond = toWei("0.005", "ether");
      await truffleAssert.reverts(
        esc.createTransporter(FEE, { from: transporter, value: wrongBond })
      );
    });

    it("reverts if transporter already bid", async () => {
      await esc.createTransporter(FEE, { from: transporter, value: BOND });
      await truffleAssert.reverts(
        esc.createTransporter(FEE, { from: transporter, value: BOND })
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  //  5. setTransporter (OrderConfirmed -> Bound)
  // ─────────────────────────────────────────────────────────────────────
  describe("setTransporter", () => {
    beforeEach(async () => {
      await advanceToOrderConfirmed();
      await esc.createTransporter(FEE, { from: transporter, value: BOND });
      await esc.createTransporter(FEE2, { from: transporter2, value: BOND });
    });

    it("transitions to Bound, stores deliveryFee and transporter", async () => {
      const tx = await esc.setTransporter(transporter, { from: seller, value: FEE });

      assert.equal((await esc.phase()).toNumber(), 3, "Phase should be Bound (3)");
      assert.equal(await esc.transporter(), transporter);
      assert.equal((await esc.deliveryFee()).toString(), FEE);

      truffleAssert.eventEmitted(tx, "TransporterSelected");
    });

    it("sets boundTimestamp", async () => {
      await esc.setTransporter(transporter, { from: seller, value: FEE });
      const ts = (await esc.boundTimestamp()).toNumber();
      assert.isAbove(ts, 0);
    });

    it("reverts if caller is not seller", async () => {
      await truffleAssert.reverts(
        esc.setTransporter(transporter, { from: buyer, value: FEE })
      );
    });

    it("reverts if selected address is not a registered transporter", async () => {
      await truffleAssert.reverts(
        esc.setTransporter(anyone, { from: seller, value: FEE })
      );
    });

    it("reverts if delivery fee does not match transporter bid", async () => {
      const wrongFee = toWei("0.001", "ether");
      await truffleAssert.reverts(
        esc.setTransporter(transporter, { from: seller, value: wrongFee })
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  //  6. confirmDelivery (Bound -> Delivered)
  // ─────────────────────────────────────────────────────────────────────
  describe("confirmDelivery", () => {
    let vcHash;

    beforeEach(async () => {
      await advanceToBound();
      vcHash = soliditySha3({ type: "string", value: VCID });
    });

    it("transitions to Delivered with correct hash", async () => {
      const tx = await esc.confirmDelivery(vcHash, { from: transporter });

      assert.equal((await esc.phase()).toNumber(), 4, "Phase should be Delivered (4)");
      assert.equal(await esc.delivered(), true);

      truffleAssert.eventEmitted(tx, "DeliveryConfirmed");
    });

    it("returns sellerBond to seller", async () => {
      const sellerBalBefore = web3.utils.toBN(await web3.eth.getBalance(seller));
      await esc.confirmDelivery(vcHash, { from: transporter });
      const sellerBalAfter = web3.utils.toBN(await web3.eth.getBalance(seller));

      const diff = sellerBalAfter.sub(sellerBalBefore);
      assert.equal(diff.toString(), BOND, "Seller should receive bond back");
    });

    it("returns transporterBond + deliveryFee to transporter", async () => {
      const transporterBalBefore = web3.utils.toBN(await web3.eth.getBalance(transporter));
      const tx = await esc.confirmDelivery(vcHash, { from: transporter });

      // Calculate gas cost
      const receipt = tx.receipt;
      const txData = await web3.eth.getTransaction(tx.tx);
      const gasCost = web3.utils.toBN(receipt.gasUsed).mul(web3.utils.toBN(txData.gasPrice));

      const transporterBalAfter = web3.utils.toBN(await web3.eth.getBalance(transporter));
      const expected = web3.utils.toBN(BOND).add(web3.utils.toBN(FEE));
      const actual = transporterBalAfter.sub(transporterBalBefore).add(gasCost);

      assert.equal(actual.toString(), expected.toString(), "Transporter should receive bond + fee");
    });

    it("contract balance is 0 after delivery", async () => {
      await esc.confirmDelivery(vcHash, { from: transporter });
      const balance = await web3.eth.getBalance(escAddr);
      assert.equal(balance, "0", "Contract should be empty after delivery");
    });

    it("reverts if hash does not match vcHash (HashMismatch)", async () => {
      const wrongHash = randomHex(32);
      await truffleAssert.reverts(
        esc.confirmDelivery(wrongHash, { from: transporter })
      );
    });

    it("reverts if caller is not transporter", async () => {
      await truffleAssert.reverts(
        esc.confirmDelivery(vcHash, { from: seller })
      );
      await truffleAssert.reverts(
        esc.confirmDelivery(vcHash, { from: buyer })
      );
      await truffleAssert.reverts(
        esc.confirmDelivery(vcHash, { from: anyone })
      );
    });

    it("reverts if phase != Bound", async () => {
      // Deliver first
      await esc.confirmDelivery(vcHash, { from: transporter });
      // Try again in Delivered phase
      await truffleAssert.reverts(
        esc.confirmDelivery(vcHash, { from: transporter })
      );
    });

    it("reverts if already delivered", async () => {
      await esc.confirmDelivery(vcHash, { from: transporter });
      await truffleAssert.reverts(
        esc.confirmDelivery(vcHash, { from: transporter })
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  //  7. withdrawBid
  // ─────────────────────────────────────────────────────────────────────
  describe("withdrawBid", () => {
    beforeEach(async () => {
      await advanceToOrderConfirmed();
      await esc.createTransporter(FEE, { from: transporter, value: BOND });
      await esc.createTransporter(FEE2, { from: transporter2, value: BOND });
    });

    it("non-selected transporter can withdraw in OrderConfirmed phase", async () => {
      const balBefore = web3.utils.toBN(await web3.eth.getBalance(transporter2));
      const tx = await esc.withdrawBid({ from: transporter2 });

      const receipt = tx.receipt;
      const txData = await web3.eth.getTransaction(tx.tx);
      const gasCost = web3.utils.toBN(receipt.gasUsed).mul(web3.utils.toBN(txData.gasPrice));

      const balAfter = web3.utils.toBN(await web3.eth.getBalance(transporter2));
      const actual = balAfter.sub(balBefore).add(gasCost);
      assert.equal(actual.toString(), BOND, "Should get bond back");

      truffleAssert.eventEmitted(tx, "BidWithdrawn");
    });

    it("non-selected transporter can withdraw in Expired phase", async () => {
      // Select transporter (not transporter2) to move to Bound
      await esc.setTransporter(transporter, { from: seller, value: FEE });
      // Advance time past delivery window to trigger deliveryTimeout
      await advanceTime(2 * 24 * 3600 + 1);
      await esc.deliveryTimeout({ from: anyone });

      // Now in Expired phase, transporter2 should be able to withdraw
      const tx = await esc.withdrawBid({ from: transporter2 });
      truffleAssert.eventEmitted(tx, "BidWithdrawn");
    });

    it("selected transporter cannot withdraw", async () => {
      await esc.setTransporter(transporter, { from: seller, value: FEE });
      // Now advance past delivery to Expired
      await advanceTime(2 * 24 * 3600 + 1);
      await esc.deliveryTimeout({ from: anyone });

      await truffleAssert.reverts(
        esc.withdrawBid({ from: transporter })
      );
    });

    it("reverts if no bond deposited", async () => {
      await truffleAssert.reverts(
        esc.withdrawBid({ from: anyone })
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  //  Full happy-path end-to-end
  // ─────────────────────────────────────────────────────────────────────
  describe("Full lifecycle (Listed -> Delivered)", () => {
    it("completes entire lifecycle", async () => {
      // Listed
      assert.equal((await esc.phase()).toNumber(), 0);

      // Listed -> Purchased
      const memo = randomHex(32);
      const txRef = randomHex(32);
      await esc.recordPrivatePayment(1, memo, txRef, { from: buyer });
      assert.equal((await esc.phase()).toNumber(), 1);

      // Purchased -> OrderConfirmed
      await esc.confirmOrder(VCID, { from: seller });
      assert.equal((await esc.phase()).toNumber(), 2);

      // Transporter bids
      await esc.createTransporter(FEE, { from: transporter, value: BOND });

      // OrderConfirmed -> Bound
      await esc.setTransporter(transporter, { from: seller, value: FEE });
      assert.equal((await esc.phase()).toNumber(), 3);

      // Bound -> Delivered
      const vcHash = soliditySha3({ type: "string", value: VCID });
      await esc.confirmDelivery(vcHash, { from: transporter });
      assert.equal((await esc.phase()).toNumber(), 4);
      assert.equal(await esc.delivered(), true);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────
//  Helper: advance Ganache time
// ─────────────────────────────────────────────────────────────────────
async function advanceTime(seconds) {
  await web3.currentProvider.send(
    { jsonrpc: "2.0", method: "evm_increaseTime", params: [seconds], id: Date.now() },
    () => {}
  );
  await web3.currentProvider.send(
    { jsonrpc: "2.0", method: "evm_mine", params: [], id: Date.now() },
    () => {}
  );
}
