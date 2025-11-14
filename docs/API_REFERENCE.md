# EV Battery Supply Chain dApp - API Reference

**Document Version:** 1.0  
**Last Updated:** December 2024  
**Author:** EV Battery Supply Chain Development Team  

---

## Table of Contents

1. [Smart Contract APIs](#smart-contract-apis)
2. [Frontend Integration APIs](#frontend-integration-apis)
3. [Backend Service APIs](#backend-service-apis)
4. [Railgun Integration APIs](#railgun-integration-apis)
5. [ZKP Service APIs](#zkp-service-apis)
6. [IPFS Integration APIs](#ipfs-integration-apis)
7. [Error Codes and Handling](#error-codes-and-handling)
8. [Event Specifications](#event-specifications)
9. [Integration Examples](#integration-examples)
10. [Testing and Validation](#testing-and-validation)

---

## Smart Contract APIs

### ProductFactory Contract

The ProductFactory contract manages the creation and lifecycle of product escrow contracts using the Minimal Proxy Pattern (EIP-1167).

#### **Contract Information**

```solidity
contract ProductFactory is Ownable {
    address public implementation;
    uint256 public productCount;
    bool public isPaused;
}
```

#### **Core Functions**

##### **createProduct**

Creates a new product escrow contract.

```solidity
function createProduct(
    string memory _name,
    bytes32 _priceCommitment
) external whenNotPaused returns (address product)
```

**Parameters:**
- `_name` (string): Human-readable product identifier
- `_priceCommitment` (bytes32): Cryptographic hash of price + blinding factor

**Returns:**
- `product` (address): Address of the newly created ProductEscrow contract

**Access Control:** Public (when not paused)

**Events Emitted:**
- `ProductCreated(uint256 indexed productId, address indexed product, address indexed seller, string name, bytes32 priceCommitment, uint256 timestamp)`

**Example Usage:**
```javascript
const tx = await factory.createProduct(
    "EV Battery Pack",
    priceCommitment,
    { from: seller }
);
const productAddress = tx.logs.find(log => log.event === "ProductCreated").args.product;
```

##### **createProductDeterministic**

Creates a new product escrow contract with a deterministic address.

```solidity
function createProductDeterministic(
    string memory _name,
    bytes32 _priceCommitment,
    bytes32 _salt
) external whenNotPaused returns (address product)
```

**Parameters:**
- `_name` (string): Human-readable product identifier
- `_priceCommitment` (bytes32): Cryptographic hash of price + blinding factor
- `_salt` (bytes32): Unique salt for deterministic address generation

**Returns:**
- `product` (address): Address of the newly created ProductEscrow contract

**Access Control:** Public (when not paused)

**Use Case:** When you need to predict the contract address before creation

##### **updateImplementation**

Updates the implementation contract address.

```solidity
function updateImplementation(address _impl) external onlyOwner
```

**Parameters:**
- `_impl` (address): New implementation contract address

**Access Control:** Only owner

**Events Emitted:**
- `ImplementationUpdated(address indexed oldImpl, address indexed newImpl, uint256 timestamp)`

**Security Note:** This function allows the owner to update the implementation for all future products

##### **pause / unpause**

Controls the factory pause state.

```solidity
function pause() external onlyOwner
function unpause() external onlyOwner
```

**Access Control:** Only owner

**Events Emitted:**
- `FactoryPaused(address indexed by)`
- `FactoryUnpaused(address indexed by)`

**Use Case:** Emergency situations requiring immediate halt of product creation

##### **getProductsRange**

Retrieves a range of product addresses for indexing.

```solidity
function getProductsRange(uint256 start, uint256 count) 
    external 
    view 
    returns (address[] memory products)
```

**Parameters:**
- `start` (uint256): Starting index
- `count` (uint256): Number of products to retrieve

**Returns:**
- `products` (address[]): Array of product contract addresses

**Use Case:** Frontend pagination and product listing

#### **View Functions**

##### **productCount**

Returns the total number of products created.

```solidity
function productCount() external view returns (uint256)
```

**Returns:**
- `uint256`: Total number of products

##### **implementation**

Returns the current implementation contract address.

```solidity
function implementation() external view returns (address)
```

**Returns:**
- `address`: Implementation contract address

##### **isPaused**

Returns the current pause state.

```solidity
function isPaused() external view returns (bool)
```

**Returns:**
- `bool`: True if factory is paused, false otherwise

---

### ProductEscrow_Initializer Contract

The ProductEscrow_Initializer contract implements the core business logic for individual product transactions.

#### **Contract Information**

```solidity
contract ProductEscrow_Initializer is ReentrancyGuard {
    uint256 public id;
    string public name;
    bytes32 public priceCommitment;
    address payable public owner;
    address payable public buyer;
    address payable public transporter;
    Phase public phase;
    uint64 public purchaseTimestamp;
    uint64 public orderConfirmedTimestamp;
    bool public purchased;
    bool public delivered;
    uint32 public transporterCount;
}
```

#### **State Management**

##### **Phase Enum**

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

#### **Core Business Functions**

##### **initialize**

Initializes a new product escrow contract.

```solidity
function initialize(
    uint256 _id,
    string memory _name,
    bytes32 _priceCommitment,
    address _owner
) external onlyFactory
```

**Parameters:**
- `_id` (uint256): Unique product identifier
- `_name` (string): Product name
- `_priceCommitment` (bytes32): Price commitment hash
- `_owner` (address): Product owner/seller address

**Access Control:** Only factory

**Events Emitted:**
- `ProductStateChanged(uint256 indexed productId, address indexed seller, address indexed buyer, Phase phase, uint256 timestamp, bytes32 priceCommitment, bool purchased, bool delivered)`
- `PhaseChanged(uint256 indexed productId, Phase indexed from, Phase indexed to, address actor, uint256 timestamp, uint256 value, bytes32 ref)`

**Security Note:** This function can only be called once per contract

##### **depositPurchase**

Processes a product purchase.

```solidity
function depositPurchase(
    bytes32 _commitment,
    bytes32 _valueCommitment,
    bytes calldata _valueRangeProof
) external payable nonReentrant
```

**Parameters:**
- `_commitment` (bytes32): Cryptographic commitment to the actual price
- `_valueCommitment` (bytes32): ZKP commitment for value verification
- `_valueRangeProof` (bytes): Bulletproofs+ proof of value range

**Value:** Must match the committed price

**Access Control:** Public (non-owner)

**Events Emitted:**
- `PhaseChanged(uint256 indexed productId, Phase indexed from, Phase indexed to, address actor, uint256 timestamp, uint256 value, bytes32 ref)`
- `ProductStateChanged(uint256 indexed productId, address indexed seller, address indexed buyer, Phase phase, uint256 timestamp, bytes32 priceCommitment, bool purchased, bool delivered)`
- `ValueCommitted(bytes32 commitment, bytes proof)`
- `OrderConfirmed(address indexed buyer, address indexed seller, uint256 indexed productId, bytes32 priceCommitment, string vcCID, uint256 timestamp)`

**Example Usage:**
```javascript
await product.depositPurchase(
    commitment,
    valueCommitment,
    valueRangeProof,
    { from: buyer, value: price }
);
```

##### **confirmOrder**

Confirms the order after purchase.

```solidity
function confirmOrder(string memory vcCID) external nonReentrant
```

**Parameters:**
- `vcCID` (string): IPFS hash of the verifiable credential

**Access Control:** Only seller

**Events Emitted:**
- `PhaseChanged(uint256 indexed productId, Phase indexed from, Phase indexed to, address actor, uint256 timestamp, uint256 value, bytes32 ref)`
- `VcUpdated(uint256 indexed productId, string cid, address indexed seller, uint256 timestamp)`
- `OrderConfirmed(address indexed buyer, address indexed seller, uint256 indexed productId, bytes32 priceCommitment, string vcCID, uint256 timestamp)`

**Timeout:** Must be called within 48 hours of purchase

##### **createTransporter**

Registers a transporter for bidding.

```solidity
function createTransporter(uint _feeInWei) external nonReentrant
```

**Parameters:**
- `_feeInWei` (uint): Transporter's delivery fee in wei

**Access Control:** Public

**Events Emitted:**
- `TransporterCreated(address indexed transporter, uint256 indexed productId, uint fee, uint256 timestamp)`

**Limits:** Maximum of 20 transporters per product

##### **setTransporter**

Selects a transporter for delivery.

```solidity
function setTransporter(address payable _transporter) external payable nonReentrant
```

**Parameters:**
- `_transporter` (address): Selected transporter address

**Value:** Must match the transporter's fee

**Access Control:** Only seller

**Events Emitted:**
- `PhaseChanged(uint256 indexed productId, Phase indexed from, Phase indexed to, address actor, uint256 timestamp, uint256 value, bytes32 ref)`

**Timeout:** Must be called within 48 hours of order confirmation

##### **revealAndConfirmDelivery**

Confirms product delivery and reveals the price.

```solidity
function revealAndConfirmDelivery(
    uint revealedValue,
    bytes32 blinding,
    string memory vcCID
) external nonReentrant
```

**Parameters:**
- `revealedValue` (uint): Actual product price
- `blinding` (bytes32): Blinding factor used in price commitment
- `vcCID` (string): IPFS hash of delivery verification credential

**Access Control:** Only buyer

**Events Emitted:**
- `PhaseChanged(uint256 indexed productId, Phase indexed from, Phase indexed to, address actor, uint256 timestamp, uint256 value, bytes32 ref)`
- `VcUpdated(uint256 indexed productId, string cid, address indexed buyer, uint256 timestamp)`
- `DeliveryConfirmed(address indexed buyer, address indexed transporter, address indexed seller, uint256 productId, bytes32 priceCommitment, string vcCID, uint256 timestamp)`

**Security Note:** Price commitment is verified cryptographically

#### **Privacy and Payment Functions**

##### **recordPrivatePayment**

Records a private payment made through Railgun.

```solidity
function recordPrivatePayment(
    uint256 _productId,
    bytes32 _memoHash,
    bytes32 _railgunTxRef
) external nonReentrant
```

**Parameters:**
- `_productId` (uint256): Product identifier
- `_memoHash` (bytes32): Hash of payment memo
- `_railgunTxRef` (bytes32): Railgun transaction reference

**Access Control:** Only buyer or seller (no transporter)

**Events Emitted:**
- `PrivatePaymentRecorded(uint256 indexed productId, bytes32 memoHash, bytes32 railgunTxRef, address indexed recorder, uint256 timestamp)`

**Use Case:** Recording private payments for audit compliance

##### **hasPrivatePayment**

Checks if a private payment has been recorded.

```solidity
function hasPrivatePayment() external view returns (bool)
```

**Returns:**
- `bool`: True if private payment exists, false otherwise

##### **getPrivatePaymentDetails**

Retrieves private payment details.

```solidity
function getPrivatePaymentDetails() 
    external 
    view 
    returns (bytes32 memoHash, bytes32 railgunTxRef, address recorder)
```

**Returns:**
- `memoHash` (bytes32): Hash of payment memo
- `railgunTxRef` (bytes32): Railgun transaction reference
- `recorder` (address): Address that recorded the payment

#### **Utility Functions**

##### **computeCommitment**

Computes a price commitment hash.

```solidity
function computeCommitment(uint256 value, bytes32 salt) 
    public 
    pure 
    returns (bytes32)
```

**Parameters:**
- `value` (uint256): Price value
- `salt` (bytes32): Blinding factor (deterministic: `keccak256(productAddress + sellerAddress)`)

**Returns:**
- `bytes32`: Computed commitment hash

**Use Case:** Frontend generation of price commitments. Note: In practice, the blinding factor is deterministically generated from product and seller addresses, ensuring both parties generate the same commitment.

##### **getAllTransporters**

Retrieves all registered transporters and their fees.

```solidity
function getAllTransporters() 
    external 
    view 
    returns (address[] memory, uint[] memory)
```

**Returns:**
- `address[]`: Array of transporter addresses
- `uint[]`: Array of corresponding fees

**Use Case:** Displaying transporter options to seller

#### **Timeout and Cleanup Functions**

##### **timeout**

Handles delivery timeout scenarios.

```solidity
function timeout() external nonReentrant
```

**Access Control:** Public

**Events Emitted:**
- `PhaseChanged(uint256 indexed productId, Phase indexed from, Phase indexed to, address actor, uint256 timestamp, uint256 value, bytes32 ref)`
- `DeliveryTimeoutEvent(address indexed caller, uint256 indexed productId, uint time, uint256 timestamp)`
- `FundsTransferred(address indexed to, uint256 indexed productId, uint amount, uint256 timestamp)`
- `PenaltyApplied(address indexed to, uint256 indexed productId, uint amount, string reason, uint256 timestamp)`

**Timeout:** Must be called after delivery window expires

##### **sellerTimeout**

Handles seller confirmation timeout.

```solidity
function sellerTimeout() external nonReentrant
```

**Access Control:** Public

**Events Emitted:**
- `PhaseChanged(uint256 indexed productId, Phase indexed from, Phase indexed to, address actor, uint256 timestamp, uint256 value, bytes32 ref)`
- `SellerTimeout(address indexed caller, uint256 indexed productId, uint time, uint256 timestamp)`
- `FundsTransferred(address indexed to, uint256 indexed productId, uint amount, uint256 timestamp)`

**Timeout:** Must be called after seller window expires

##### **bidTimeout**

Handles transporter bidding timeout.

```solidity
function bidTimeout() external nonReentrant
```

**Access Control:** Public

**Events Emitted:**
- `PhaseChanged(uint256 indexed productId, Phase indexed from, Phase indexed to, address actor, uint256 timestamp, uint256 value, bytes32 ref)`
- `FundsTransferred(address indexed to, uint256 indexed productId, uint amount, uint256 timestamp)`

**Timeout:** Must be called after bidding window expires

---

## Frontend Integration APIs

### Web3.js Integration

#### **Contract Instantiation**

```javascript
// Factory contract
const factory = new web3.eth.Contract(
    ProductFactory.abi,
    factoryAddress
);

// Product contract
const product = new web3.eth.Contract(
    ProductEscrow_Initializer.abi,
    productAddress
);
```

#### **Product Creation**

```javascript
async function createProduct(name, price, salt) {
    // Generate price commitment
    const priceCommitment = web3.utils.soliditySha3(
        { type: "uint256", value: price },
        { type: "bytes32", value: salt }
    );
    
    // Create product
    const tx = await factory.methods.createProduct(name, priceCommitment)
        .send({ from: seller });
    
    return tx.logs.find(log => log.event === "ProductCreated").args.product;
}
```

#### **Product Purchase**

```javascript
async function purchaseProduct(product, price, salt, valueCommitment, proof) {
    // Generate commitment
    const commitment = web3.utils.soliditySha3(
        { type: "uint256", value: price },
        { type: "bytes32", value: salt }
    );
    
    // Purchase product
    await product.methods.depositPurchase(commitment, valueCommitment, proof)
        .send({ from: buyer, value: price });
}
```

#### **Event Listening**

```javascript
// Listen for product creation
factory.events.ProductCreated()
    .on('data', (event) => {
        console.log('Product created:', event.args);
        updateProductList(event.args);
    });

// Listen for phase changes
product.events.PhaseChanged()
    .on('data', (event) => {
        console.log('Phase changed:', event.args);
        updateProductStatus(event.args);
    });
```

### MetaMask Integration

#### **Account Connection**

```javascript
async function connectWallet() {
    if (typeof window.ethereum !== 'undefined') {
        try {
            const accounts = await ethereum.request({
                method: 'eth_requestAccounts'
            });
            return accounts[0];
        } catch (error) {
            console.error('User rejected account access');
            return null;
        }
    } else {
        console.error('MetaMask not installed');
        return null;
    }
}
```

#### **Transaction Signing**

```javascript
async function signTransaction(transaction) {
    try {
        const signedTx = await ethereum.request({
            method: 'eth_signTransaction',
            params: [transaction]
        });
        return signedTx;
    } catch (error) {
        console.error('Transaction signing failed:', error);
        throw error;
    }
}
```

---

## Backend Service APIs

### Express API Server

#### **Product Management Endpoints**

##### **GET /api/products**

Retrieves a list of products with pagination.

```javascript
GET /api/products?page=1&limit=10
```

**Query Parameters:**
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 10)

**Response:**
```json
{
    "products": [
        {
            "id": "1",
            "name": "EV Battery Pack",
            "seller": "0x1234...",
            "phase": "Listed",
            "priceCommitment": "0xabcd...",
            "createdAt": "2024-12-01T00:00:00Z"
        }
    ],
    "pagination": {
        "page": 1,
        "limit": 10,
        "total": 25,
        "pages": 3
    }
}
```

##### **GET /api/products/:id**

Retrieves detailed information about a specific product.

```javascript
GET /api/products/1
```

**Response:**
```json
{
    "id": "1",
    "name": "EV Battery Pack",
    "seller": "0x1234...",
    "buyer": "0x5678...",
    "transporter": "0x9abc...",
    "phase": "Bound",
    "priceCommitment": "0xabcd...",
    "purchaseTimestamp": "2024-12-01T00:00:00Z",
    "orderConfirmedTimestamp": "2024-12-01T02:00:00Z",
    "deliveryFee": "1000000000000000000",
    "createdAt": "2024-12-01T00:00:00Z"
}
```

##### **POST /api/products**

Creates a new product.

```javascript
POST /api/products
Content-Type: application/json

{
    "name": "EV Battery Pack",
    "price": "5000000000000000000",
    "seller": "0x1234..."
}
```

**Request Body:**
- `name` (string): Product name
- `price` (string): Product price in wei
- `seller` (string): Seller's Ethereum address

**Response:**
```json
{
    "success": true,
    "productId": "1",
    "contractAddress": "0xdef0...",
    "transactionHash": "0x1234..."
}
```

#### **Payment Processing Endpoints**

##### **POST /api/payments/private**

Records a private payment.

```javascript
POST /api/payments/private
Content-Type: application/json

{
    "productId": "1",
    "memoHash": "0xabcd...",
    "railgunTxRef": "0xdef0...",
    "recorder": "0x1234..."
}
```

**Request Body:**
- `productId` (string): Product identifier
- `memoHash` (string): Payment memo hash
- `railgunTxRef` (string): Railgun transaction reference
- `recorder` (string): Address recording the payment

**Response:**
```json
{
    "success": true,
    "transactionHash": "0x1234..."
}
```

##### **GET /api/payments/:productId**

Retrieves payment information for a product.

```javascript
GET /api/payments/1
```

**Response:**
```json
{
    "hasPayment": true,
    "memoHash": "0xabcd...",
    "railgunTxRef": "0xdef0...",
    "recorder": "0x1234...",
    "recordedAt": "2024-12-01T00:00:00Z"
}
```

#### **Transporter Management Endpoints**

##### **POST /api/transporters**

Registers a new transporter.

```javascript
POST /api/transporters
Content-Type: application/json

{
    "productId": "1",
    "transporter": "0x9abc...",
    "fee": "1000000000000000000"
}
```

**Request Body:**
- `productId` (string): Product identifier
- `transporter` (string): Transporter's Ethereum address
- `fee` (string): Delivery fee in wei

**Response:**
```json
{
    "success": true,
    "transactionHash": "0x1234..."
}
```

##### **GET /api/transporters/:productId**

Retrieves all transporters for a product.

```javascript
GET /api/transporters/1
```

**Response:**
```json
{
    "transporters": [
        {
            "address": "0x9abc...",
            "fee": "1000000000000000000",
            "securityDeposit": "500000000000000000"
        }
    ]
}
```

---

## Railgun Integration APIs

### Railgun Service Integration

#### **Private Transaction Creation**

```javascript
async function createPrivateTransaction(recipient, amount, memo) {
    const response = await fetch('/api/railgun/create-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            to: recipient,
            value: amount,
            memo: memo
        })
    });
    
    return response.json();
}
```

#### **Transaction Verification**

```javascript
async function verifyPrivateTransaction(txHash) {
    const response = await fetch(`/api/railgun/verify/${txHash}`);
    return response.json();
}
```

#### **Balance Checking**

```javascript
async function getPrivateBalance(address) {
    const response = await fetch(`/api/railgun/balance/${address}`);
    return response.json();
}
```

---

## ZKP Service APIs

### Zero-Knowledge Proof Generation

#### **Proof Generation**

```javascript
async function generateProof(commitment, value, salt) {
    const response = await fetch('/api/zkp/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            commitment: commitment,
            value: value,
            salt: salt
        })
    });
    
    return response.json();
}
```

#### **Proof Verification**

```javascript
async function verifyProof(commitment, value, proof) {
    const response = await fetch('/api/zkp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            commitment: commitment,
            value: value,
            proof: proof
        })
    });
    
    return response.json();
}
```

---

## IPFS Integration APIs

### File Storage and Retrieval

#### **File Upload**

```javascript
async function uploadToIPFS(data) {
    const response = await fetch('/api/ipfs/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: data })
    });
    
    return response.json();
}
```

#### **File Retrieval**

```javascript
async function retrieveFromIPFS(cid) {
    const response = await fetch(`/api/ipfs/retrieve/${cid}`);
    return response.json();
}
```

---

## Error Codes and Handling

### Smart Contract Errors

#### **Custom Error Types**

```solidity
// Role-specific errors
error NotBuyer();
error NotSeller();
error NotTransporter();
error NotFactory();

// Business logic errors
error InvalidPhase();
error WrongPhase();
error AlreadyPurchased();
error AlreadyDelivered();

// Transfer errors
error TransferFailed(address to, uint256 amount);
error BuyerRefundFailed();
error RefundFailed();
```

#### **Error Handling in Frontend**

```javascript
try {
    await product.methods.depositPurchase(commitment, valueCommitment, proof)
        .send({ from: buyer, value: price });
} catch (error) {
    if (error.message.includes('NotBuyer')) {
        console.error('Access denied: Only buyer can call this function');
    } else if (error.message.includes('WrongPhase')) {
        console.error('Invalid operation: Wrong product phase');
    } else if (error.message.includes('AlreadyPurchased')) {
        console.error('Product already purchased');
    } else {
        console.error('Transaction failed:', error.message);
    }
}
```

### HTTP API Errors

#### **Error Response Format**

```json
{
    "error": {
        "code": "INVALID_PRODUCT_ID",
        "message": "Product ID is invalid or does not exist",
        "details": {
            "productId": "999",
            "availableIds": ["1", "2", "3"]
        }
    },
    "timestamp": "2024-12-01T00:00:00Z",
    "requestId": "req_123456789"
}
```

#### **Common Error Codes**

| Code | Message | Description |
|------|---------|-------------|
| `INVALID_PRODUCT_ID` | Product ID is invalid or does not exist | The specified product ID is not found |
| `INVALID_ADDRESS` | Invalid Ethereum address format | The address format is incorrect |
| `INSUFFICIENT_FUNDS` | Insufficient funds for transaction | User doesn't have enough ETH |
| `UNAUTHORIZED` | Unauthorized access | User doesn't have permission |
| `VALIDATION_ERROR` | Input validation failed | Request parameters are invalid |
| `INTERNAL_ERROR` | Internal server error | Unexpected server error |

---

## Event Specifications

### Smart Contract Events

#### **Product Lifecycle Events**

##### **ProductCreated**

```solidity
event ProductCreated(
    uint256 indexed productId,
    address indexed product,
    address indexed seller,
    string name,
    bytes32 priceCommitment,
    uint256 timestamp
);
```

**Event Data:**
- `productId`: Unique product identifier
- `product`: Product contract address
- `seller`: Seller's Ethereum address
- `name`: Product name
- `priceCommitment`: Price commitment hash
- `timestamp`: Event timestamp

##### **PhaseChanged**

```solidity
event PhaseChanged(
    uint256 indexed productId,
    Phase indexed from,
    Phase indexed to,
    address actor,
    uint256 timestamp,
    uint256 value,
    bytes32 ref
);
```

**Event Data:**
- `productId`: Product identifier
- `from`: Previous phase
- `to`: New phase
- `actor`: Address that triggered the change
- `timestamp`: Event timestamp
- `value`: Associated value (if any)
- `ref`: Reference data (if any)

##### **OrderConfirmed**

```solidity
event OrderConfirmed(
    address indexed buyer,
    address indexed seller,
    uint256 indexed productId,
    bytes32 priceCommitment,
    string vcCID,
    uint256 timestamp
);
```

**Event Data:**
- `buyer`: Buyer's Ethereum address
- `seller`: Seller's Ethereum address
- `productId`: Product identifier
- `priceCommitment`: Price commitment hash
- `vcCID`: Verifiable credential IPFS hash
- `timestamp`: Event timestamp

#### **Payment and Delivery Events**

##### **PrivatePaymentRecorded**

```solidity
event PrivatePaymentRecorded(
    uint256 indexed productId,
    bytes32 memoHash,
    bytes32 railgunTxRef,
    address indexed recorder,
    uint256 timestamp
);
```

**Event Data:**
- `productId`: Product identifier
- `memoHash`: Payment memo hash
- `railgunTxRef`: Railgun transaction reference
- `recorder`: Address that recorded the payment
- `timestamp`: Event timestamp

##### **DeliveryConfirmed**

```solidity
event DeliveryConfirmed(
    address indexed buyer,
    address indexed transporter,
    address indexed seller,
    uint256 productId,
    bytes32 priceCommitment,
    string vcCID,
    uint256 timestamp
);
```

**Event Data:**
- `buyer`: Buyer's Ethereum address
- `transporter`: Transporter's Ethereum address
- `seller`: Seller's Ethereum address
- `productId`: Product identifier
- `priceCommitment`: Price commitment hash
- `vcCID`: Delivery verification credential hash
- `timestamp`: Event timestamp

#### **Transporter Events**

##### **TransporterCreated**

```solidity
event TransporterCreated(
    address indexed transporter,
    uint256 indexed productId,
    uint fee,
    uint256 timestamp
);
```

**Event Data:**
- `transporter`: Transporter's Ethereum address
- `productId`: Product identifier
- `fee`: Delivery fee in wei
- `timestamp`: Event timestamp

##### **TransporterSecurityDeposit**

```solidity
event TransporterSecurityDeposit(
    address indexed transporter,
    uint256 indexed productId,
    uint price,
    uint256 timestamp
);
```

**Event Data:**
- `transporter`: Transporter's Ethereum address
- `productId`: Product identifier
- `price`: Security deposit amount in wei
- `timestamp`: Event timestamp

### Event Indexing and Filtering

#### **Event Filtering**

```javascript
// Filter events by product ID
const events = await product.getPastEvents('PhaseChanged', {
    filter: { productId: '1' },
    fromBlock: 0,
    toBlock: 'latest'
});

// Filter events by address
const events = await product.getPastEvents('PhaseChanged', {
    filter: { actor: buyerAddress },
    fromBlock: 0,
    toBlock: 'latest'
});
```

#### **Event Parsing**

```javascript
function parsePhaseChangedEvent(event) {
    return {
        productId: event.args.productId.toString(),
        fromPhase: getPhaseName(event.args.from),
        toPhase: getPhaseName(event.args.to),
        actor: event.args.actor,
        timestamp: new Date(event.args.timestamp * 1000),
        value: event.args.value.toString(),
        ref: event.args.ref
    };
}

function getPhaseName(phaseNumber) {
    const phases = ['Listed', 'Purchased', 'OrderConfirmed', 'Bound', 'Delivered', 'Expired'];
    return phases[phaseNumber];
}
```

---

## Integration Examples

### Complete Product Lifecycle

#### **1. Product Creation**

```javascript
async function createProductLifecycle() {
    // 1. Generate price commitment
    const price = web3.utils.toWei('5', 'ether');
    const salt = web3.utils.randomHex(32);
    const priceCommitment = web3.utils.soliditySha3(
        { type: 'uint256', value: price },
        { type: 'bytes32', value: salt }
    );
    
    // 2. Create product
    const tx = await factory.methods.createProduct('EV Battery Pack', priceCommitment)
        .send({ from: seller });
    
    const productAddress = tx.logs.find(log => log.event === 'ProductCreated').args.product;
    const product = new web3.eth.Contract(ProductEscrow_Initializer.abi, productAddress);
    
    console.log('Product created:', productAddress);
    return { product, price, salt };
}
```

#### **2. Product Purchase**

```javascript
async function purchaseProduct(product, price, salt) {
    // 1. Generate purchase commitment
    const commitment = web3.utils.soliditySha3(
        { type: 'uint256', value: price },
        { type: 'bytes32', value: salt }
    );
    
    // 2. Generate ZKP commitment and proof (simplified)
    const valueCommitment = web3.utils.randomHex(32);
    const valueRangeProof = '0x';
    
    // 3. Purchase product
    await product.methods.depositPurchase(commitment, valueCommitment, valueRangeProof)
        .send({ from: buyer, value: price });
    
    console.log('Product purchased');
}
```

#### **3. Order Confirmation**

```javascript
async function confirmOrder(product, vcCID) {
    await product.methods.confirmOrder(vcCID)
        .send({ from: seller });
    
    console.log('Order confirmed');
}
```

#### **4. Transporter Selection**

```javascript
async function selectTransporter(product, transporterAddress, fee) {
    await product.methods.setTransporter(transporterAddress)
        .send({ from: seller, value: fee });
    
    console.log('Transporter selected');
}
```

#### **5. Delivery Confirmation**

```javascript
async function confirmDelivery(product, price, salt, vcCID) {
    await product.methods.revealAndConfirmDelivery(price, salt, vcCID)
        .send({ from: buyer });
    
    console.log('Delivery confirmed');
}
```

### Private Payment Integration

#### **1. Record Private Payment**

```javascript
async function recordPrivatePayment(product, productId, memoHash, railgunTxRef) {
    await product.methods.recordPrivatePayment(productId, memoHash, railgunTxRef)
        .send({ from: buyer });
    
    console.log('Private payment recorded');
}
```

#### **2. Check Payment Status**

```javascript
async function checkPaymentStatus(product) {
    const hasPayment = await product.methods.hasPrivatePayment().call();
    
    if (hasPayment) {
        const [memoHash, railgunTxRef, recorder] = await product.methods.getPrivatePaymentDetails().call();
        console.log('Payment details:', { memoHash, railgunTxRef, recorder });
    } else {
        console.log('No private payment recorded');
    }
}
```

---

## Testing and Validation

### Smart Contract Testing

#### **Test Structure**

```javascript
const ProductEscrow_Initializer = artifacts.require("ProductEscrow_Initializer");
const ProductFactory = artifacts.require("ProductFactory");

contract("ProductEscrow Tests", (accounts) => {
    let implementation, factory, product;
    const seller = accounts[1];
    const buyer = accounts[2];
    const transporter = accounts[4];
    
    beforeEach(async () => {
        // Setup test environment
        implementation = await ProductEscrow_Initializer.new();
        factory = await ProductFactory.new(implementation.address);
        
        // Create test product
        const tx = await factory.createProduct("Test Product", "0x1234", { from: seller });
        const productAddress = tx.logs.find(log => log.event === "ProductCreated").args.product;
        product = await ProductEscrow_Initializer.at(productAddress);
    });
    
    describe("Product Creation", () => {
        it("should create product with correct parameters", async () => {
            const name = await product.name();
            assert.equal(name, "Test Product", "Product name should match");
        });
    });
    
    describe("Product Purchase", () => {
        it("should allow buyer to purchase product", async () => {
            const price = web3.utils.toWei("1", "ether");
            const commitment = web3.utils.randomHex(32);
            const valueCommitment = web3.utils.randomHex(32);
            const valueRangeProof = "0x";
            
            await product.depositPurchase(
                commitment,
                valueCommitment,
                valueRangeProof,
                { from: buyer, value: price }
            );
            
            const purchased = await product.purchased();
            assert.equal(purchased, true, "Product should be marked as purchased");
        });
    });
});
```

### API Testing

#### **API Test Structure**

```javascript
const request = require('supertest');
const app = require('../app');

describe('Product API', () => {
    describe('GET /api/products', () => {
        it('should return list of products', async () => {
            const response = await request(app)
                .get('/api/products')
                .expect(200);
            
            expect(response.body).toHaveProperty('products');
            expect(response.body).toHaveProperty('pagination');
        });
    });
    
    describe('POST /api/products', () => {
        it('should create new product', async () => {
            const productData = {
                name: 'Test Product',
                price: '1000000000000000000',
                seller: '0x1234567890123456789012345678901234567890'
            };
            
            const response = await request(app)
                .post('/api/products')
                .send(productData)
                .expect(201);
            
            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('productId');
        });
    });
});
```

### Integration Testing

#### **End-to-End Test**

```javascript
describe('Complete Product Lifecycle', () => {
    it('should complete full product lifecycle', async () => {
        // 1. Create product
        const { product, price, salt } = await createProductLifecycle();
        
        // 2. Purchase product
        await purchaseProduct(product, price, salt);
        
        // 3. Confirm order
        await confirmOrder(product, 'QmTestCID');
        
        // 4. Select transporter
        await selectTransporter(product, transporter, web3.utils.toWei('0.1', 'ether'));
        
        // 5. Confirm delivery
        await confirmDelivery(product, price, salt, 'QmDeliveryCID');
        
        // 6. Verify final state
        const phase = await product.phase();
        assert.equal(phase.toString(), '4', 'Product should be in Delivered phase');
    });
});
```

---

## Conclusion

This API Reference provides comprehensive documentation for all the interfaces and integration points of the EV Battery Supply Chain dApp. The documentation covers:

- **Smart Contract APIs**: Complete function specifications with parameters, return values, and access control
- **Frontend Integration**: Web3.js and MetaMask integration patterns
- **Backend Services**: REST API endpoints for product and payment management
- **Privacy Features**: Railgun and ZKP service integration
- **Error Handling**: Comprehensive error codes and handling strategies
- **Event System**: Detailed event specifications and indexing patterns
- **Testing**: Test structures and examples for validation

The APIs are designed to be secure, efficient, and easy to integrate while maintaining the privacy and confidentiality requirements of the system.

---

**Document End**

*This document provides a comprehensive API reference for the EV Battery Supply Chain dApp. For implementation details, refer to the source code in the respective directories. For deployment instructions, refer to the deployment documentation.* 