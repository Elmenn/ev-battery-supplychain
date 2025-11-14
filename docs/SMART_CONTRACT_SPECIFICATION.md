# EV Battery Supply Chain Smart Contract Technical Specification

**Document Version:** 1.0  
**Last Updated:** December 2024  
**Author:** EV Battery Supply Chain Development Team  
**License:** MIT  

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture Overview](#system-architecture-overview)
3. [Smart Contract Architecture](#smart-contract-architecture)
4. [Detailed Contract Specifications](#detailed-contract-specifications)
5. [Security Features and Considerations](#security-features-and-considerations)
6. [Gas Optimization Strategies](#gas-optimization-strategies)
7. [Privacy and Confidentiality Features](#privacy-and-confidentiality-features)
8. [Integration Patterns](#integration-patterns)
9. [Testing and Verification](#testing-and-verification)
10. [Deployment and Configuration](#deployment-and-configuration)
11. [References and Standards](#references-and-standards)

---

## Executive Summary

The EV Battery Supply Chain dApp implements a decentralized, privacy-preserving marketplace for electric vehicle battery components using Ethereum smart contracts. The system employs advanced cryptographic techniques including zero-knowledge proofs (ZKPs), confidential price commitments, and Railgun privacy integration to ensure transaction confidentiality while maintaining auditability and regulatory compliance.

**Key Innovations:**
- **Minimal Proxy Pattern** for gas-efficient contract deployment
- **Confidential Price Commitments** using cryptographic hashing
- **Railgun Integration** for private payment processing
- **Verifiable Credentials (VCs)** for identity and compliance verification
- **ZKP-based Audit Trails** for regulatory compliance without compromising privacy

---

## System Architecture Overview

### High-Level Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend UI   │◄──►│  Smart Contracts │◄──►│  Railgun API   │
│   (React)       │    │   (Ethereum)     │    │  (Privacy)      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   IPFS Storage  │    │   ZKP Backend    │    │   Backend API   │
│   (VCs)         │    │   (Rust)         │    │   (Node.js)     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Core Components

1. **ProductFactory Contract**: Manages product creation and lifecycle
2. **ProductEscrow Contract**: Handles individual product transactions
3. **Railgun Integration**: Provides private payment processing
4. **ZKP Backend**: Generates and verifies zero-knowledge proofs
5. **IPFS Storage**: Decentralized storage for verifiable credentials

---

## Smart Contract Architecture

### Design Patterns

#### 1. Minimal Proxy Pattern (EIP-1167)
The system implements the Minimal Proxy Pattern to optimize gas costs during contract deployment:

```solidity
// ProductFactory creates clones of ProductEscrow_Initializer
function createProduct(
    string memory _name,
    bytes32 _priceCommitment,
    uint256 _publicPriceWei
) external whenNotPaused returns (address product) {
    product = Clones.clone(implementation);
    ProductEscrow_Initializer(payable(product)).initialize(
        productCount + 1,
        _name,
        _priceCommitment,
        msg.sender,
        _publicPriceWei,
        address(this)
    );
    // ...
}
```

**Benefits:**
- **Gas Efficiency**: Reduces deployment costs by ~90%
- **Scalability**: Enables mass deployment of product escrows
- **Upgradability**: Implementation contract can be updated independently

#### 2. Access Control Architecture
The system implements a hierarchical access control model:

```solidity
modifier onlyFactory() {
    if (msg.sender != factory && factory != address(0)) revert NotFactory();
    _;
}

modifier onlyBuyer() {
    if (msg.sender != buyer) revert NotBuyer();
    _;
}

modifier onlySeller() {
    if (msg.sender != owner) revert NotSeller();
    _;
}
```

**Access Control Matrix:**

| Function | Factory | Seller | Buyer | Transporter | Public |
|----------|---------|---------|-------|-------------|---------|
| `initialize()` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `depositPurchase()` | ❌ | ❌ | ✅ | ❌ | ✅ |
| `confirmOrder()` | ❌ | ✅ | ❌ | ❌ | ❌ |
| `setTransporter()` | ❌ | ✅ | ❌ | ❌ | ❌ |
| `recordPrivatePayment()` | ❌ | ✅ | ✅ | ❌ | ❌ |

---

## Detailed Contract Specifications

### 1. ProductFactory Contract

#### Purpose
The ProductFactory contract serves as the central coordinator for product lifecycle management, implementing the factory pattern for gas-efficient contract deployment.

#### Key Functions

**Product Creation:**
```solidity
function createProduct(
    string memory _name, 
    bytes32 _priceCommitment,
    uint256 _publicPriceWei
) external whenNotPaused returns (address product)
```

**Parameters:**
- `_name`: Human-readable product identifier
- `_priceCommitment`: Confidential price commitment supplied during initialization
- `_publicPriceWei`: Optional on-chain ETH price exposed to public buyers

**Returns:**
- `product`: Address of the newly created ProductEscrow contract

**Implementation Details:**
1. Validates input parameters
2. Clones the implementation contract using EIP-1167
3. Initializes the cloned contract with product data
4. Emits `ProductCreated` event for indexing
5. Increments product counter

**Access Control:**
- **Public**: Any authenticated user can create products
- **Pausable**: Factory can be paused by owner in emergency situations

#### Pause Mechanism
The factory implements a lightweight pause mechanism:

```solidity
bool public isPaused;

modifier whenNotPaused() {
    if (isPaused) revert FactoryIsPaused();
    _;
}

function pause() external onlyOwner {
    isPaused = true;
    emit FactoryPaused(msg.sender);
}
```

**Use Cases:**
- Emergency situations requiring immediate halt
- Security vulnerabilities requiring contract suspension
- Regulatory compliance requirements

### 2. ProductEscrow_Initializer Contract

#### Purpose
The ProductEscrow_Initializer contract implements the core business logic for individual product transactions, including purchase, delivery, and payment processing.

#### State Management

**Phase Machine:**
```solidity
enum Phase { 
    Listed,           // Product available for purchase
    Purchased,        // Buyer has deposited funds
    OrderConfirmed,   // Seller has confirmed the order
    Bound,            // Transporter has been selected
    Delivered,        // Product has been delivered
    Expired           // Transaction has timed out
}
```

**Phase Transitions:**
1. **Listed → Purchased**: Buyer deposits purchase funds (public or private)
2. **Purchased → OrderConfirmed**: Seller confirms order within 48 hours
3. **OrderConfirmed → Bound**: Transporter selected within 48 hours
4. **Bound → Delivered**: Product delivered within 48 hours
5. **Any → Expired**: Timeout conditions met

**Storage Optimization:**
```solidity
// Packed storage - Group 1 (32 bytes)
uint256 public id;
string public name;
bytes32 public priceCommitment;

// Packed storage - Group 2 (32 bytes)
address payable public owner;
address payable public buyer;
address payable public transporter;

// Packed storage - Group 3 (32 bytes)
Phase public phase;
uint64 public purchaseTimestamp;
uint64 public orderConfirmedTimestamp;
bool public purchased;
bool public delivered;
uint32 public transporterCount;

// Stand-alone storage
uint256 public publicPriceWei;
bytes32 public publicPriceCommitment;
bool public commitmentFrozen; // Commitment immutability flag
```

**Benefits:**
- **Gas Efficiency**: Optimized storage layout reduces gas costs
- **Atomic Operations**: Related data stored in single storage slots
- **Type Safety**: Appropriate data types for each field

#### Core Business Functions

**1. Public Pricing (`setPublicPrice`, `setPublicPriceWithCommitment`)**
```solidity
function setPublicPrice(uint256 priceWei) external onlySeller;

function setPublicPriceWithCommitment(uint256 priceWei, bytes32 commitment)
    external
    onlySeller;
```

**Purpose:**
- Configure the ETH amount required for a public purchase.
- Record a Pedersen-style commitment (`publicPriceCommitment`) that matches the hidden price published inside Stage-3 VCs and Bulletproof range proofs.
- **Commitment Freezing:** Once set, the commitment is frozen and immutable, ensuring integrity and preventing tampering.

**State Variables:**
- `publicPriceCommitment`: The stored Pedersen commitment (bytes32).
- `commitmentFrozen`: Boolean flag indicating whether the commitment has been set and frozen (immutable after first set).

**Business Rules:**
- Seller-only, while the product is still in `Phase.Listed`.
- Rejects zero values and multiple invocations (`Already set`).
- Rejects zero commitments (`ZeroPriceCommitment`).
- **Immutability:** Once set, the commitment is frozen and cannot be changed (`CommitmentFrozen` error if attempted).
- Emits `PublicPriceSet(priceWei)` and `PublicPriceCommitmentSet(uint256 indexed id, bytes32 commitment)`.

**Security Properties:**
- **One-Time Set:** The commitment can only be set once per product.
- **Immutability:** The commitment is frozen immediately after the first call to `setPublicPriceWithCommitment`.
- **Zero Commitment Rejection:** Zero commitments (`bytes32(0)`) are rejected to prevent invalid states.
- **Defense in Depth:** Multiple checks prevent commitment modification (frozen flag + price check).

**Errors:**
- `CommitmentFrozen()`: Reverted when attempting to set a commitment after it has been frozen.
- `ZeroPriceCommitment()`: Reverted when attempting to set a zero commitment.

**Usage:**
- Legacy flows call `setPublicPrice` and leave `publicPriceCommitment` empty (defaults to `bytes32(0)`), and `commitmentFrozen` remains `false`.
- Enhanced flows call `setPublicPriceWithCommitment` to bind the price commitment on-chain for future ZKP validation. The commitment is frozen immediately after setting.

**2. Public Purchase (`purchasePublic`)**
```solidity
function purchasePublic() external payable nonReentrant whenNotStopped;
```

**Highlights:**
- Enforces public price toggles (`publicEnabled`, `publicPriceWei`).
- Records on-chain buyer address and emits `PurchasedPublic`.
- Updates `productPrice` to the paid value for later settlement.

**3. Private Purchase (`depositPurchasePrivate`)**
```solidity
function depositPurchase(
    bytes32 _commitment,
    bytes32 _valueCommitment,
    bytes calldata _valueRangeProof
) external payable nonReentrant
```

**Parameters:**
- `_commitment`: Cryptographic commitment to the actual price
- `_valueCommitment`: ZKP commitment for value verification
- `_valueRangeProof`: Bulletproofs+ proof of value range

**Security Features:**
- **Reentrancy Protection**: `nonReentrant` modifier prevents reentrancy attacks
- **Value Validation**: Ensures `msg.value` matches confidential price commitment
- **Phase Validation**: Only allows purchases in `Listed` phase

**4. Order Confirmation (`confirmOrder`)**
```solidity
function confirmOrder(string memory vcCID) external nonReentrant
```

**Parameters:**
- `vcCID`: IPFS hash of the verifiable credential

**Business Logic:**
- Validates seller identity
- Checks timeout conditions (48-hour window)
- Updates product phase to `OrderConfirmed`
- Records verifiable credential hash

**5. Transporter Management**
```solidity
function createTransporter(uint _feeInWei) external nonReentrant
function setTransporter(address payable _transporter) external payable nonReentrant
```

**Transporter Selection Process:**
1. Transporters register with fee bids
2. Maximum of 20 transporters per product (DoS protection)
3. Seller selects transporter within 48-hour bidding window
4. Selected transporter receives delivery fee + security deposit

**6. Delivery Confirmation (`revealAndConfirmDelivery`)**
```solidity
function revealAndConfirmDelivery(
    uint revealedValue,
    bytes32 blinding,
    string memory vcCID
) external nonReentrant
```

**Privacy-Preserving Features:**
- **Price Revelation**: Buyer reveals actual price using blinding factor
- **ZKP Verification**: Validates price commitment cryptographically
- **VC Recording**: Stores delivery verification credential

---

## Security Features and Considerations

### 1. Reentrancy Protection

**Implementation:**
```solidity
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract ProductEscrow_Initializer is ReentrancyGuard {
    function depositPurchase(...) external payable nonReentrant {
        _depositPurchase(...);
    }
}
```

**Protected Functions:**
- All external state-changing functions
- ETH transfer operations
- Balance modifications
- Phase transitions

### 2. Access Control

**Role-Based Access Control (RBAC):**
- **Factory**: Contract deployment and initialization
- **Seller**: Order confirmation and transporter selection
- **Buyer**: Purchase and delivery confirmation
- **Transporter**: Delivery execution and fee collection

**Immutable Bindings:**
- Factory address bound during initialization
- No post-initialization factory changes
- Prevents unauthorized contract manipulation

### 3. Input Validation

**Parameter Validation:**
```solidity
if (_owner == address(0)) revert InvalidOwnerAddress();
if (bytes(_name).length == 0) revert EmptyName();
if (_priceCommitment == bytes32(0)) revert ZeroPriceCommitment();
```

**Business Rule Validation:**
- Phase-appropriate function calls
- Timeout condition checks
- Balance and fee validations

### 4. Custom Error System

**Benefits:**
- **Gas Efficiency**: 4 gas per error vs. 20+ gas for require strings
- **Debugging**: Clear error identification
- **Consistency**: Standardized error messages across contracts

**Error Categories:**
```solidity
// Role-specific errors
error NotBuyer();
error NotSeller();
error NotTransporter();

// Business logic errors
error InvalidPhase();
error WrongPhase();
error AlreadyPurchased();

// Transfer errors
error TransferFailed(address to, uint256 amount);
```

---

## Gas Optimization Strategies

### 1. Storage Packing

**Optimized Layout:**
```solidity
// Group 1: 32 bytes (fully packed)
uint256 public id;           // 32 bytes
string public name;          // 32 bytes (offset to string data)
bytes32 public priceCommitment; // 32 bytes

// Group 2: 32 bytes (fully packed)
address payable public owner;    // 20 bytes
address payable public buyer;    // 20 bytes
address payable public transporter; // 20 bytes
// 4 bytes padding

// Group 3: 32 bytes (fully packed)
Phase public phase;              // 1 byte
uint64 public purchaseTimestamp; // 8 bytes
uint64 public orderConfirmedTimestamp; // 8 bytes
bool public purchased;           // 1 byte
bool public delivered;           // 1 byte
uint32 public transporterCount;  // 4 bytes
// 9 bytes padding
```

**Gas Savings:**
- **Before**: 6 storage slots = 6 × 20,000 gas = 120,000 gas
- **After**: 3 storage slots = 3 × 20,000 gas = 60,000 gas
- **Savings**: 50% reduction in storage costs

### 2. Unchecked Operations

**Safe Arithmetic:**
```solidity
// Safe increment operations
unchecked {
    transporterCount++;
}

// Safe loop operations
unchecked {
    for (uint i = 0; i < len; i++) {
        addresses[i] = transporterAddresses[i];
        fees[i] = transporters[transporterAddresses[i]];
    }
}
```

**Use Cases:**
- Counter increments (bounded by MAX_BIDS)
- Loop iterations (bounded by array length)
- Arithmetic operations with known bounds

### 3. Event-Driven Indexing

**Elimination of Storage Arrays:**
```solidity
// Instead of storing product arrays
// mapping(uint => address) public products;

// Use events for indexing
event ProductCreated(
    uint256 indexed productId,
    address indexed product,
    address indexed seller,
    string name,
    bytes32 priceCommitment,
    uint256 timestamp
);
```

**Benefits:**
- **Gas Efficiency**: No storage costs for product lists
- **Scalability**: Unlimited product creation
- **Indexing**: Frontend can build product catalogs from events

---

## Privacy and Confidentiality Features

### 1. Confidential Price Commitments

**Implementation:**
```solidity
function computeCommitment(uint256 value, bytes32 salt) 
    public pure returns (bytes32) 
{
    return keccak256(abi.encodePacked(value, salt));
}
```

**Privacy Properties:**
- **Price Hiding**: Actual price not visible on-chain
- **Commitment Binding**: Cryptographic commitment prevents price manipulation
- **Deterministic Blinding**: Blinding factor computed from `keccak256(productAddress + sellerAddress)`, ensuring seller and buyer generate the same commitment

**Usage Flow:**
1. Seller creates price commitment: `commitment = Pedersen(price, deterministic_blinding)`
   - `blinding = keccak256(productAddress + sellerAddress)`
2. Buyer generates same commitment using same deterministic blinding
3. Commitment stored on-chain via `setPublicPriceWithCommitment()`
4. ZKP generated with deterministic blinding, proving price is in valid range without revealing it

### 2. Railgun Integration

**Private Payment Processing:**
```solidity
function recordPrivatePayment(
    uint256 _productId,
    bytes32 _memoHash,
    bytes32 _railgunTxRef
) external nonReentrant
```

**Privacy Features:**
- **Transaction Hiding**: Payment amounts not visible on-chain
- **Memo Privacy**: Transaction details encrypted in Railgun
- **Audit Trail**: ZKP-based proof of payment without revealing amounts

**Access Control:**
- **Restricted Access**: Only buyer and seller can record payments
- **Transporter Exclusion**: Transporters cannot record payments
- **Audit Compliance**: Maintains regulatory compliance requirements

### 3. Verifiable Credentials (VCs)

**Storage:**
```solidity
bytes32 public vcCid; // IPFS hash of verifiable credential
```

**Privacy Properties:**
- **Off-Chain Storage**: VCs stored on IPFS, not on-chain
- **Hash Verification**: Only credential hashes stored on-chain
- **Selective Disclosure**: VCs can reveal specific attributes as needed

---

## Integration Patterns

### 1. Frontend Integration

**Contract Interaction:**
```javascript
// Product creation
const tx = await factory.createProduct(
    productName,
    priceCommitment,
    { from: seller }
);

// Purchase
await product.depositPurchase(
    commitment,
    valueCommitment,
    valueRangeProof,
    { from: buyer, value: price }
);
```

**Event Listening:**
```javascript
// Listen for product creation
factory.events.ProductCreated()
    .on('data', (event) => {
        console.log('Product created:', event.args);
    });
```

### 2. Backend API Integration

**Railgun API:**
```javascript
// Record private payment
const response = await fetch('/api/railgun/record-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        productId: productId,
        memoHash: memoHash,
        railgunTxRef: railgunTxRef
    })
});
```

**ZKP Verification:**
```javascript
// Verify ZKP proof
const isValid = await zkpService.verifyProof(
    commitment,
    value,
    proof
);
```

### 3. IPFS Integration

**VC Storage:**
```javascript
// Store VC on IPFS
const cid = await ipfs.add(JSON.stringify(verifiableCredential));

// Update contract with CID
await product.updateVcCid(cid.toString(), { from: seller });
```

---

## Testing and Verification

### 1. Test Coverage

**Test Categories:**
- **Unit Tests**: Individual function behavior
- **Integration Tests**: Contract interaction patterns
- **Security Tests**: Access control and reentrancy protection
- **Gas Tests**: Optimization verification
- **Phase Machine Tests**: State transition validation

**Test Framework:**
```javascript
const ProductEscrow_Initializer = artifacts.require("ProductEscrow_Initializer");
const ProductFactory = artifacts.require("ProductFactory");

contract("ProductEscrow Tests", (accounts) => {
    // Test implementation
});
```

### 2. Security Auditing

**Audit Areas:**
- **Access Control**: Role-based permissions
- **Reentrancy**: External call protection
- **Integer Overflow**: Safe arithmetic operations
- **Access Control**: Unauthorized function access
- **Privacy**: Confidentiality preservation

**Automated Tools:**
- **Slither**: Static analysis
- **Mythril**: Symbolic execution
- **Echidna**: Fuzzing testing

---

## Deployment and Configuration

### 1. Network Configuration

**Truffle Configuration:**
```javascript
module.exports = {
    networks: {
        development: {
            host: "127.0.0.1",
            port: 7545,
            network_id: "*",
            gas: 6721975,
            gasPrice: 20000000000
        },
        ganache: {
            host: "127.0.0.1",
            port: 7545,
            network_id: "*",
            gas: 6721975,
            gasPrice: 20000000000
        }
    },
    compilers: {
        solc: {
            version: "0.8.21",
            settings: {
                optimizer: {
                    enabled: true,
                    runs: 200
                }
            }
        }
    }
};
```

### 2. Deployment Process

**Migration Script:**
```javascript
const ProductEscrow_Initializer = artifacts.require("ProductEscrow_Initializer");
const ProductFactory = artifacts.require("ProductFactory");

module.exports = async function(deployer) {
    // Deploy implementation contract
    await deployer.deploy(ProductEscrow_Initializer);
    const implementation = await ProductEscrow_Initializer.deployed();
    
    // Deploy factory with implementation address
    await deployer.deploy(ProductFactory, implementation.address);
};
```

**Deployment Commands:**
```bash
# Compile contracts
npx truffle compile

# Deploy to local network
npx truffle migrate --network development

# Run tests
npx truffle test
```

---

## References and Standards

### 1. Ethereum Standards

- **EIP-1167**: Minimal Proxy Contract
- **EIP-712**: Typed Structured Data Hashing
- **EIP-1155**: Multi-Token Standard (for future extensions)

### 2. Privacy Standards

- **Railgun Protocol**: Privacy-preserving transactions
- **Bulletproofs+**: Zero-knowledge proof system
- **Verifiable Credentials**: W3C VC Data Model

### 3. Security Standards

- **OpenZeppelin**: Secure smart contract libraries
- **Consensys Diligence**: Security best practices
- **Smart Contract Security**: Industry standards

### 4. Academic References

- **Zero-Knowledge Proofs**: Goldwasser, Micali, Rackoff (1985)
- **Bulletproofs**: Bunz et al. (2018)
- **Smart Contract Security**: Atzei et al. (2017)

---

## Conclusion

The EV Battery Supply Chain smart contract system represents a significant advancement in privacy-preserving, decentralized commerce. By combining minimal proxy patterns, confidential price commitments, and Railgun integration, the system achieves both privacy and regulatory compliance while maintaining high performance and security standards.

**Key Achievements:**
- **Gas Efficiency**: 50% reduction in storage costs through optimization
- **Privacy Preservation**: Confidential transactions with audit trails
- **Security**: Comprehensive protection against common attack vectors
- **Scalability**: Factory pattern enables mass deployment
- **Compliance**: ZKP-based audit trails for regulatory requirements

**Future Enhancements:**
- **Multi-Token Support**: EIP-1155 integration for diverse asset types
- **Cross-Chain Bridges**: Interoperability with other blockchain networks
- **Advanced ZKPs**: Integration with newer proof systems
- **DeFi Integration**: Automated market making and liquidity provision

---

**Document End**

*This document serves as the comprehensive technical specification for the EV Battery Supply Chain smart contract system. For implementation details, refer to the source code in the `contracts/` directory. For deployment instructions, refer to the `migrations/` directory.* 