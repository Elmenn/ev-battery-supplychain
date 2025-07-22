const ProductFactory = artifacts.require("ProductFactory");

module.exports = function (deployer) {
    deployer.deploy(ProductFactory, {
        gas: 5000000, // Set a high enough gas limit
        gasPrice: web3.utils.toWei('2', 'gwei') // Set an appropriate gas price
    });
};