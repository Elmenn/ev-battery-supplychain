const ProductEscrow_Initializer = artifacts.require("ProductEscrow_Initializer");
const ProductFactory = artifacts.require("ProductFactory");
const { expectRevert } = require("truffle-assertions");

contract("Deterministic Cloning", (accounts) => {
    let factory, implementation;
    const [owner, seller1, seller2] = accounts;

    beforeEach(async () => {
        // Deploy implementation
        implementation = await ProductEscrow_Initializer.new();
        
        // Deploy factory with implementation
        factory = await ProductFactory.new(implementation.address);
    });

    describe("Address Prediction", () => {
        it("should predict correct address for deterministic clone", async () => {
            const name = "Test Battery";
            const commitment = web3.utils.keccak256("test");
            const salt = web3.utils.keccak256("unique-salt-1");
            
            // Predict address before creation
            const predictedAddress = await factory.predictProductAddress(salt);
            assert.notEqual(predictedAddress, "0x0000000000000000000000000000000000000000");
            
            // Create deterministic clone
            const tx = await factory.createProductDeterministic(name, commitment, salt, { from: seller1 });
            const actualAddress = tx.logs[0].args.productAddress;
            
            // Verify addresses match
            assert.equal(predictedAddress, actualAddress);
        });

        it("should predict different addresses for different salts", async () => {
            const name = "Test Battery";
            const commitment = web3.utils.keccak256("test");
            const salt1 = web3.utils.keccak256("salt-1");
            const salt2 = web3.utils.keccak256("salt-2");
            
            const predictedAddress1 = await factory.predictProductAddress(salt1);
            const predictedAddress2 = await factory.predictProductAddress(salt2);
            
            // Different salts should produce different addresses
            assert.notEqual(predictedAddress1, predictedAddress2);
        });

        it("should predict same address for same salt", async () => {
            const name = "Test Battery";
            const commitment = web3.utils.keccak256("test");
            const salt = web3.utils.keccak256("same-salt");
            
            const predictedAddress1 = await factory.predictProductAddress(salt);
            const predictedAddress2 = await factory.predictProductAddress(salt);
            
            // Same salt should always produce same address
            assert.equal(predictedAddress1, predictedAddress2);
        });
    });

    describe("Deterministic vs Regular Cloning", () => {
        it("should create different addresses for regular vs deterministic", async () => {
            const name = "Test Battery";
            const commitment = web3.utils.keccak256("test");
            const salt = web3.utils.keccak256("deterministic-salt");
            
            // Create regular clone
            const tx1 = await factory.createProduct(name, commitment, { from: seller1 });
            const regularAddress = tx1.logs[0].args.productAddress;
            
            // Create deterministic clone
            const tx2 = await factory.createProductDeterministic(name, commitment, salt, { from: seller2 });
            const deterministicAddress = tx2.logs[0].args.productAddress;
            
            // Addresses should be different
            assert.notEqual(regularAddress, deterministicAddress);
        });

        it("should allow multiple deterministic clones with different salts", async () => {
            const name = "Test Battery";
            const commitment = web3.utils.keccak256("test");
            const salt1 = web3.utils.keccak256("salt-1");
            const salt2 = web3.utils.keccak256("salt-2");
            
            // Create first deterministic clone
            const tx1 = await factory.createProductDeterministic(name, commitment, salt1, { from: seller1 });
            const address1 = tx1.logs[0].args.productAddress;
            
            // Create second deterministic clone
            const tx2 = await factory.createProductDeterministic(name, commitment, salt2, { from: seller2 });
            const address2 = tx2.logs[0].args.productAddress;
            
            // Both should be created successfully
            assert.notEqual(address1, "0x0000000000000000000000000000000000000000");
            assert.notEqual(address2, "0x0000000000000000000000000000000000000000");
            assert.notEqual(address1, address2);
            
            // Check product counter
            const counter = await factory.productCounter();
            assert.equal(counter.toString(), "2");
        });
    });

    describe("Salt Uniqueness", () => {
        it("should allow same salt to be used by different sellers", async () => {
            const name = "Test Battery";
            const commitment = web3.utils.keccak256("test");
            const salt = web3.utils.keccak256("shared-salt");
            
            // Seller 1 creates with salt
            const tx1 = await factory.createProductDeterministic(name, commitment, salt, { from: seller1 });
            const address1 = tx1.logs[0].args.productAddress;
            
            // Seller 2 creates with same salt (should work)
            const tx2 = await factory.createProductDeterministic(name, commitment, salt, { from: seller2 });
            const address2 = tx2.logs[0].args.productAddress;
            
            // Both should be created successfully
            assert.notEqual(address1, address2);
        });

        it("should maintain salt uniqueness across factory updates", async () => {
            const name = "Test Battery";
            const commitment = web3.utils.keccak256("test");
            const salt = web3.utils.keccak256("persistent-salt");
            
            // Create clone with current implementation
            const tx1 = await factory.createProductDeterministic(name, commitment, salt, { from: seller1 });
            const address1 = tx1.logs[0].args.productAddress;
            
            // Deploy new implementation
            const newImplementation = await ProductEscrow_Initializer.new();
            await factory.updateImplementation(newImplementation.address, { from: owner });
            
            // Create clone with new implementation (same salt)
            const tx2 = await factory.createProductDeterministic(name, commitment, salt, { from: seller2 });
            const address2 = tx2.logs[0].args.productAddress;
            
            // Addresses should be different due to different implementation
            assert.notEqual(address1, address2);
        });
    });

    describe("Frontend Integration", () => {
        it("should allow frontend to pre-compute addresses", async () => {
            const name = "Test Battery";
            const commitment = web3.utils.keccak256("test");
            
            // Frontend can compute salt from seller + productId
            const productId = 1;
            const sellerSalt = web3.utils.keccak256(seller1 + productId.toString());
            
            // Predict address
            const predictedAddress = await factory.predictProductAddress(sellerSalt);
            
            // Create product with predicted salt
            const tx = await factory.createProductDeterministic(name, commitment, sellerSalt, { from: seller1 });
            const actualAddress = tx.logs[0].args.productAddress;
            
            // Verify prediction was correct
            assert.equal(predictedAddress, actualAddress);
        });

        it("should support batch address prediction", async () => {
            const name = "Test Battery";
            const commitment = web3.utils.keccak256("test");
            const salts = [
                web3.utils.keccak256("salt-1"),
                web3.utils.keccak256("salt-2"),
                web3.utils.keccak256("salt-3")
            ];
            
            // Predict all addresses
            const predictedAddresses = [];
            for (const salt of salts) {
                const predicted = await factory.predictProductAddress(salt);
                predictedAddresses.push(predicted);
            }
            
            // Create all products
            for (let i = 0; i < salts.length; i++) {
                const tx = await factory.createProductDeterministic(name, commitment, salts[i], { from: seller1 });
                const actualAddress = tx.logs[0].args.productAddress;
                
                // Verify prediction
                assert.equal(predictedAddresses[i], actualAddress);
            }
        });
    });
}); 