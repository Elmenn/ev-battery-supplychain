const ProductEscrow = artifacts.require("ProductEscrow");
const ProductFactory = artifacts.require("ProductFactory");

contract("ProductEscrow - Railgun Integration", accounts => {
  let productEscrow;
  let productFactory;
  const [owner, buyer, transporter] = accounts;

  const productName  = "Test Battery";
  const productPrice = web3.utils.toWei("1", "ether");
  const deliveryFee  = web3.utils.toWei("0.1", "ether");
  const saltBytes32  = web3.utils.soliditySha3("salt123"); // bytes32 salt

  // Canonical commitment: keccak256(abi.encodePacked(uint256 value, bytes32 salt))
  const priceCommitment = web3.utils.soliditySha3(
    { t: "uint256", v: productPrice },
    { t: "bytes32", v: saltBytes32 }
  );

  beforeEach(async () => {
    productFactory = await ProductFactory.new();
    const tx = await productFactory.createProduct(productName, priceCommitment, { from: owner });

    const productAddress = tx.logs.find(l => l.event === "ProductCreated")?.args.productAddress;
    assert(productAddress, "Product address not emitted");
    productEscrow = await ProductEscrow.at(productAddress);
  });

  describe("Railgun Integration", () => {
    async function setupBoundPhase() {
      await productEscrow.depositPurchase(
        priceCommitment,
        web3.utils.keccak256("valueCommitment"),
        "0x",
        { from: buyer, value: productPrice }
      );
      await productEscrow.confirmOrder("ipfs://test-vc", { from: owner });
      await productEscrow.createTransporter(deliveryFee, { from: transporter });
      await productEscrow.setTransporter(transporter, { from: owner, value: deliveryFee });
    }

    it("should allow recording private payment", async () => {
      await setupBoundPhase();

      const memoHash     = web3.utils.randomHex(32);
      const railgunTxRef = web3.utils.randomHex(32);

      const productId = (await productEscrow.id()).toString();

      await productEscrow.recordPrivatePayment(productId, memoHash, railgunTxRef, { from: buyer });

      const hasPayment = await productEscrow.hasPrivatePayment();
      assert.isTrue(hasPayment, "Private payment should be recorded");

      const result = await productEscrow.getPrivatePaymentDetails();
      const storedMemo = result[0];
      const storedRef = result[1];
      const recorder = result[2];
      assert.equal(storedMemo, memoHash, "Memo hash should match");
      assert.equal(storedRef, railgunTxRef, "Railgun tx ref should match");
      assert.equal(recorder, buyer, "Recorder should match");
    });

    it("should prevent duplicate payment recording", async () => {
      await setupBoundPhase();

      const memoHash     = web3.utils.randomHex(32);
      const railgunTxRef = web3.utils.randomHex(32);
      const productId    = (await productEscrow.id()).toString();

      await productEscrow.recordPrivatePayment(productId, memoHash, railgunTxRef, { from: buyer });

      try {
        await productEscrow.recordPrivatePayment(productId, memoHash, railgunTxRef, { from: buyer });
        assert.fail("Expected revert on duplicate memoHash");
      } catch (err) {
        assert(
          err.message.includes("revert") || err.message.includes("Exists") || err.message.includes("already"),
          "Should prevent duplicate recording"
        );
      }
    });

    it("should only allow authorized parties to record payment", async () => {
      await setupBoundPhase();

      const memoHash     = web3.utils.randomHex(32);
      const railgunTxRef = web3.utils.randomHex(32);
      const productId    = (await productEscrow.id()).toString();

      try {
        await productEscrow.recordPrivatePayment(productId, memoHash, railgunTxRef, { from: accounts[5] });
        assert.fail("Expected revert for unauthorized caller");
      } catch (err) {
        assert(
          err.message.includes("revert") || err.message.includes("NotParticipant") || err.message.toLowerCase().includes("unauthorized"),
          "Should prevent unauthorized recording"
        );
      }
    });

    it("should emit correct events when recording payment", async () => {
      await setupBoundPhase();

      const memoHash     = web3.utils.randomHex(32);
      const railgunTxRef = web3.utils.randomHex(32);
      const productId    = (await productEscrow.id()).toString();

      const tx = await productEscrow.recordPrivatePayment(productId, memoHash, railgunTxRef, { from: buyer });

      const evt = tx.logs.find(l => l.event === "PrivatePaymentRecorded");
      assert(evt, "PrivatePaymentRecorded not found");

      assert.equal(evt.args.productId.toString(), productId, "Product ID should match");
      assert.equal(evt.args.memoHash, memoHash, "Memo hash should match");
      assert.equal(evt.args.railgunTxRef, railgunTxRef, "Railgun tx ref should match");
      assert.equal(evt.args.recorder, buyer, "Recorder should match");
    });
  });
});
