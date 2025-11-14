const ProductEscrow_Initializer = artifacts.require("ProductEscrow_Initializer");
const ProductFactory = artifacts.require("ProductFactory");

module.exports = function (deployer) {
    console.log("Deploying contracts...");
    
    // Deploy ProductEscrow_Initializer first (the implementation)
    deployer.deploy(ProductEscrow_Initializer).then(() => {
        console.log("ProductEscrow_Initializer deployed successfully!");
        
        // Then deploy ProductFactory with the implementation address
        return deployer.deploy(ProductFactory, ProductEscrow_Initializer.address);
    }).then(() => {
        console.log("ProductFactory deployed successfully!");
        console.log("Deployment completed successfully!");
        console.log("Implementation address:", ProductEscrow_Initializer.address);
        console.log("Factory address:", ProductFactory.address);
    }).catch((error) => {
        console.error("Deployment failed:", error);
        throw error;
    });
};