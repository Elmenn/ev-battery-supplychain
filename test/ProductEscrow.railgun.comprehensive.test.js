const ProductEscrow = artifacts.require("ProductEscrow");
const ProductFactory = artifacts.require("ProductFactory");

contract("ProductEscrow - Railgun Integration (Comprehensive)", accounts => {
    let productEscrow;
    let productFactory;
    const [owner, buyer, transporter, unauthorized1, unauthorized2] = accounts;
    
    const productName = "Test Battery";
    const productPrice = web3.utils.toWei("1", "ether");
    const saltBytes32 = web3.utils.keccak256("salt123");
    
    // Commit with the SAME types the contract uses:
    const priceCommitment = web3.utils.soliditySha3(
        { t: 'uint256', v: productPrice },
        { t: 'bytes32', v: saltBytes32 }
    );
    
    const deliveryFee = web3.utils.toWei("0.1", "ether");
    
    beforeEach(async () => {
        productFactory = await ProductFactory.new();
        const tx = await productFactory.createProduct(productName, priceCommitment, { from: owner });
        
        const productAddress = tx.logs.find(log => log.event === 'ProductCreated')?.args.productAddress;
        console.log('Product created at address:', productAddress);
        
        if (!productAddress) {
            throw new Error('Product address is undefined. Check if ProductFactory.createProduct is working correctly.');
        }
        
        productEscrow = await ProductEscrow.at(productAddress);
    });

    // Helper function to setup a product to Bound phase
    async function setupProductToBound() {
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

    describe("Phase Gating & Authorization", () => {
        it("should reject recordPrivatePayment before Bound phase", async () => {
            // Only deposit, don't confirm order
            await productEscrow.depositPurchase(
                priceCommitment,
                web3.utils.keccak256("valueCommitment"),
                "0x",
                { from: buyer, value: productPrice }
            );
            
            const memoHash = web3.utils.keccak256("test-memo");
            const railgunTxRef = web3.utils.keccak256("railgun-tx-ref");
            
            try {
                await productEscrow.recordPrivatePayment(await productEscrow.id(), memoHash, railgunTxRef, { from: buyer });
                assert.fail("Should have thrown an error");
            } catch (error) {
                console.log("Actual error message:", error.message);
                assert(error.message.includes("WrongPhase") || error.message.includes("revert"), "Should reject before Bound phase");
            }
        });

        it("should reject recordPrivatePayment in Listed phase", async () => {
            // Don't do any setup - leave product in Listed phase
            
            const memoHash = web3.utils.keccak256("test-memo");
            const railgunTxRef = web3.utils.keccak256("railgun-tx-ref");
            
            try {
                await productEscrow.recordPrivatePayment(await productEscrow.id(), memoHash, railgunTxRef, { from: buyer });
                assert.fail("Should have thrown an error");
            } catch (error) {
                console.log("Listed phase error:", error.message);
                assert(error.message.includes("WrongPhase") || error.message.includes("revert") || error.message.includes("Custom error"), "Should reject in Listed phase");
            }
        });

        it("should reject recordPrivatePayment without transporter set", async () => {
            await productEscrow.depositPurchase(
                priceCommitment,
                web3.utils.keccak256("valueCommitment"),
                "0x",
                { from: buyer, value: productPrice }
            );
            
            await productEscrow.confirmOrder("ipfs://test-vc", { from: owner });
            // Don't set transporter - we're in OrderConfirmed phase, not Bound
            
            const memoHash = web3.utils.keccak256("test-memo");
            const railgunTxRef = web3.utils.keccak256("railgun-tx-ref");
            
            try {
                await productEscrow.recordPrivatePayment(await productEscrow.id(), memoHash, railgunTxRef, { from: buyer });
                assert.fail("Should have thrown an error");
            } catch (error) {
                console.log("OrderConfirmed phase error:", error.message);
                assert(error.message.includes("WrongPhase") || error.message.includes("revert") || error.message.includes("Custom error"), "Should reject in OrderConfirmed phase");
            }
        });
    });

    describe("Input Validation & Sanity Checks", () => {
        beforeEach(async () => {
            await setupProductToBound();
        });

        it("should reject zero memoHash", async () => {
            const railgunTxRef = web3.utils.keccak256("railgun-tx-ref");
            
            try {
                await productEscrow.recordPrivatePayment(await productEscrow.id(), "0x0000000000000000000000000000000000000000000000000000000000000000", railgunTxRef, { from: buyer });
                assert.fail("Should have thrown an error");
            } catch (error) {
                console.log("Zero memoHash error:", error.message);
                assert(error.message.includes("ZeroMemoHash") || error.message.includes("revert") || error.message.includes("Custom error"), "Should reject zero memoHash");
            }
        });

        it("should reject zero railgunTxRef", async () => {
            const memoHash = web3.utils.keccak256("test-memo");
            
            try {
                await productEscrow.recordPrivatePayment(await productEscrow.id(), memoHash, "0x0000000000000000000000000000000000000000000000000000000000000000", { from: buyer });
                assert.fail("Should have thrown an error");
            } catch (error) {
                console.log("Zero railgunTxRef error:", error.message);
                assert(error.message.includes("ZeroTxRef") || error.message.includes("revert") || error.message.includes("Custom error"), "Should reject zero railgunTxRef");
            }
        });
    });

    describe("Authorization & Access Control", () => {
        beforeEach(async () => {
            await setupProductToBound();
        });

        it("should allow buyer to record payment", async () => {
            const memoHash = web3.utils.keccak256("test-memo");
            const railgunTxRef = web3.utils.keccak256("railgun-tx-ref");
            
            // Debug: Check the product ID
            const productId = await productEscrow.id();
            console.log("Product ID:", productId.toString());
            
            await productEscrow.recordPrivatePayment(productId, memoHash, railgunTxRef, { from: buyer });
            
            const hasPayment = await productEscrow.hasPrivatePayment();
            assert.isTrue(hasPayment, "Buyer should be able to record payment");
        });

        it("should allow seller to record payment", async () => {
            const memoHash = web3.utils.keccak256("test-memo");
            const railgunTxRef = web3.utils.keccak256("railgun-tx-ref");
            
            await productEscrow.recordPrivatePayment(await productEscrow.id(), memoHash, railgunTxRef, { from: owner });
            
            const hasPayment = await productEscrow.hasPrivatePayment();
            assert.isTrue(hasPayment, "Seller should be able to record payment");
        });

        it("should allow transporter to record payment", async () => {
            const memoHash = web3.utils.keccak256("test-memo");
            const railgunTxRef = web3.utils.keccak256("railgun-tx-ref");
            
            await productEscrow.recordPrivatePayment(await productEscrow.id(), memoHash, railgunTxRef, { from: transporter });
            
            const hasPayment = await productEscrow.hasPrivatePayment();
            assert.isTrue(hasPayment, "Transporter should be able to record payment");
        });

        it("should reject unauthorized account", async () => {
            const memoHash = web3.utils.keccak256("test-memo");
            const railgunTxRef = web3.utils.keccak256("railgun-tx-ref");
            
            try {
                await productEscrow.recordPrivatePayment(await productEscrow.id(), memoHash, railgunTxRef, { from: unauthorized1 });
                assert.fail("Should have thrown an error");
            } catch (error) {
                console.log("Unauthorized account error:", error.message);
                assert(error.message.includes("NotParticipant") || error.message.includes("revert") || error.message.includes("Custom error"), "Should reject unauthorized account");
            }
        });

        it("should reject another unauthorized account", async () => {
            const memoHash = web3.utils.keccak256("test-memo");
            const railgunTxRef = web3.utils.keccak256("railgun-tx-ref");
            
            try {
                await productEscrow.recordPrivatePayment(await productEscrow.id(), memoHash, railgunTxRef, { from: unauthorized2 });
                assert.fail("Should have thrown an error");
            } catch (error) {
                console.log("Another unauthorized account error:", error.message);
                assert(error.message.includes("NotParticipant") || error.message.includes("revert") || error.message.includes("Custom error"), "Should reject unauthorized account");
            }
        });
    });

    describe("Idempotency & Duplicate Prevention", () => {
        beforeEach(async () => {
            await setupProductToBound();
        });

        it("should prevent duplicate memoHash from same caller", async () => {
            const memoHash = web3.utils.keccak256("test-memo");
            const railgunTxRef = web3.utils.keccak256("railgun-tx-ref");
            
            await productEscrow.recordPrivatePayment(await productEscrow.id(), memoHash, railgunTxRef, { from: buyer });
            
            try {
                await productEscrow.recordPrivatePayment(await productEscrow.id(), memoHash, railgunTxRef, { from: buyer });
                assert.fail("Should have thrown an error");
            } catch (error) {
                console.log("Duplicate same caller error:", error.message);
                assert(error.message.includes("Exists") || error.message.includes("revert"), "Should prevent duplicate from same caller");
            }
        });

        it("should prevent duplicate memoHash from different caller", async () => {
            const memoHash = web3.utils.keccak256("test-memo");
            const railgunTxRef = web3.utils.keccak256("railgun-tx-ref");
            
            await productEscrow.recordPrivatePayment(await productEscrow.id(), memoHash, railgunTxRef, { from: buyer });
            
            try {
                await productEscrow.recordPrivatePayment(await productEscrow.id(), memoHash, railgunTxRef, { from: owner });
                assert.fail("Should have thrown an error");
            } catch (error) {
                console.log("Duplicate different caller error:", error.message);
                assert(error.message.includes("Exists") || error.message.includes("revert"), "Should prevent duplicate from different caller");
            }
        });

        it("should reject second payment for same product even with different memoHash", async () => {
            const memoHash1 = web3.utils.keccak256("test-memo-1");
            const memoHash2 = web3.utils.keccak256("test-memo-2");
            const railgunTxRef = web3.utils.keccak256("railgun-tx-ref");
            
            await productEscrow.recordPrivatePayment(await productEscrow.id(), memoHash1, railgunTxRef, { from: buyer });
            
            try {
                await productEscrow.recordPrivatePayment(await productEscrow.id(), memoHash2, railgunTxRef, { from: buyer });
                assert.fail("Should have thrown an error - only one payment per product allowed");
            } catch (error) {
                console.log("Second payment error:", error.message);
                assert(error.message.includes("AlreadyPaid") || error.message.includes("revert") || error.message.includes("Custom error"), "Should reject second payment for same product");
            }
        });
        
        it("should reject recordPrivatePayment after delivery", async () => {
            const memoHash1 = web3.utils.keccak256("test-memo-1");
            const memoHash2 = web3.utils.keccak256("test-memo-2");
            const railgunTxRef = web3.utils.keccak256("railgun-tx-ref");
            
            // Record first payment and complete delivery
            await productEscrow.recordPrivatePayment(await productEscrow.id(), memoHash1, railgunTxRef, { from: buyer });
            await productEscrow.revealAndConfirmDelivery(
                productPrice,
                saltBytes32,
                "ipfs://delivery-vc",
                { from: buyer }
            );
            
            // Try to record another payment after delivery
            try {
                await productEscrow.recordPrivatePayment(await productEscrow.id(), memoHash2, railgunTxRef, { from: buyer });
                assert.fail("Should have thrown an error - cannot record payment after delivery");
            } catch (error) {
                console.log("Post-delivery payment error:", error.message);
                assert(error.message.includes("Delivered") || error.message.includes("revert") || error.message.includes("Custom error"), "Should reject payment after delivery");
            }
        });
        
        it("should prevent memo reuse within the same product", async () => {
            const memoHash1 = web3.utils.keccak256("test-memo-1");
            const memoHash2 = web3.utils.keccak256("test-memo-2");
            const railgunTxRef = web3.utils.keccak256("railgun-tx-ref");
            
            // Record first payment
            await productEscrow.recordPrivatePayment(await productEscrow.id(), memoHash1, railgunTxRef, { from: buyer });
            
            // Try to record a different memoHash on the same product (should fail due to AlreadyPaid)
            try {
                await productEscrow.recordPrivatePayment(await productEscrow.id(), memoHash2, railgunTxRef, { from: buyer });
                assert.fail("Should have thrown an error - cannot record second payment for same product");
            } catch (error) {
                console.log("Memo reuse within product error:", error.message);
                assert(error.message.includes("AlreadyPaid") || error.message.includes("revert") || error.message.includes("Custom error"), "Should prevent second payment for same product");
            }
        });
        
        it("should allow different memoHashes on different products", async () => {
            const memoHash1 = web3.utils.keccak256("test-memo-1");
            const memoHash2 = web3.utils.keccak256("test-memo-2");
            const railgunTxRef = web3.utils.keccak256("railgun-tx-ref");
            
            // Record payment on first product
            await productEscrow.recordPrivatePayment(await productEscrow.id(), memoHash1, railgunTxRef, { from: buyer });
            
            // Create second product
            const tx2 = await productFactory.createProduct("Test Battery 2", priceCommitment, { from: owner });
            const productAddress2 = tx2.logs.find(log => log.event === 'ProductCreated')?.args.productAddress;
            const productEscrow2 = await ProductEscrow.at(productAddress2);
            
            // Setup second product
            await productEscrow2.depositPurchase(
                priceCommitment,
                web3.utils.keccak256("valueCommitment"),
                "0x",
                { from: buyer, value: productPrice }
            );
            await productEscrow2.confirmOrder("ipfs://test-vc", { from: owner });
            await productEscrow2.createTransporter(deliveryFee, { from: transporter });
            await productEscrow2.setTransporter(transporter, { from: owner, value: deliveryFee });
            
            // Record payment on second product with different memoHash (should succeed)
            await productEscrow2.recordPrivatePayment(await productEscrow2.id(), memoHash2, railgunTxRef, { from: buyer });
            
            // Verify both products have payments
            assert.isTrue(await productEscrow.hasPrivatePayment(), "First product should have payment");
            assert.isTrue(await productEscrow2.hasPrivatePayment(), "Second product should have payment");
            
            // Verify different memoHashes
            const details1 = await productEscrow.getPrivatePaymentDetails();
            const details2 = await productEscrow2.getPrivatePaymentDetails();
            assert.notEqual(details1[0], details2[0], "Products should have different memoHashes");
        });
    });

    describe("Event Integrity", () => {
        beforeEach(async () => {
            await setupProductToBound();
        });

        it("should emit correct PrivatePaymentRecorded event", async () => {
            const memoHash = web3.utils.keccak256("test-memo");
            const railgunTxRef = web3.utils.keccak256("railgun-tx-ref");
            
            const tx = await productEscrow.recordPrivatePayment(await productEscrow.id(), memoHash, railgunTxRef, { from: buyer });
            
            // Check event emission - find by name instead of assuming index
            const evt = tx.logs.find(l => l.event === 'PrivatePaymentRecorded');
            assert(evt, 'PrivatePaymentRecorded event not found');
            
            // Check event fields
            assert.equal(evt.args.productId.toString(), "1", "Product ID should match");
            assert.equal(evt.args.memoHash, memoHash, "Memo hash should match");
            assert.equal(evt.args.railgunTxRef, railgunTxRef, "Railgun tx ref should match");
            assert.equal(evt.args.recorder, buyer, "Recorder should match");
        });

        it("should emit PaidPrivately event during delivery", async () => {
            const memoHash = web3.utils.keccak256("test-memo");
            const railgunTxRef = web3.utils.keccak256("railgun-tx-ref");
            
            // Record private payment
            await productEscrow.recordPrivatePayment(await productEscrow.id(), memoHash, railgunTxRef, { from: buyer });
            
            // Confirm delivery - use the exact same values and types as the original commitment
            const revealedValue = productPrice; // Same as in priceCommitment
            const blindingFactor = saltBytes32; // Same as in priceCommitment (bytes32)
            
            // Verify our commitment matches the original using the contract's canonical function
            const computedCommitment = await productEscrow.computeCommitment(revealedValue, blindingFactor);
            console.log("Original commitment:", priceCommitment);
            console.log("Computed commitment:", computedCommitment);
            console.log("Revealed value:", revealedValue);
            console.log("Blinding factor:", blindingFactor);
            
            // Verify commitment matches
            assert.equal(computedCommitment, priceCommitment, "commitment mismatch");
            
            const tx = await productEscrow.revealAndConfirmDelivery(
                revealedValue,
                blindingFactor, // Pass the same bytes32 value
                "ipfs://delivery-vc",
                { from: buyer }
            );
            
            // Check for PaidPrivately event
            const paidPrivatelyEvent = tx.logs.find(log => log.event === 'PaidPrivately');
            assert(paidPrivatelyEvent, "Should emit PaidPrivately event");
            assert.equal(paidPrivatelyEvent.args.productId.toString(), "1", "Product ID should match");
            assert.equal(paidPrivatelyEvent.args.memoHash, memoHash, "Memo hash should match");
            assert.equal(paidPrivatelyEvent.args.railgunTxRef, railgunTxRef, "Railgun tx ref should match");
            
            // Verify state change - product should be delivered
            assert.isTrue(await productEscrow.delivered(), "Product should be marked as delivered");
        });
    });

    describe("State Management", () => {
        beforeEach(async () => {
            await setupProductToBound();
        });

        it("should correctly track private payment state", async () => {
            const memoHash = web3.utils.keccak256("test-memo");
            const railgunTxRef = web3.utils.keccak256("railgun-tx-ref");
            
            // Initially no payment
            let hasPayment = await productEscrow.hasPrivatePayment();
            assert.isFalse(hasPayment, "Should initially have no private payment");
            
            // Record payment
            await productEscrow.recordPrivatePayment(await productEscrow.id(), memoHash, railgunTxRef, { from: buyer });
            
            // Check payment exists
            hasPayment = await productEscrow.hasPrivatePayment();
            assert.isTrue(hasPayment, "Should have private payment after recording");
            
            // Check payment details
            const result = await productEscrow.getPrivatePaymentDetails();
            assert.equal(result[0], memoHash, "Memo hash should match");
            assert.equal(result[1], railgunTxRef, "Railgun tx ref should match");
            assert.equal(result[2], buyer, "Recorder should match");
        });

        it("should handle multiple products independently", async () => {
            // Create second product
            const tx2 = await productFactory.createProduct("Test Battery 2", priceCommitment, { from: owner });
            const productAddress2 = tx2.logs.find(log => log.event === 'ProductCreated')?.args.productAddress;
            const productEscrow2 = await ProductEscrow.at(productAddress2);
            
            // Setup second product
            await productEscrow2.depositPurchase(
                priceCommitment,
                web3.utils.keccak256("valueCommitment"),
                "0x",
                { from: buyer, value: productPrice }
            );
            await productEscrow2.confirmOrder("ipfs://test-vc", { from: owner });
            await productEscrow2.createTransporter(deliveryFee, { from: transporter });
            await productEscrow2.setTransporter(transporter, { from: owner, value: deliveryFee });
            
            // Record payment on first product
            const memoHash1 = web3.utils.keccak256("test-memo-1");
            const railgunTxRef1 = web3.utils.keccak256("railgun-tx-ref-1");
            await productEscrow.recordPrivatePayment(await productEscrow.id(), memoHash1, railgunTxRef1, { from: buyer });
            
            // Record payment on second product
            const memoHash2 = web3.utils.keccak256("test-memo-2");
            const railgunTxRef2 = web3.utils.keccak256("railgun-tx-ref-2");
            await productEscrow2.recordPrivatePayment(await productEscrow2.id(), memoHash2, railgunTxRef2, { from: buyer });
            
            // Check both payments exist independently
            const hasPayment1 = await productEscrow.hasPrivatePayment();
            const hasPayment2 = await productEscrow2.hasPrivatePayment();
            assert.isTrue(hasPayment1, "First product should have payment");
            assert.isTrue(hasPayment2, "Second product should have payment");
            
            // Check details are correct
            const result1 = await productEscrow.getPrivatePaymentDetails();
            const result2 = await productEscrow2.getPrivatePaymentDetails();
            assert.equal(result1[0], memoHash1, "First product memo hash should match");
            assert.equal(result2[0], memoHash2, "Second product memo hash should match");
            assert.equal(result1[2], buyer, "First product recorder should match");
            assert.equal(result2[2], buyer, "Second product recorder should match");
        });
    });
}); 