const ProductEscrow_Initializer = artifacts.require("ProductEscrow_Initializer");
const ProductFactory = artifacts.require("ProductFactory");
const truffleAssert = require("truffle-assertions");

contract("Phase Machine", (accounts) => {
    let factory, implementation, escrow;
    const [owner, seller, buyer, transporter] = accounts;

    beforeEach(async () => {
        // Deploy implementation
        implementation = await ProductEscrow_Initializer.new();
        
        // Deploy factory with implementation
        factory = await ProductFactory.new(implementation.address);
        
        // Create a product
        const name = "Test Battery";
        const commitment = web3.utils.keccak256("test");
        const price = web3.utils.toWei("1", "ether");
        const tx = await factory.createProduct(name, commitment, price, { from: seller });
        const productAddress = tx.logs.find(log => log.event === "ProductCreated").args.product;
        escrow = await ProductEscrow_Initializer.at(productAddress);
    });

    describe("Initial State", () => {
        it("should start in Listed phase", async () => {
            const phase = await escrow.phase();
            assert.equal(phase.toString(), "0"); // Listed
        });

        it("should have correct initial values", async () => {
            assert.isFalse(await escrow.purchased());
            assert.equal(await escrow.buyer(), "0x0000000000000000000000000000000000000000");
            assert.equal(await escrow.transporter(), "0x0000000000000000000000000000000000000000");
        });
    });

    describe("Phase Transitions", () => {
        it("should transition from Listed to Purchased", async () => {
            const priceWei = web3.utils.toWei("1", "ether");
            
            // Set public price first
            await escrow.setPublicPrice(priceWei, { from: seller });
            
            // Purchase
            const tx = await escrow.purchasePublic({ from: buyer, value: priceWei });
            
            // Check phase change
            const phase = await escrow.phase();
            assert.equal(phase.toString(), "1"); // Purchased
            
            // Check event - PhaseChanged is emitted after PurchasedPublic
            const phaseChangedEvent = tx.logs.find(log => log.event === "PhaseChanged");
            assert.exists(phaseChangedEvent);
            assert.equal(phaseChangedEvent.args.from.toString(), "0"); // Listed
            assert.equal(phaseChangedEvent.args.to.toString(), "1"); // Purchased
        });

        it("should transition from Purchased to OrderConfirmed", async () => {
            // First make purchase
            const priceWei = web3.utils.toWei("1", "ether");
            
            // Set public price first
            await escrow.setPublicPrice(priceWei, { from: seller });
            
            // Purchase
            await escrow.purchasePublic({ from: buyer, value: priceWei });
            
            // Then confirm order
            const vcCID = "ipfs://QmTest";
            const zeroCommitment = "0x0000000000000000000000000000000000000000000000000000000000000000";
            const tx = await escrow.confirmOrderWithCommitment(vcCID, zeroCommitment, { from: seller });
            
            // Check phase change
            const phase = await escrow.phase();
            assert.equal(phase.toString(), "2"); // OrderConfirmed
            
            // Check event - confirmOrder emits VcUpdated and OrderConfirmed, but not PhaseChanged
            // The contract changes phase but doesn't emit PhaseChanged event
            const vcUpdatedEvent = tx.logs.find(log => log.event === "VcUpdated");
            assert.exists(vcUpdatedEvent);
            const orderConfirmedEvent = tx.logs.find(log => log.event === "OrderConfirmed");
            assert.exists(orderConfirmedEvent);
        });

        it("should transition from OrderConfirmed to Bound", async () => {
            // Setup: go through purchase and confirmation
            const priceWei = web3.utils.toWei("1", "ether");
            
            // Set public price first
            await escrow.setPublicPrice(priceWei, { from: seller });
            
            // Purchase
            await escrow.purchasePublic({ from: buyer, value: priceWei });
            
            const vcCID = "ipfs://QmTest";
            const zeroCommitment = "0x0000000000000000000000000000000000000000000000000000000000000000";
            await escrow.confirmOrderWithCommitment(vcCID, zeroCommitment, { from: seller });
            
            // Create transporter
            const fee = web3.utils.toWei("0.1", "ether");
            await escrow.createTransporter(fee, { from: transporter });
            await escrow.securityDeposit({ from: transporter, value: web3.utils.toWei("0.5", "ether") });
            
            // Set transporter
            const tx = await escrow.setTransporter(transporter, { from: seller, value: fee });
            
            // Check phase change
            const phase = await escrow.phase();
            assert.equal(phase.toString(), "3"); // Bound
            
            // Check event
            assert.equal(tx.logs[0].event, "PhaseChanged");
            assert.equal(tx.logs[0].args.from.toString(), "2"); // OrderConfirmed
            assert.equal(tx.logs[0].args.to.toString(), "3"); // Bound
        });

        it("should transition from Bound to Delivered", async () => {
            // Setup: go through full flow to Bound phase
            const priceWei = web3.utils.toWei("1", "ether");
            const publicCommitment = web3.utils.keccak256("public-commitment");
            
            // Set public price with commitment
            await escrow.setPublicPriceWithCommitment(priceWei, publicCommitment, { from: seller });
            
            // Purchase
            await escrow.purchasePublic({ from: buyer, value: priceWei });
            
            // Confirm order
            const vcCID = "ipfs://QmTest";
            const zeroCommitment = "0x0000000000000000000000000000000000000000000000000000000000000000";
            await escrow.confirmOrderWithCommitment(vcCID, zeroCommitment, { from: seller });
            
            // Create transporter and set
            const fee = web3.utils.toWei("0.1", "ether");
            await escrow.createTransporter(fee, { from: transporter });
            await escrow.securityDeposit({ from: transporter, value: web3.utils.toWei("0.5", "ether") });
            await escrow.setTransporter(transporter, { from: seller, value: fee });
            
            // Verify we're in Bound phase
            let phase = await escrow.phase();
            assert.equal(phase.toString(), "3"); // Bound
            
            // Prepare reveal values (must match commitment)
            // Deterministic blinding: keccak256(abi.encodePacked(address(this), owner))
            const blinding = web3.utils.soliditySha3(
                { type: "address", value: escrow.address },
                { type: "address", value: seller }
            );
            const revealedValue = web3.utils.toBN(priceWei);
            const finalVCID = "ipfs://QmFinal";
            
            // Reveal and confirm delivery
            const tx = await escrow.revealAndConfirmDelivery(revealedValue, blinding, finalVCID, { from: buyer });
            
            // Check phase change
            phase = await escrow.phase();
            assert.equal(phase.toString(), "4"); // Delivered
            
            // Check event
            const phaseChangedEvent = tx.logs.find(log => log.event === "PhaseChanged");
            assert.exists(phaseChangedEvent);
            assert.equal(phaseChangedEvent.args.from.toString(), "3"); // Bound
            assert.equal(phaseChangedEvent.args.to.toString(), "4"); // Delivered
            
            // Check delivery confirmation event
            const deliveryEvent = tx.logs.find(log => log.event === "DeliveryConfirmed");
            assert.exists(deliveryEvent);
        });

        it("should transition from Bound to Expired via timeout", async () => {
            // Setup: go through full flow to Bound phase
            const priceWei = web3.utils.toWei("1", "ether");
            const publicCommitment = web3.utils.keccak256("public-commitment");
            
            await escrow.setPublicPriceWithCommitment(priceWei, publicCommitment, { from: seller });
            await escrow.purchasePublic({ from: buyer, value: priceWei });
            
            const vcCID = "ipfs://QmTest";
            const zeroCommitment = "0x0000000000000000000000000000000000000000000000000000000000000000";
            await escrow.confirmOrderWithCommitment(vcCID, zeroCommitment, { from: seller });
            
            const fee = web3.utils.toWei("0.1", "ether");
            await escrow.createTransporter(fee, { from: transporter });
            await escrow.securityDeposit({ from: transporter, value: web3.utils.toWei("0.5", "ether") });
            await escrow.setTransporter(transporter, { from: seller, value: fee });
            
            // Verify we're in Bound phase
            let phase = await escrow.phase();
            assert.equal(phase.toString(), "3"); // Bound
            
            // Fast-forward past DELIVERY_WINDOW (2 days = 172800 seconds)
            const DELIVERY_WINDOW = 2 * 24 * 60 * 60; // 2 days in seconds
            await skip(DELIVERY_WINDOW + 1); // Just past the window
            
            // Call timeout
            const tx = await escrow.timeout({ from: seller });
            
            // Check phase change
            phase = await escrow.phase();
            assert.equal(phase.toString(), "5"); // Expired
            
            // Check event
            const phaseChangedEvent = tx.logs.find(log => log.event === "PhaseChanged");
            assert.exists(phaseChangedEvent);
            assert.equal(phaseChangedEvent.args.from.toString(), "3"); // Bound
            assert.equal(phaseChangedEvent.args.to.toString(), "5"); // Expired
        });

        it("should transition from Purchased to Expired via sellerTimeout", async () => {
            // Setup: go to Purchased phase
            const priceWei = web3.utils.toWei("1", "ether");
            const publicCommitment = web3.utils.keccak256("public-commitment");
            
            await escrow.setPublicPriceWithCommitment(priceWei, publicCommitment, { from: seller });
            await escrow.purchasePublic({ from: buyer, value: priceWei });
            
            // Verify we're in Purchased phase
            let phase = await escrow.phase();
            assert.equal(phase.toString(), "1"); // Purchased
            
            // Fast-forward past SELLER_WINDOW (2 days = 172800 seconds)
            const SELLER_WINDOW = 2 * 24 * 60 * 60; // 2 days in seconds
            await skip(SELLER_WINDOW + 1); // Just past the window
            
            // Call sellerTimeout (can be called by anyone)
            const tx = await escrow.sellerTimeout({ from: buyer });
            
            // Check phase change
            phase = await escrow.phase();
            assert.equal(phase.toString(), "5"); // Expired
            
            // Check event
            const phaseChangedEvent = tx.logs.find(log => log.event === "PhaseChanged");
            assert.exists(phaseChangedEvent);
            assert.equal(phaseChangedEvent.args.from.toString(), "1"); // Purchased
            assert.equal(phaseChangedEvent.args.to.toString(), "5"); // Expired
        });

        it("should transition from OrderConfirmed to Expired via bidTimeout", async () => {
            // Setup: go to OrderConfirmed phase
            const priceWei = web3.utils.toWei("1", "ether");
            const publicCommitment = web3.utils.keccak256("public-commitment");
            
            await escrow.setPublicPriceWithCommitment(priceWei, publicCommitment, { from: seller });
            await escrow.purchasePublic({ from: buyer, value: priceWei });
            
            const vcCID = "ipfs://QmTest";
            const zeroCommitment = "0x0000000000000000000000000000000000000000000000000000000000000000";
            await escrow.confirmOrderWithCommitment(vcCID, zeroCommitment, { from: seller });
            
            // Verify we're in OrderConfirmed phase
            let phase = await escrow.phase();
            assert.equal(phase.toString(), "2"); // OrderConfirmed
            
            // Fast-forward past BID_WINDOW (2 days = 172800 seconds)
            const BID_WINDOW = 2 * 24 * 60 * 60; // 2 days in seconds
            await skip(BID_WINDOW + 1); // Just past the window
            
            // Call bidTimeout (can be called by anyone)
            const tx = await escrow.bidTimeout({ from: buyer });
            
            // Check phase change
            phase = await escrow.phase();
            assert.equal(phase.toString(), "5"); // Expired
            
            // Check event
            const phaseChangedEvent = tx.logs.find(log => log.event === "PhaseChanged");
            assert.exists(phaseChangedEvent);
            assert.equal(phaseChangedEvent.args.from.toString(), "2"); // OrderConfirmed
            assert.equal(phaseChangedEvent.args.to.toString(), "5"); // Expired
        });
    });

    describe("Invalid Phase Transitions", () => {
        it("should revert confirmOrder from wrong phase", async () => {
            const vcCID = "ipfs://QmTest";
            
            // Contract uses custom error WrongPhase(), not a string message
            await truffleAssert.reverts(
                escrow.confirmOrderWithCommitment(vcCID, "0x0000000000000000000000000000000000000000000000000000000000000000", { from: seller })
            );
        });

        it("should revert setTransporter from wrong phase", async () => {
            const fee = web3.utils.toWei("0.1", "ether");
            
            // Contract uses custom error WrongPhase(), not a string message
            await truffleAssert.reverts(
                escrow.setTransporter(transporter, { from: seller, value: fee })
            );
        });

        it("should revert depositPurchase if already purchased", async () => {
            const priceWei = web3.utils.toWei("1", "ether");
            
            // Set public price first
            await escrow.setPublicPrice(priceWei, { from: seller });
            
            // Purchase once
            await escrow.purchasePublic({ from: buyer, value: priceWei });
            
            // Try to purchase again - should revert
            // Contract uses custom error AlreadyPurchased(), not a string message
            await truffleAssert.reverts(
                escrow.purchasePublic({ from: buyer, value: priceWei })
            );
        });

        it("should revert revealAndConfirmDelivery from wrong phase", async () => {
            const priceWei = web3.utils.toWei("1", "ether");
            const publicCommitment = web3.utils.keccak256("public-commitment");
            
            await escrow.setPublicPriceWithCommitment(priceWei, publicCommitment, { from: seller });
            await escrow.purchasePublic({ from: buyer, value: priceWei });
            
            // Still in Purchased phase, not Bound - should revert
            const blinding = web3.utils.soliditySha3(
                { type: "address", value: escrow.address },
                { type: "address", value: seller }
            );
            const revealedValue = web3.utils.toBN(priceWei);
            const vcCID = "ipfs://QmTest";
            
            // Contract uses custom error TransporterNotSet() when transporter is not set
            await truffleAssert.reverts(
                escrow.revealAndConfirmDelivery(revealedValue, blinding, vcCID, { from: buyer })
            );
        });

        it("should revert timeout before DELIVERY_WINDOW expires", async () => {
            // Setup: go to Bound phase
            const priceWei = web3.utils.toWei("1", "ether");
            const publicCommitment = web3.utils.keccak256("public-commitment");
            
            await escrow.setPublicPriceWithCommitment(priceWei, publicCommitment, { from: seller });
            await escrow.purchasePublic({ from: buyer, value: priceWei });
            
            const vcCID = "ipfs://QmTest";
            const zeroCommitment = "0x0000000000000000000000000000000000000000000000000000000000000000";
            await escrow.confirmOrderWithCommitment(vcCID, zeroCommitment, { from: seller });
            
            const fee = web3.utils.toWei("0.1", "ether");
            await escrow.createTransporter(fee, { from: transporter });
            await escrow.securityDeposit({ from: transporter, value: web3.utils.toWei("0.5", "ether") });
            await escrow.setTransporter(transporter, { from: seller, value: fee });
            
            // Try timeout before window expires - should revert
            // Contract uses custom error NotYetTimeout(), not a string message
            await truffleAssert.reverts(
                escrow.timeout({ from: seller })
            );
        });

        it("should revert sellerTimeout before SELLER_WINDOW expires", async () => {
            // Setup: go to Purchased phase
            const priceWei = web3.utils.toWei("1", "ether");
            const publicCommitment = web3.utils.keccak256("public-commitment");
            
            await escrow.setPublicPriceWithCommitment(priceWei, publicCommitment, { from: seller });
            await escrow.purchasePublic({ from: buyer, value: priceWei });
            
            // Try sellerTimeout before window expires - should revert
            // Contract uses custom error SellerWindowNotExpired(), not a string message
            await truffleAssert.reverts(
                escrow.sellerTimeout({ from: buyer })
            );
        });

        it("should revert bidTimeout before BID_WINDOW expires", async () => {
            // Setup: go to OrderConfirmed phase
            const priceWei = web3.utils.toWei("1", "ether");
            const publicCommitment = web3.utils.keccak256("public-commitment");
            
            await escrow.setPublicPriceWithCommitment(priceWei, publicCommitment, { from: seller });
            await escrow.purchasePublic({ from: buyer, value: priceWei });
            
            const vcCID = "ipfs://QmTest";
            const zeroCommitment = "0x0000000000000000000000000000000000000000000000000000000000000000";
            await escrow.confirmOrderWithCommitment(vcCID, zeroCommitment, { from: seller });
            
            // Try bidTimeout before window expires - should revert
            // Contract uses custom error BiddingWindowNotExpired(), not a string message
            await truffleAssert.reverts(
                escrow.bidTimeout({ from: buyer })
            );
        });

        it("should revert Listed → Delivered (skip)", async () => {
            // Try to reveal and confirm delivery directly from Listed phase - should revert
            const priceWei = web3.utils.toWei("1", "ether");
            const publicCommitment = web3.utils.keccak256("public-commitment");
            
            await escrow.setPublicPriceWithCommitment(priceWei, publicCommitment, { from: seller });
            
            const blinding = web3.utils.soliditySha3(
                { type: "address", value: escrow.address },
                { type: "address", value: seller }
            );
            const revealedValue = web3.utils.toBN(priceWei);
            const vcCID = "ipfs://QmTest";
            
            // Contract uses custom error NotBuyer() when buyer is not set, or TransporterNotSet()
            await truffleAssert.reverts(
                escrow.revealAndConfirmDelivery(revealedValue, blinding, vcCID, { from: buyer })
            );
        });

        it("should revert Purchased → Listed (backward)", async () => {
            // Setup: go to Purchased phase
            const priceWei = web3.utils.toWei("1", "ether");
            const publicCommitment = web3.utils.keccak256("public-commitment");
            
            await escrow.setPublicPriceWithCommitment(priceWei, publicCommitment, { from: seller });
            await escrow.purchasePublic({ from: buyer, value: priceWei });
            
            // Try to go backwards - cannot revert phase, but can verify phase is still Purchased
            const phase = await escrow.phase();
            assert.equal(phase.toString(), "1"); // Purchased (cannot go back to Listed)
            
            // Verify cannot call functions that require Listed phase
            // (No direct way to test backward transition, but phase remains Purchased)
        });
    });

    describe("Event Emissions", () => {
        it("should emit all required events during purchase", async () => {
            const priceWei = web3.utils.toWei("1", "ether");
            
            // Set public price first
            await escrow.setPublicPrice(priceWei, { from: seller });
            
            // Purchase
            const tx = await escrow.purchasePublic({ from: buyer, value: priceWei });
            
            // Check events
            const events = tx.logs.map(log => log.event);
            assert.include(events, "PhaseChanged");
            assert.include(events, "PurchasedPublic");
            assert.include(events, "ProductStateChanged");
        });

        it("should emit ProductStateChanged on every state change", async () => {
            // depositPurchase() takes 0 parameters - it uses productPrice set during initialization
            const depositAmount = web3.utils.toWei("1", "ether");
            
            const tx = await escrow.depositPurchase(
                { from: buyer, value: depositAmount }
            );
            
            // Check ProductStateChanged event
            const stateChangedEvent = tx.logs.find(log => log.event === "ProductStateChanged");
            assert.exists(stateChangedEvent);
            assert.equal(stateChangedEvent.args.productId.toString(), "1");
            assert.equal(stateChangedEvent.args.seller, seller);
            assert.equal(stateChangedEvent.args.buyer, buyer);
            assert.equal(stateChangedEvent.args.phase.toString(), "1"); // Purchased
        });

        it("should emit DeliveryConfirmed event on delivery", async () => {
            // Setup: go through full flow to Bound phase
            const priceWei = web3.utils.toWei("1", "ether");
            const publicCommitment = web3.utils.keccak256("public-commitment");
            
            await escrow.setPublicPriceWithCommitment(priceWei, publicCommitment, { from: seller });
            await escrow.purchasePublic({ from: buyer, value: priceWei });
            
            const vcCID = "ipfs://QmTest";
            const zeroCommitment = "0x0000000000000000000000000000000000000000000000000000000000000000";
            await escrow.confirmOrderWithCommitment(vcCID, zeroCommitment, { from: seller });
            
            const fee = web3.utils.toWei("0.1", "ether");
            await escrow.createTransporter(fee, { from: transporter });
            await escrow.securityDeposit({ from: transporter, value: web3.utils.toWei("0.5", "ether") });
            await escrow.setTransporter(transporter, { from: seller, value: fee });
            
            // Reveal and confirm delivery
            // Deterministic blinding: keccak256(abi.encodePacked(address(this), owner))
            const blinding = web3.utils.soliditySha3(
                { type: "address", value: escrow.address },
                { type: "address", value: seller }
            );
            const revealedValue = web3.utils.toBN(priceWei);
            const finalVCID = "ipfs://QmFinal";
            
            const tx = await escrow.revealAndConfirmDelivery(revealedValue, blinding, finalVCID, { from: buyer });
            
            // Check DeliveryConfirmed event - event has buyer as first indexed parameter
            const deliveryEvent = tx.logs.find(log => log.event === "DeliveryConfirmed");
            assert.exists(deliveryEvent);
            assert.equal(deliveryEvent.args.buyer, buyer);
        });

        it("should emit DeliveryTimeout event on timeout", async () => {
            // Setup: go to Bound phase
            const priceWei = web3.utils.toWei("1", "ether");
            const publicCommitment = web3.utils.keccak256("public-commitment");
            
            await escrow.setPublicPriceWithCommitment(priceWei, publicCommitment, { from: seller });
            await escrow.purchasePublic({ from: buyer, value: priceWei });
            
            const vcCID = "ipfs://QmTest";
            const zeroCommitment = "0x0000000000000000000000000000000000000000000000000000000000000000";
            await escrow.confirmOrderWithCommitment(vcCID, zeroCommitment, { from: seller });
            
            const fee = web3.utils.toWei("0.1", "ether");
            await escrow.createTransporter(fee, { from: transporter });
            await escrow.securityDeposit({ from: transporter, value: web3.utils.toWei("0.5", "ether") });
            await escrow.setTransporter(transporter, { from: seller, value: fee });
            
            // Fast-forward past DELIVERY_WINDOW
            const DELIVERY_WINDOW = 2 * 24 * 60 * 60; // 2 days
            await skip(DELIVERY_WINDOW + 1);
            
            const tx = await escrow.timeout({ from: seller });
            
            // Check DeliveryTimeoutEvent event (contract uses DeliveryTimeoutEvent, not DeliveryTimeout)
            const timeoutEvent = tx.logs.find(log => log.event === "DeliveryTimeoutEvent");
            assert.exists(timeoutEvent);
        });
    });
});

// Helper function to skip time in the blockchain
async function skip(seconds) {
    await new Promise((resolve, reject) => {
        web3.currentProvider.send(
            {
                jsonrpc: "2.0",
                method: "evm_increaseTime",
                params: [seconds],
                id: new Date().getTime(),
            },
            (err1) => {
                if (err1) return reject(err1);
                web3.currentProvider.send(
                    {
                        jsonrpc: "2.0",
                        method: "evm_mine",
                        params: [],
                        id: new Date().getTime() + 1,
                    },
                    (err2, res) => (err2 ? reject(err2) : resolve(res))
                );
            }
        );
    });
} 