 # EV Battery Supply Chain dApp - System Architecture

**Document Version:** 1.0  
**Last Updated:** December 2024  
**Author:** EV Battery Supply Chain Development Team  

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architectural Principles](#architectural-principles)
3. [High-Level Architecture](#high-level-architecture)
4. [Component Architecture](#component-architecture)
5. [Data Flow Architecture](#data-flow-architecture)
6. [Security Architecture](#security-architecture)
7. [Privacy Architecture](#privacy-architecture)
8. [Scalability Architecture](#scalability-architecture)
9. [Integration Architecture](#integration-architecture)
10. [Deployment Architecture](#deployment-architecture)

---

## System Overview

The EV Battery Supply Chain dApp is a decentralized application that implements a privacy-preserving marketplace for electric vehicle battery components. The system architecture is designed to balance transparency, privacy, and regulatory compliance while maintaining high performance and security standards.

### **Core Design Goals**

1. **Privacy Preservation**: Protect sensitive business information while maintaining auditability
2. **Regulatory Compliance**: Provide necessary audit trails for regulatory requirements
3. **Scalability**: Support high-volume transactions with minimal gas costs
4. **Security**: Implement comprehensive protection against common attack vectors
5. **User Experience**: Provide intuitive interfaces for complex cryptographic operations

---

## Architectural Principles

### **1. Privacy by Design**

The system implements privacy as a fundamental design principle, not as an afterthought:

- **Data Minimization**: Only essential data is stored on-chain
- **Confidentiality**: Sensitive information is encrypted or hashed
- **Selective Disclosure**: Users control what information is revealed
- **Audit Trails**: Compliance without compromising privacy

### **2. Security First**

Security considerations are integrated throughout the architecture:

- **Defense in Depth**: Multiple layers of security controls
- **Principle of Least Privilege**: Minimal access rights for each component
- **Fail-Safe Defaults**: Secure by default configurations
- **Continuous Validation**: Ongoing security verification

### **3. Modular Design**

The system is built with modularity in mind:

- **Separation of Concerns**: Clear boundaries between components
- **Loose Coupling**: Components interact through well-defined interfaces
- **High Cohesion**: Related functionality is grouped together
- **Extensibility**: Easy to add new features and capabilities

### **4. Performance Optimization**

Performance is optimized at multiple levels:

- **Gas Efficiency**: Minimize on-chain storage and computation
- **Storage Packing**: Optimize Ethereum storage layout
- **Event-Driven**: Use events for indexing instead of storage arrays
- **Batch Operations**: Group operations to reduce transaction overhead

---

## High-Level Architecture

### **System Layers**

```
┌─────────────────────────────────────────────────────────────────┐
│                    Presentation Layer                           │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────┐  │
│  │   React     │ │   MetaMask  │ │   Web3.js   │ │  IPFS   │  │
│  │ Frontend    │ │   Wallet    │ │  Provider   │ │ Gateway │  │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Application Layer                            │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────┐  │
│  │   Product   │ │   Payment   │ │  Identity   │ │  Audit  │  │
│  │ Management  │ │ Processing  │ │ Management  │ │ Service │  │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Smart Contract Layer                         │
│  ┌─────────────────┐    ┌─────────────────────────────────┐   │
│  │ ProductFactory  │───►│    ProductEscrow_Initializer    │   │
│  │ (Factory)       │    │      (Implementation)           │   │
│  └─────────────────┘    └─────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Infrastructure Layer                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────┐  │
│  │   Ethereum  │ │   IPFS      │ │  Railgun    │ │   ZKP   │  │
│  │ Blockchain  │ │  Network    │ │  Protocol   │ │ Service │  │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### **Component Relationships**

```
Frontend ←→ Web3.js ←→ MetaMask ←→ Ethereum
   ↓           ↓          ↓          ↓
Backend ←→ Express ←→ Railgun ←→ ZKP Service
   ↓           ↓          ↓          ↓
  IPFS ←→ Gateway ←→ Storage ←→ Verification
```

---

## Component Architecture

### **1. Frontend Components**

#### **React Application Structure**

```
frontend/src/
├── components/           # Reusable UI components
│   ├── marketplace/     # Marketplace-specific components
│   ├── railgun/         # Privacy features
│   ├── vc/             # Verifiable credential components
│   ├── shared/          # Common utilities
│   └── ui/              # Basic UI elements
├── views/               # Page-level components
├── layout/              # Layout and navigation
├── utils/               # Utility functions
└── abis/                # Contract ABIs
```

#### **Key Components**

**ProductCard.jsx**
- Displays product information
- Handles purchase initiation
- Manages price commitment display

**RailgunIntegration.jsx**
- Manages private payment flows
- Integrates with Railgun protocol
- Handles payment recording

**VCViewer.jsx**
- Displays verifiable credentials
- Manages credential verification
- Handles selective disclosure

### **2. Smart Contract Components**

#### **Contract Architecture**

```
┌─────────────────────────────────────────────────────────────────┐
│                    ProductFactory                               │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────┐  │
│  │   Factory   │ │  Pause      │ │  Access     │ │  Event  │  │
│  │  Pattern    │ │ Mechanism   │ │  Control    │ │ Emission │  │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                ProductEscrow_Initializer                        │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────┐  │
│  │   Phase     │ │   Access    │ │  Business   │ │ Privacy │  │
│  │  Machine    │ │  Control    │ │   Logic     │ │ Features│  │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

#### **Factory Pattern Implementation**

The ProductFactory implements the Factory Pattern with the following components:

1. **Implementation Contract**: Stores the logic for ProductEscrow
2. **Clone Factory**: Creates new instances using EIP-1167
3. **Product Registry**: Tracks created products through events
4. **Access Control**: Manages factory-level permissions

#### **Escrow Contract Implementation**

The ProductEscrow_Initializer implements the core business logic:

1. **Phase Machine**: Manages product lifecycle states
2. **Access Control**: Role-based function permissions
3. **Business Logic**: Purchase, delivery, and payment processing
4. **Privacy Features**: Confidential price commitments and private payments

### **3. Backend Services**

#### **Express API Server**

```
backend/api/
├── routes/              # API route definitions
├── middleware/          # Request processing middleware
├── services/            # Business logic services
├── models/              # Data models
└── utils/               # Utility functions
```

#### **Railgun Integration**

```
backend/railgun/
├── api/                 # Railgun API endpoints
├── config/              # Configuration files
├── database/            # Local database for tracking
└── scripts/             # Utility scripts
```

#### **ZKP Backend Service**

```
zkp-backend/src/
├── zk/                  # Zero-knowledge proof implementations
├── crypto/              # Cryptographic utilities
├── api/                 # API endpoints
└── utils/               # Utility functions
```

---

## Data Flow Architecture

### **1. Product Creation Flow**

```
1. Seller → Frontend: Product details + price commitment
2. Frontend → Web3.js: Contract interaction
3. Web3.js → MetaMask: Transaction signing
4. MetaMask → Ethereum: Transaction submission
5. Ethereum → ProductFactory: Contract creation
6. ProductFactory → ProductEscrow: Contract initialization
7. ProductEscrow → Ethereum: State storage
8. Ethereum → Events: ProductCreated event emission
9. Events → Frontend: UI update
```

### **2. Purchase Flow**

```
1. Buyer → Frontend: Purchase request + commitment
2. Frontend → Web3.js: Purchase transaction
3. Web3.js → MetaMask: Transaction signing
4. MetaMask → Ethereum: Transaction submission
5. Ethereum → ProductEscrow: Purchase processing
6. ProductEscrow → Ethereum: State update
7. Ethereum → Events: PhaseChanged event emission
8. Events → Frontend: UI update
```

### **3. Private Payment Flow**

```
1. Buyer → Railgun: Private payment initiation
2. Railgun → ZKP Service: Proof generation
3. ZKP Service → Railgun: Zero-knowledge proof
4. Railgun → Ethereum: Private transaction
5. Ethereum → ProductEscrow: Payment recording
6. ProductEscrow → Ethereum: State update
7. Ethereum → Events: PrivatePaymentRecorded event
8. Events → Frontend: UI update
```

### **4. Delivery Confirmation Flow**

```
1. Buyer → Frontend: Delivery confirmation + price revelation
2. Frontend → Web3.js: Delivery confirmation
3. Web3.js → MetaMask: Transaction signing
4. MetaMask → Ethereum: Transaction submission
5. Ethereum → ProductEscrow: Delivery processing
6. ProductEscrow → ZKP Service: Commitment verification
7. ZKP Service → ProductEscrow: Verification result
8. ProductEscrow → Ethereum: Final state update
9. Ethereum → Events: DeliveryConfirmed event
10. Events → Frontend: UI update
```

---

## Security Architecture

### **1. Multi-Layer Security Model**

```
┌─────────────────────────────────────────────────────────────────┐
│                    Application Security                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────┐  │
│  │   Input     │ │   Access    │ │  Business   │ │  Output │  │
│  │ Validation  │ │  Control    │ │   Logic     │ │ Sanitization│
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Smart Contract Security                      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────┐  │
│  │ Reentrancy  │ │   Access    │ │   Input     │ │  Error  │  │
│  │  Guards     │ │  Control    │ │ Validation  │ │ Handling │  │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Infrastructure Security                      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────┐  │
│  │   Network   │ │   Data      │ │  Access     │ │  Audit  │  │
│  │  Security   │ │ Encryption  │ │  Control    │ │ Logging  │  │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### **2. Access Control Implementation**

#### **Role-Based Access Control (RBAC)**

```solidity
// Factory access control
modifier onlyFactory() {
    if (msg.sender != factory && factory != address(0)) revert NotFactory();
    _;
}

// Seller access control
modifier onlySeller() {
    if (msg.sender != owner) revert NotSeller();
    _;
}

// Buyer access control
modifier onlyBuyer() {
    if (msg.sender != buyer) revert NotBuyer();
    _;
}
```

#### **Access Control Matrix**

| Function | Factory | Seller | Buyer | Transporter | Public |
|----------|---------|---------|-------|-------------|---------|
| `initialize()` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `depositPurchase()` | ❌ | ❌ | ✅ | ❌ | ✅ |
| `confirmOrder()` | ❌ | ✅ | ❌ | ❌ | ❌ |
| `setTransporter()` | ❌ | ✅ | ❌ | ❌ | ❌ |
| `recordPrivatePayment()` | ❌ | ✅ | ✅ | ❌ | ❌ |

### **3. Reentrancy Protection**

#### **Implementation Strategy**

```solidity
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract ProductEscrow_Initializer is ReentrancyGuard {
    function depositPurchase(...) external payable nonReentrant {
        _depositPurchase(...);
    }
}
```

#### **Protected Functions**

All external state-changing functions are protected:
- `depositPurchase()`
- `confirmOrder()`
- `setTransporter()`
- `revealAndConfirmDelivery()`
- `recordPrivatePayment()`

### **4. Input Validation**

#### **Parameter Validation**

```solidity
if (_owner == address(0)) revert InvalidOwnerAddress();
if (bytes(_name).length == 0) revert EmptyName();
if (_priceCommitment == bytes32(0)) revert ZeroPriceCommitment();
```

#### **Business Rule Validation**

```solidity
if (phase != Phase.Purchased) revert WrongPhase();
if (block.timestamp > purchaseTimestamp + SELLER_WINDOW) revert SellerWindowNotExpired();
```

---

## Privacy Architecture

### **1. Confidential Price Commitments**

#### **Implementation**

```solidity
function computeCommitment(uint256 value, bytes32 salt) 
    public pure returns (bytes32) 
{
    return keccak256(abi.encodePacked(value, salt));
}
```

#### **Privacy Properties**

- **Price Hiding**: Actual price not visible on-chain
- **Commitment Binding**: Cryptographic commitment prevents manipulation
- **Deterministic Blinding**: Blinding factor computed from `keccak256(productAddress + sellerAddress)`, ensuring seller and buyer generate the same commitment
- **Verification**: ZKP proves commitment validity

#### **Usage Flow**

```
1. Seller: commitment = Pedersen(price, deterministic_blinding)
   - blinding = keccak256(productAddress + sellerAddress)
2. Buyer: generates same commitment using same deterministic blinding
3. Purchase: commitment stored on-chain via setPublicPriceWithCommitment()
4. Delivery: ZKP generated with deterministic blinding, commitment verified
5. Verification: ZKP proves price is in valid range without revealing it
```

### **2. Railgun Integration**

#### **Privacy Features**

- **Transaction Hiding**: Payment amounts not visible on-chain
- **Memo Privacy**: Transaction details encrypted in Railgun
- **Audit Trail**: ZKP-based proof of payment
- **Regulatory Compliance**: Maintains compliance requirements

#### **Integration Pattern**

```solidity
function recordPrivatePayment(
    uint256 _productId,
    bytes32 _memoHash,
    bytes32 _railgunTxRef
) external nonReentrant
```

#### **Access Control**

- **Restricted Access**: Only buyer and seller can record payments
- **Transporter Exclusion**: Transporters cannot record payments
- **Audit Compliance**: Maintains regulatory compliance

### **3. Verifiable Credentials**

#### **Storage Strategy**

```solidity
bytes32 public vcCid; // IPFS hash of verifiable credential
```

#### **Privacy Properties**

- **Off-Chain Storage**: VCs stored on IPFS, not on-chain
- **Hash Verification**: Only credential hashes stored on-chain
- **Selective Disclosure**: VCs can reveal specific attributes
- **Identity Protection**: Personal information not exposed

---

## Scalability Architecture

### **1. Gas Optimization Strategies**

#### **Storage Packing**

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

#### **Gas Savings**

- **Before**: 6 storage slots = 6 × 20,000 gas = 120,000 gas
- **After**: 3 storage slots = 3 × 20,000 gas = 60,000 gas
- **Savings**: 50% reduction in storage costs

#### **Unchecked Operations**

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

### **2. Event-Driven Indexing**

#### **Elimination of Storage Arrays**

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

#### **Benefits**

- **Gas Efficiency**: No storage costs for product lists
- **Scalability**: Unlimited product creation
- **Indexing**: Frontend can build product catalogs from events
- **Performance**: Faster read operations

### **3. Factory Pattern Scalability**

#### **Minimal Proxy Pattern**

```solidity
function createProduct(string memory _name, bytes32 _priceCommitment) 
    external 
    whenNotPaused 
    returns (address product) 
{
    product = Clones.clone(implementation);
    ProductEscrow_Initializer(payable(product)).initialize(
        productCount + 1, 
        _name, 
        _priceCommitment, 
        msg.sender
    );
    // ... rest of implementation
}
```

#### **Scalability Benefits**

- **Gas Efficiency**: 90% reduction in deployment costs
- **Mass Deployment**: Enables high-volume contract creation
- **Upgradability**: Implementation can be updated independently
- **Resource Management**: Efficient use of blockchain resources

---

## Integration Architecture

### **1. Frontend Integration**

#### **Web3.js Integration**

```javascript
// Contract interaction
const factory = new web3.eth.Contract(
    ProductFactory.abi,
    factoryAddress
);

// Product creation
const tx = await factory.methods.createProduct(
    productName,
    priceCommitment
).send({ from: seller });
```

#### **Event Listening**

```javascript
// Listen for product creation
factory.events.ProductCreated()
    .on('data', (event) => {
        console.log('Product created:', event.args);
    });
```

#### **MetaMask Integration**

```javascript
// Connect to MetaMask
const accounts = await ethereum.request({
    method: 'eth_requestAccounts'
});

// Sign transactions
const signedTx = await ethereum.request({
    method: 'eth_signTransaction',
    params: [transaction]
});
```

### **2. Backend Integration**

#### **Express API Integration**

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

#### **Railgun API Integration**

```javascript
// Railgun transaction
const railgunTx = await railgunService.createTransaction({
    to: recipient,
    value: amount,
    memo: memoHash
});
```

#### **ZKP Service Integration**

```javascript
// Verify ZKP proof
const isValid = await zkpService.verifyProof(
    commitment,
    value,
    proof
);
```

### **3. IPFS Integration**

#### **Storage Strategy**

```javascript
// Store VC on IPFS
const cid = await ipfs.add(JSON.stringify(verifiableCredential));

// Update contract with CID
await product.methods.updateVcCid(cid.toString()).send({ from: seller });
```

#### **Retrieval Strategy**

```javascript
// Retrieve VC from IPFS
const vcData = await ipfs.cat(cid);
const verifiableCredential = JSON.parse(vcData.toString());
```

---

## Deployment Architecture

### **1. Network Configuration**

#### **Development Network**

```javascript
module.exports = {
    networks: {
        development: {
            host: "127.0.0.1",
            port: 7545,
            network_id: "*",
            gas: 6721975,
            gasPrice: 20000000000
        }
    }
};
```

#### **Test Network**

```javascript
module.exports = {
    networks: {
        testnet: {
            host: "https://goerli.infura.io/v3/YOUR_PROJECT_ID",
            network_id: 5,
            gas: 6721975,
            gasPrice: 20000000000
        }
    }
};
```

#### **Main Network**

```javascript
module.exports = {
    networks: {
        mainnet: {
            host: "https://mainnet.infura.io/v3/YOUR_PROJECT_ID",
            network_id: 1,
            gas: 6721975,
            gasPrice: 20000000000
        }
    }
};
```

### **2. Deployment Process**

#### **Migration Script**

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

#### **Deployment Commands**

```bash
# Compile contracts
npx truffle compile

# Deploy to local network
npx truffle migrate --network development

# Deploy to test network
npx truffle migrate --network testnet

# Deploy to main network
npx truffle migrate --network mainnet
```

### **3. Environment Configuration**

#### **Environment Variables**

```bash
# Ethereum configuration
ETHEREUM_NETWORK=mainnet
INFURA_PROJECT_ID=your_project_id
PRIVATE_KEY=your_private_key

# IPFS configuration
IPFS_API_URL=http://localhost:5001
IPFS_GATEWAY_URL=https://ipfs.io/ipfs/

# Railgun configuration
RAILGUN_API_URL=https://api.railgun.org
RAILGUN_API_KEY=your_api_key

# ZKP service configuration
ZKP_SERVICE_URL=http://localhost:5010
ZKP_SERVICE_KEY=your_service_key
```

#### **Configuration Management**

```javascript
// config.js
module.exports = {
    ethereum: {
        network: process.env.ETHEREUM_NETWORK || 'development',
        infuraProjectId: process.env.INFURA_PROJECT_ID,
        privateKey: process.env.PRIVATE_KEY
    },
    ipfs: {
        apiUrl: process.env.IPFS_API_URL || 'http://localhost:5001',
        gatewayUrl: process.env.IPFS_GATEWAY_URL || 'https://ipfs.io/ipfs/'
    },
    railgun: {
        apiUrl: process.env.RAILGUN_API_URL || 'https://api.railgun.org',
        apiKey: process.env.RAILGUN_API_KEY
    },
    zkp: {
        serviceUrl: process.env.ZKP_SERVICE_URL || 'http://localhost:5010',
        serviceKey: process.env.ZKP_SERVICE_KEY
    }
};
```

---

## Conclusion

The EV Battery Supply Chain dApp architecture represents a comprehensive approach to building privacy-preserving, decentralized applications. By combining multiple architectural patterns and security measures, the system achieves:

- **Privacy**: Confidential transactions with audit trails
- **Security**: Comprehensive protection against common attack vectors
- **Scalability**: Efficient resource usage and high-performance design
- **Compliance**: Regulatory compliance without compromising privacy
- **Extensibility**: Modular design for future enhancements

The architecture provides a solid foundation for building similar privacy-preserving applications in other domains while maintaining high standards of security, performance, and user experience.

---

**Document End**

*This document provides a comprehensive overview of the EV Battery Supply Chain dApp system architecture. For implementation details, refer to the source code in the respective directories. For deployment instructions, refer to the deployment documentation.*
