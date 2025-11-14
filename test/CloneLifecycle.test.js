const ProductEscrow_Initializer = artifacts.require("ProductEscrow_Initializer");
const ProductFactory = artifacts.require("ProductFactory");
const truffleAssert = require("truffle-assertions");

contract("Clone Lifecycle", (accounts) => {
    let factory, implementation;
    const [owner, seller, buyer] = accounts;

    beforeEach(async () => {
        // Deploy implementation
        implementation = await ProductEscrow_Initializer.new();
        
        // Deploy factory with implementation
        factory = await ProductFactory.new(implementation.address);
    });

    describe("Clone Creation", () => {
        it("should create clone successfully", async () => {
            const name = "Test Battery";
            const commitment = web3.utils.keccak256("test");
            
            const tx = await factory.createProduct(name, commitment, { from: seller });
            
            // Check events - only ProductCreated now
            assert.equal(tx.logs.length, 1, "Should have 1 event");
            assert.equal(tx.logs[0].event, "ProductCreated", "First event should be ProductCreated");
            
            const productCreatedEvent = tx.logs[0]; // ProductCreated is the first event
            const productAddress = productCreatedEvent.args.product;
            assert.notEqual(productAddress, "0x0000000000000000000000000000000000000000");
            
            // Check product counter
            const counter = await factory.productCount();
            assert.equal(counter.toString(), "1");
        });

        it("should initialize clone with correct data", async () => {
            const name = "Test Battery";
            const commitment = web3.utils.keccak256("test");
            
            const tx = await factory.createProduct(name, commitment, { from: seller });
            const productCreatedEvent = tx.logs[0]; // ProductCreated is the first event
            const productAddress = productCreatedEvent.args.product;
            
            const escrow = await ProductEscrow_Initializer.at(productAddress);
            
            // Check initialization
            const id = await escrow.id();
            const productName = await escrow.name();
            const priceCommitment = await escrow.priceCommitment();
            const productOwner = await escrow.owner();
            const phase = await escrow.phase();
            
            assert.equal(id.toString(), "1");
            assert.equal(productName, name);
            assert.equal(priceCommitment, commitment);
            assert.equal(productOwner, seller);
            assert.equal(phase.toString(), "0"); // Listed
        });

        it("should create multiple clones with unique IDs", async () => {
            const name1 = "Battery 1";
            const name2 = "Battery 2";
            const commitment = web3.utils.keccak256("test");
            
            // Create first product
            const tx1 = await factory.createProduct(name1, commitment, { from: seller });
            const product1Address = tx1.logs[0].args.product; // ProductCreated is first event
            const escrow1 = await ProductEscrow_Initializer.at(product1Address);
            const id1 = await escrow1.id();
            
            // Create second product
            const tx2 = await factory.createProduct(name2, commitment, { from: seller });
            const product2Address = tx2.logs[0].args.product; // ProductCreated is first event
            const escrow2 = await ProductEscrow_Initializer.at(product2Address);
            const id2 = await escrow2.id();
            
            assert.notEqual(id1.toString(), id2.toString());
            assert.equal(id1.toString(), "1");
            assert.equal(id2.toString(), "2");
            
            // Check counter
            const counter = await factory.productCount();
            assert.equal(counter.toString(), "2");
        });
    });

    describe("Re-initialization Protection", () => {
        it("should revert on re-initialization", async () => {
            const name = "Test Battery";
            const commitment = web3.utils.keccak256("test");
            
            const tx = await factory.createProduct(name, commitment, { from: seller });
            const productAddress = tx.logs[0].args.product; // ProductCreated is first event
            
            const escrow = await ProductEscrow_Initializer.at(productAddress);
            
            // Try to re-initialize from factory (which should pass the onlyFactory check)
            await truffleAssert.reverts(
                factory.reinitializeProduct(productAddress, 2, "Another", commitment, buyer)
            );
        });

        it("should revert initialization from non-factory", async () => {
            const name = "Test Battery";
            const commitment = web3.utils.keccak256("test");
            
            const tx = await factory.createProduct(name, commitment, { from: seller });
            const productAddress = tx.logs[0].args.product; // ProductCreated is first event
            
            const escrow = await ProductEscrow_Initializer.at(productAddress);
            
            // Try to initialize from non-factory address
            await truffleAssert.reverts(
                escrow.initialize(2, "Another", commitment, buyer, { from: buyer })
            );
        });
    });

    describe("Factory Access Control", () => {
        it("should only allow factory to call initialize", async () => {
            const name = "Test Battery";
            const commitment = web3.utils.keccak256("test");
            
            const tx = await factory.createProduct(name, commitment, { from: seller });
            const productAddress = tx.logs[0].args.product; // ProductCreated is first event
            
            const escrow = await ProductEscrow_Initializer.at(productAddress);
            
            // Check factory address is set
            const factoryAddress = await escrow.factory();
            assert.equal(factoryAddress, factory.address);
        });

        it("should allow factory to update implementation", async () => {
            const newImplementation = await ProductEscrow_Initializer.new();
            
            // Only owner should be able to update implementation
            await truffleAssert.reverts(
                factory.updateImplementation(newImplementation.address, { from: buyer })
            );
            
            // Owner should be able to update
            await factory.updateImplementation(newImplementation.address, { from: owner });
            const currentImpl = await factory.implementation();
            assert.equal(currentImpl, newImplementation.address);
        });

        it("should allow owner to pause and unpause factory", async () => {
            // Check initial state
            let isPaused = await factory.isPaused();
            assert.equal(isPaused, false);
            
            // Pause factory
            await factory.pause({ from: owner });
            isPaused = await factory.isPaused();
            assert.equal(isPaused, true);
            
            // Try to create product while paused
            const name = "Test Battery";
            const commitment = web3.utils.keccak256("test");
            
            await truffleAssert.reverts(
                factory.createProduct(name, commitment, { from: seller })
            );
            
            // Unpause factory
            await factory.unpause({ from: owner });
            isPaused = await factory.isPaused();
            assert.equal(isPaused, false);
            
            // Should be able to create product again
            const tx = await factory.createProduct(name, commitment, { from: seller });
            assert.equal(tx.logs[0].event, "ProductCreated"); // ProductCreated is first event now
        });
    });

    describe("Factory Indexing Functions", () => {
        it("should return correct product count", async () => {
            const count = await factory.getProductCount();
            assert.equal(count.toString(), "0");
            
            const name = "Test Battery";
            const commitment = web3.utils.keccak256("test");
            await factory.createProduct(name, commitment, { from: seller });
            
            const newCount = await factory.getProductCount();
            assert.equal(newCount.toString(), "1");
        });

        it("should return products in range", async () => {
            const name1 = "Battery 1";
            const name2 = "Battery 2";
            const name3 = "Battery 3";
            const commitment = web3.utils.keccak256("test");
            
            await factory.createProduct(name1, commitment, { from: seller });
            await factory.createProduct(name2, commitment, { from: seller });
            await factory.createProduct(name3, commitment, { from: seller });
            
            const products = await factory.getProductsRange(0, 2);
            assert.equal(products.length, 2);
            
            const allProducts = await factory.getProductsRange(0, 10);
            assert.equal(allProducts.length, 3);
        });

        it("should return products by seller", async () => {
            const name1 = "Battery 1";
            const name2 = "Battery 2";
            const commitment = web3.utils.keccak256("test");
            
            await factory.createProduct(name1, commitment, { from: seller });
            await factory.createProduct(name2, commitment, { from: buyer });
            
            const sellerProducts = await factory.getProductsBySeller(seller);
            const buyerProducts = await factory.getProductsBySeller(buyer);
            
            assert.equal(sellerProducts.length, 1);
            assert.equal(buyerProducts.length, 1);
        });
    });

    describe("Input Validation", () => {
        it("should revert with empty name", async () => {
            const commitment = web3.utils.keccak256("test");
            
            await truffleAssert.reverts(
                factory.createProduct("", commitment, { from: seller })
            );
        });

        it("should revert with zero commitment", async () => {
            const name = "Test Battery";
            const zeroCommitment = "0x0000000000000000000000000000000000000000000000000000000000000000";
            
            await truffleAssert.reverts(
                factory.createProduct(name, zeroCommitment, { from: seller })
            );
        });
    });
}); 