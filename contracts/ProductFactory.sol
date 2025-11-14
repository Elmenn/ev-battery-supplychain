// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./ProductEscrow_Initializer.sol";

// Interface for calling ProductEscrow functions without casting issues
interface IProductEscrowOwner {
    function owner() external view returns (address payable);
}

// Standardized custom errors for gas efficiency and consistency
error InvalidImplementationAddress();
error FactoryIsPaused();

contract ProductFactory is Ownable {
    using Clones for address;

    event ProductCreated(address indexed product, address indexed seller, uint256 indexed productId, bytes32 priceCommitment, uint256 price);
    event ImplementationUpdated(address indexed oldImpl, address indexed newImpl);
    event FactoryPaused(address indexed by);
    event FactoryUnpaused(address indexed by);

    // Packed storage for gas optimization
    address public implementation;
    uint256 public productCount;
    bool public isPaused; // Lightweight pause mechanism (factory-level only)
    
    // Paged getter for dev convenience (optional, not main indexing)
    address[] public products;

    constructor(address _impl) Ownable(msg.sender) {
        if (_impl == address(0)) revert InvalidImplementationAddress();
        implementation = _impl;
        emit ImplementationUpdated(address(0), _impl);
    }

    modifier whenNotPaused() {
        if (isPaused) revert FactoryIsPaused();
        _;
    }

    // Alias for the suggested function name
    function setImplementation(address _impl) external onlyOwner {
        if (_impl == address(0)) revert InvalidImplementationAddress();
        address oldImpl = implementation;
        implementation = _impl;
        emit ImplementationUpdated(oldImpl, _impl);
    }

    function pause() external onlyOwner {
        isPaused = true;
        emit FactoryPaused(msg.sender);
    }

    function unpause() external onlyOwner {
        isPaused = false;
        emit FactoryUnpaused(msg.sender);
    }

    function createProduct(string memory name, bytes32 priceCommitment, uint256 price) 
        external 
        whenNotPaused 
        returns (address product) 
    {
        product = implementation.clone();
        
        // Use unchecked for safe increment
        unchecked {
            productCount++;
        }
        
        // Initialize the clone
        ProductEscrow_Initializer(payable(product)).initialize(
            productCount, 
            name, 
            priceCommitment, 
            msg.sender,
            price, // ✅ Pass the actual price instead of 0
            address(this) // ✅ Pass factory address for security
        );

        // Store for optional paged access (dev convenience)
        products.push(product);
        
        emit ProductCreated(product, msg.sender, productCount, priceCommitment, price);
    }

    function createProductDeterministic(
        string memory name, 
        bytes32 priceCommitment, 
        uint256 price,
        bytes32 salt
    ) 
        external 
        whenNotPaused 
        returns (address product) 
    {
        product = implementation.cloneDeterministic(salt);
        
        // Use unchecked for safe increment
        unchecked {
            productCount++;
        }
        
        // Initialize the clone
        ProductEscrow_Initializer(payable(product)).initialize(
            productCount, 
            name, 
            priceCommitment, 
            msg.sender,
            price, // ✅ Pass the actual price instead of 0
            address(this) // ✅ Pass factory address for security
        );

        // Store for optional paged access (dev convenience)
        products.push(product);
        
        emit ProductCreated(product, msg.sender, productCount, priceCommitment, price);
    }

    function predictProductAddress(bytes32 salt) public view returns (address) {
        return Clones.predictDeterministicAddress(implementation, salt, address(this));
    }

    // Optional paged getter for dev convenience (not main indexing)
    // Optimized to avoid unbounded loops in write operations
    function getProductsRange(uint256 start, uint256 count) public view returns (address[] memory) {
        require(start < products.length, "Start index out of bounds");
        uint256 end = start + count;
        if (end > products.length) {
            end = products.length;
        }
        
        uint256 resultLength = end - start;
        address[] memory result = new address[](resultLength);
        
        // Use unchecked for safe loop operations
        unchecked {
            for (uint256 i = start; i < end; i++) {
                result[i - start] = products[i];
            }
        }
        
        return result;
    }

    // Gas-efficient getter for total products (alternative to array.length)
    function getProductCount() public view returns (uint256) {
        return productCount;
    }

    // Gas-efficient getter for all products (alternative to array access)
    function getProducts() public view returns (address[] memory) {
        return products;
    }

    // Get products by seller (fixed implementation)
    function getProductsBySeller(address _seller) public view returns (address[] memory) {
        uint256 count = 0;
        
        // First pass: count products by this seller
        for (uint256 i = 0; i < products.length; i++) {
            try IProductEscrowOwner(products[i]).owner() returns (address payable owner) {
                if (owner == _seller) {
                    count++;
                }
            } catch {
                // Skip if product is not properly initialized
                continue;
            }
        }
        
        // Second pass: collect product addresses
        address[] memory sellerProducts = new address[](count);
        uint256 index = 0;
        
        for (uint256 i = 0; i < products.length; i++) {
            try IProductEscrowOwner(products[i]).owner() returns (address payable owner) {
                if (owner == _seller && index < count) {
                    sellerProducts[index] = products[i]; // Fixed: store product address, not seller address
                    index++;
                }
            } catch {
                // Skip if product is not properly initialized
                continue;
            }
        }
        
        return sellerProducts;
    }



    // Explicitly reject unexpected ETH
    receive() external payable {
        revert("Factory does not accept ETH");
    }

    fallback() external payable {
        revert("Factory does not accept ETH");
    }
}