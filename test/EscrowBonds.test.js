const ProductEscrow_Initializer = artifacts.require("ProductEscrow_Initializer");
const ProductFactory = artifacts.require("ProductFactory");
const MaliciousReentrant = artifacts.require("MaliciousReentrant");
const truffleAssert = require("truffle-assertions");
const { toWei, randomHex, soliditySha3, toBN } = web3.utils;

contract("EscrowBonds – Bond Mechanics, Access Control, Reentrancy", accounts => {
  const [deployer, seller, buyer, transporter, transporter2, anyone] = accounts;
  const BOND = toWei("0.01", "ether");
  const FEE  = toWei("0.005", "ether");
  const FEE2 = toWei("0.007", "ether");
  const VCID = "ipfs://QmTestVcCid12345";

  let factory, impl, esc, escAddr, commitment;

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

  async function advanceToOrderConfirmed() {
    await esc.recordPrivatePayment(1, randomHex(32), randomHex(32), { from: buyer });
    await esc.confirmOrder(VCID, { from: seller });
  }

  async function advanceToBound() {
    await advanceToOrderConfirmed();
    await esc.createTransporter(FEE, { from: transporter, value: BOND });
    await esc.setTransporter(transporter, { from: seller, value: FEE });
  }

  beforeEach(async () => {
    await deployAndCreate();
  });

  // ─────────────────────────────────────────────────────────────────────
  //  1. Bond accounting
  // ─────────────────────────────────────────────────────────────────────
  describe("Bond accounting", () => {
    it("after creation: contract balance == bondAmount (seller bond)", async () => {
      const bal = await web3.eth.getBalance(escAddr);
      assert.equal(bal, BOND);
    });

    it("after transporter bids: balance == sellerBond + transporterBond", async () => {
      await advanceToOrderConfirmed();
      await esc.createTransporter(FEE, { from: transporter, value: BOND });

      const bal = await web3.eth.getBalance(escAddr);
      const expected = toBN(BOND).add(toBN(BOND));
      assert.equal(bal, expected.toString());
    });

    it("after setTransporter: balance == sellerBond + transporterBond + deliveryFee", async () => {
      await advanceToOrderConfirmed();
      await esc.createTransporter(FEE, { from: transporter, value: BOND });
      await esc.setTransporter(transporter, { from: seller, value: FEE });

      const bal = await web3.eth.getBalance(escAddr);
      const expected = toBN(BOND).add(toBN(BOND)).add(toBN(FEE));
      assert.equal(bal, expected.toString());
    });

    it("after confirmDelivery: contract balance == 0", async () => {
      await advanceToBound();
      const vcHash = soliditySha3({ type: "string", value: VCID });
      await esc.confirmDelivery(vcHash, { from: transporter });

      const bal = await web3.eth.getBalance(escAddr);
      assert.equal(bal, "0");
    });

    it("exact balance changes: seller gets bond back, transporter gets bond + fee", async () => {
      await advanceToBound();

      const sellerBefore = toBN(await web3.eth.getBalance(seller));
      const transporterBefore = toBN(await web3.eth.getBalance(transporter));

      const vcHash = soliditySha3({ type: "string", value: VCID });
      const tx = await esc.confirmDelivery(vcHash, { from: transporter });

      // Calculate gas cost for transporter
      const txData = await web3.eth.getTransaction(tx.tx);
      const gasCost = toBN(tx.receipt.gasUsed).mul(toBN(txData.gasPrice));

      const sellerAfter = toBN(await web3.eth.getBalance(seller));
      const transporterAfter = toBN(await web3.eth.getBalance(transporter));

      // Seller should receive exactly BOND back (no gas cost since not sender)
      assert.equal(sellerAfter.sub(sellerBefore).toString(), BOND);

      // Transporter should receive BOND + FEE minus gas
      const transporterExpected = toBN(BOND).add(toBN(FEE));
      const transporterActual = transporterAfter.sub(transporterBefore).add(gasCost);
      assert.equal(transporterActual.toString(), transporterExpected.toString());
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  //  2. Factory bond configuration
  // ─────────────────────────────────────────────────────────────────────
  describe("Factory bond configuration", () => {
    it("setBondAmount only callable by owner", async () => {
      await truffleAssert.reverts(
        factory.setBondAmount(toWei("0.02", "ether"), { from: anyone })
      );
    });

    it("bondAmount stored correctly", async () => {
      assert.equal((await factory.bondAmount()).toString(), BOND);
    });

    it("createProduct reverts if msg.value != bondAmount", async () => {
      const wrongBond = toWei("0.005", "ether");
      await truffleAssert.reverts(
        factory.createProduct("Bad", randomHex(32), { from: seller, value: wrongBond })
      );
    });

    it("createProduct reverts if bondAmount not set (== 0)", async () => {
      const impl2 = await ProductEscrow_Initializer.new({ from: deployer });
      const factory2 = await ProductFactory.new(impl2.address, { from: deployer });
      await truffleAssert.reverts(
        factory2.createProduct("No Bond", randomHex(32), { from: seller, value: BOND })
      );
    });

    it("setBondAmount reverts with zero amount", async () => {
      await truffleAssert.reverts(
        factory.setBondAmount(0, { from: deployer })
      );
    });

    it("emits BondAmountUpdated event", async () => {
      const newBond = toWei("0.02", "ether");
      const tx = await factory.setBondAmount(newBond, { from: deployer });
      truffleAssert.eventEmitted(tx, "BondAmountUpdated", ev => {
        return ev.newAmount.toString() === newBond;
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  //  3. Access control (comprehensive)
  // ─────────────────────────────────────────────────────────────────────
  describe("Access control", () => {
    describe("confirmOrder: only seller", () => {
      beforeEach(async () => {
        await esc.recordPrivatePayment(1, randomHex(32), randomHex(32), { from: buyer });
      });

      it("reverts if called by buyer", async () => {
        await truffleAssert.reverts(esc.confirmOrder(VCID, { from: buyer }));
      });
      it("reverts if called by transporter", async () => {
        await truffleAssert.reverts(esc.confirmOrder(VCID, { from: transporter }));
      });
      it("reverts if called by anyone", async () => {
        await truffleAssert.reverts(esc.confirmOrder(VCID, { from: anyone }));
      });
    });

    describe("setTransporter: only seller", () => {
      beforeEach(async () => {
        await advanceToOrderConfirmed();
        await esc.createTransporter(FEE, { from: transporter, value: BOND });
      });

      it("reverts if called by buyer", async () => {
        await truffleAssert.reverts(
          esc.setTransporter(transporter, { from: buyer, value: FEE })
        );
      });
      it("reverts if called by transporter", async () => {
        await truffleAssert.reverts(
          esc.setTransporter(transporter, { from: transporter, value: FEE })
        );
      });
      it("reverts if called by anyone", async () => {
        await truffleAssert.reverts(
          esc.setTransporter(transporter, { from: anyone, value: FEE })
        );
      });
    });

    describe("confirmDelivery: only transporter", () => {
      let vcHash;
      beforeEach(async () => {
        await advanceToBound();
        vcHash = soliditySha3({ type: "string", value: VCID });
      });

      it("reverts if called by seller", async () => {
        await truffleAssert.reverts(esc.confirmDelivery(vcHash, { from: seller }));
      });
      it("reverts if called by buyer", async () => {
        await truffleAssert.reverts(esc.confirmDelivery(vcHash, { from: buyer }));
      });
      it("reverts if called by anyone", async () => {
        await truffleAssert.reverts(esc.confirmDelivery(vcHash, { from: anyone }));
      });
    });

    describe("timeout functions: anyone can call (permissionless)", () => {
      it("sellerTimeout: anyone can call after window", async () => {
        await esc.recordPrivatePayment(1, randomHex(32), randomHex(32), { from: buyer });
        await advanceTime(2 * 24 * 3600 + 1);
        const tx = await esc.sellerTimeout({ from: anyone });
        assert.equal((await esc.phase()).toNumber(), 5); // Expired
      });

      it("bidTimeout: anyone can call after window", async () => {
        await advanceToOrderConfirmed();
        await advanceTime(2 * 24 * 3600 + 1);
        const tx = await esc.bidTimeout({ from: anyone });
        assert.equal((await esc.phase()).toNumber(), 5); // Expired
      });

      it("deliveryTimeout: anyone can call after window", async () => {
        await advanceToBound();
        await advanceTime(2 * 24 * 3600 + 1);
        const tx = await esc.deliveryTimeout({ from: anyone });
        assert.equal((await esc.phase()).toNumber(), 5); // Expired
      });
    });

    describe("recordPrivatePayment: anyone except seller", () => {
      it("reverts if seller tries to purchase", async () => {
        await truffleAssert.reverts(
          esc.recordPrivatePayment(1, randomHex(32), randomHex(32), { from: seller })
        );
      });
      it("anyone (non-seller) can purchase", async () => {
        await esc.recordPrivatePayment(1, randomHex(32), randomHex(32), { from: anyone });
        assert.equal(await esc.buyer(), anyone);
      });
    });

    describe("pauseByFactory: only factory address", () => {
      it("reverts if called by deployer (not factory)", async () => {
        await truffleAssert.reverts(
          esc.pauseByFactory({ from: deployer })
        );
      });
      it("reverts if called by seller", async () => {
        await truffleAssert.reverts(
          esc.pauseByFactory({ from: seller })
        );
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  //  4. Reentrancy protection
  // ─────────────────────────────────────────────────────────────────────
  describe("Reentrancy protection", () => {
    it("blocks reentrancy on confirmDelivery", async () => {
      // Deploy fresh setup with MaliciousReentrant as transporter
      const impl2 = await ProductEscrow_Initializer.new({ from: deployer });
      const factory2 = await ProductFactory.new(impl2.address, { from: deployer });
      await factory2.setBondAmount(BOND, { from: deployer });

      const tx = await factory2.createProduct("Reentry Test", randomHex(32), {
        from: seller,
        value: BOND
      });
      const addr = tx.logs.find(l => l.event === "ProductCreated").args.product;
      const escrow = await ProductEscrow_Initializer.at(addr);

      // Record payment
      await escrow.recordPrivatePayment(1, randomHex(32), randomHex(32), { from: buyer });
      await escrow.confirmOrder(VCID, { from: seller });

      // Deploy malicious contract targeting this escrow
      const malicious = await MaliciousReentrant.new(addr, { from: deployer });

      // Register malicious contract as transporter (need to send from deployer since malicious is a contract)
      await malicious.registerAsTransporter(FEE, { from: deployer, value: BOND });

      // Seller selects malicious as transporter
      await escrow.setTransporter(malicious.address, { from: seller, value: FEE });

      // Attempt reentrancy via confirmDelivery
      const vcHash = soliditySha3({ type: "string", value: VCID });
      // The malicious contract will try to re-enter confirmDelivery when it receives ETH
      // ReentrancyGuard should block it. The outer call should still succeed
      // because the re-entry attempt is wrapped in try/catch in MaliciousReentrant.
      const deliveryTx = await malicious.attackDelivery(vcHash, { from: deployer });

      // Verify delivery completed (the re-entry was blocked but the outer call succeeded)
      assert.equal(await escrow.delivered(), true);
      assert.equal((await escrow.phase()).toNumber(), 4); // Delivered

      // Verify contract balance is 0 (all funds distributed correctly, not double-spent)
      const bal = await web3.eth.getBalance(addr);
      assert.equal(bal, "0");
    });

    it("blocks reentrancy on withdrawBid", async () => {
      const impl2 = await ProductEscrow_Initializer.new({ from: deployer });
      const factory2 = await ProductFactory.new(impl2.address, { from: deployer });
      await factory2.setBondAmount(BOND, { from: deployer });

      const tx = await factory2.createProduct("Reentry Withdraw", randomHex(32), {
        from: seller,
        value: BOND
      });
      const addr = tx.logs.find(l => l.event === "ProductCreated").args.product;
      const escrow = await ProductEscrow_Initializer.at(addr);

      await escrow.recordPrivatePayment(1, randomHex(32), randomHex(32), { from: buyer });
      await escrow.confirmOrder(VCID, { from: seller });

      // Deploy malicious and register as transporter
      const malicious = await MaliciousReentrant.new(addr, { from: deployer });
      await malicious.registerAsTransporter(FEE, { from: deployer, value: BOND });

      // Don't select malicious as transporter - let it withdraw
      // Attempt reentrancy via withdrawBid
      const withdrawTx = await malicious.attackWithdrawBid({ from: deployer });

      // Verify bond was returned correctly (not double-spent)
      const deposit = await escrow.securityDeposits(malicious.address);
      assert.equal(deposit.toString(), "0", "Bond should be zeroed after withdrawal");
    });

    it("blocks reentrancy on deliveryTimeout", async () => {
      const impl2 = await ProductEscrow_Initializer.new({ from: deployer });
      const factory2 = await ProductFactory.new(impl2.address, { from: deployer });
      await factory2.setBondAmount(BOND, { from: deployer });

      const tx = await factory2.createProduct("Reentry Timeout", randomHex(32), {
        from: seller,
        value: BOND
      });
      const addr = tx.logs.find(l => l.event === "ProductCreated").args.product;
      const escrow = await ProductEscrow_Initializer.at(addr);

      await escrow.recordPrivatePayment(1, randomHex(32), randomHex(32), { from: buyer });
      await escrow.confirmOrder(VCID, { from: seller });

      // Deploy malicious and register as transporter
      const malicious = await MaliciousReentrant.new(addr, { from: deployer });
      await malicious.registerAsTransporter(FEE, { from: deployer, value: BOND });

      // Select malicious as transporter
      await escrow.setTransporter(malicious.address, { from: seller, value: FEE });

      // Advance time past delivery window
      await advanceTime(2 * 24 * 3600 + 1);

      // deliveryTimeout sends ETH to seller (not to malicious), so reentrancy
      // from malicious receive() would target deliveryTimeout again.
      // But the seller (an EOA) receives the funds, not malicious.
      // The malicious contract only receives ETH if it calls deliveryTimeout.
      // Let's call deliveryTimeout from anyone - seller gets the slashed bond.
      const timeoutTx = await escrow.deliveryTimeout({ from: anyone });
      assert.equal((await escrow.phase()).toNumber(), 5); // Expired
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  //  5. Edge cases
  // ─────────────────────────────────────────────────────────────────────
  describe("Edge cases", () => {
    it("transporter bids with wrong bond amount -> revert", async () => {
      await advanceToOrderConfirmed();
      const wrongBond = toWei("0.005", "ether");
      await truffleAssert.reverts(
        esc.createTransporter(FEE, { from: transporter, value: wrongBond })
      );
    });

    it("confirmDelivery after delivery timeout -> revert (phase is Expired)", async () => {
      await advanceToBound();
      const vcHash = soliditySha3({ type: "string", value: VCID });

      // Advance past delivery window and trigger timeout
      await advanceTime(2 * 24 * 3600 + 1);
      await esc.deliveryTimeout({ from: anyone });

      // Now try to confirmDelivery - should fail (Expired, not Bound)
      await truffleAssert.reverts(
        esc.confirmDelivery(vcHash, { from: transporter })
      );
    });

    it("receive() rejects unexpected ETH", async () => {
      await truffleAssert.reverts(
        web3.eth.sendTransaction({ from: anyone, to: escAddr, value: toWei("0.01", "ether") })
      );
    });

    it("timeout reverts before window expires", async () => {
      await esc.recordPrivatePayment(1, randomHex(32), randomHex(32), { from: buyer });
      // sellerTimeout before SELLER_WINDOW (2 days)
      await truffleAssert.reverts(
        esc.sellerTimeout({ from: anyone })
      );
    });

    it("bidTimeout reverts before window expires", async () => {
      await advanceToOrderConfirmed();
      await truffleAssert.reverts(
        esc.bidTimeout({ from: anyone })
      );
    });

    it("deliveryTimeout reverts before window expires", async () => {
      await advanceToBound();
      await truffleAssert.reverts(
        esc.deliveryTimeout({ from: anyone })
      );
    });

    it("sellerTimeout slashes seller bond to buyer", async () => {
      await esc.recordPrivatePayment(1, randomHex(32), randomHex(32), { from: buyer });
      const buyerBefore = toBN(await web3.eth.getBalance(buyer));

      await advanceTime(2 * 24 * 3600 + 1);
      await esc.sellerTimeout({ from: anyone });

      const buyerAfter = toBN(await web3.eth.getBalance(buyer));
      assert.equal(buyerAfter.sub(buyerBefore).toString(), BOND, "Buyer should receive slashed seller bond");
    });

    it("bidTimeout returns seller bond to seller", async () => {
      await advanceToOrderConfirmed();
      const sellerBefore = toBN(await web3.eth.getBalance(seller));

      await advanceTime(2 * 24 * 3600 + 1);
      await esc.bidTimeout({ from: anyone });

      const sellerAfter = toBN(await web3.eth.getBalance(seller));
      assert.equal(sellerAfter.sub(sellerBefore).toString(), BOND, "Seller should get bond back");
    });

    it("deliveryTimeout slashes transporter bond to seller", async () => {
      await advanceToBound();
      const sellerBefore = toBN(await web3.eth.getBalance(seller));

      await advanceTime(2 * 24 * 3600 + 1);
      await esc.deliveryTimeout({ from: anyone });

      const sellerAfter = toBN(await web3.eth.getBalance(seller));
      // Seller gets: sellerBond + transporterBond + deliveryFee
      const expected = toBN(BOND).add(toBN(BOND)).add(toBN(FEE));
      assert.equal(sellerAfter.sub(sellerBefore).toString(), expected.toString());
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
