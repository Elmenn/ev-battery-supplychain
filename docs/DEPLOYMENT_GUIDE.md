# EV Battery Supply Chain dApp - Deployment Guide

**Document Version:** 1.0  
**Last Updated:** December 2024  
**Author:** EV Battery Supply Chain Development Team  

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Local Development Deployment](#local-development-deployment)
4. [Test Network Deployment](#test-network-deployment)
5. [Main Network Deployment](#main-network-deployment)
6. [Backend Services Deployment](#backend-services-deployment)
7. [Frontend Deployment](#frontend-deployment)
8. [Monitoring and Maintenance](#monitoring-and-maintenance)
9. [Security Considerations](#security-considerations)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### **System Requirements**

- **Operating System**: Windows 10/11, macOS 10.15+, or Ubuntu 18.04+
- **Node.js**: Version 16.0.0 or higher
- **Rust**: Version 1.70.0 or higher
- **Git**: Version 2.30.0 or higher
- **Docker**: Version 20.10.0 or higher (optional, for containerized deployment)

### **Required Accounts and Services**

- **Ethereum Wallet**: MetaMask or similar wallet with test/mainnet access
- **Infura Account**: For Ethereum node access (free tier available)
- **IPFS Node**: Local or remote IPFS node
- **Railgun API Access**: For privacy features
- **Domain Name**: For production deployment (optional)

### **Required Software**

```bash
# Node.js and npm
node --version  # Should be >= 16.0.0
npm --version   # Should be >= 8.0.0

# Rust and Cargo
rustc --version # Should be >= 1.70.0
cargo --version # Should be >= 1.70.0

# Git
git --version   # Should be >= 2.30.0

# Truffle (install globally)
npm install -g truffle
truffle version # Should be >= 5.0.0
```

---

## Environment Setup

### **1. Repository Setup**

```bash
# Clone the repository
git clone https://github.com/your-username/ev-battery-supplychain.git
cd ev-battery-supplychain

# Install dependencies
npm install

# Install frontend dependencies
cd frontend
npm install
cd ..

# Install backend dependencies
cd backend/api
npm install
cd ../..

# Build Rust backend
cd zkp-backend
cargo build --release
cd ..
```

### **2. Environment Configuration**

Create environment files for different deployment stages:

#### **Development Environment (.env.development)**

```bash
# Ethereum Configuration
ETHEREUM_NETWORK=development
GANACHE_PORT=7545
GANACHE_NETWORK_ID=1337

# IPFS Configuration
IPFS_API_URL=http://localhost:5001
IPFS_GATEWAY_URL=http://localhost:8080/ipfs/

# Backend Services
ZKP_SERVICE_URL=http://localhost:5010
RAILGUN_API_URL=http://localhost:5020
EXPRESS_API_PORT=5000

# Database
DATABASE_URL=sqlite://./development.db

# Logging
LOG_LEVEL=debug
```

#### **Test Network Environment (.env.testnet)**

```bash
# Ethereum Configuration
ETHEREUM_NETWORK=goerli
INFURA_PROJECT_ID=your_infura_project_id
INFURA_PROJECT_SECRET=your_infura_project_secret
PRIVATE_KEY=your_deployment_private_key

# IPFS Configuration
IPFS_API_URL=https://ipfs.infura.io:5001
IPFS_GATEWAY_URL=https://ipfs.io/ipfs/

# Backend Services
ZKP_SERVICE_URL=https://your-zkp-service.com
RAILGUN_API_URL=https://api.railgun.org
EXPRESS_API_PORT=5000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/testnet_db

# Logging
LOG_LEVEL=info
```

#### **Main Network Environment (.env.mainnet)**

```bash
# Ethereum Configuration
ETHEREUM_NETWORK=mainnet
INFURA_PROJECT_ID=your_infura_project_id
INFURA_PROJECT_SECRET=your_infura_project_secret
PRIVATE_KEY=your_deployment_private_key

# IPFS Configuration
IPFS_API_URL=https://ipfs.infura.io:5001
IPFS_GATEWAY_URL=https://ipfs.io/ipfs/

# Backend Services
ZKP_SERVICE_URL=https://your-zkp-service.com
RAILGUN_API_URL=https://api.railgun.org
EXPRESS_API_PORT=5000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/mainnet_db

# Logging
LOG_LEVEL=warn
```

### **3. Truffle Configuration**

Update `truffle-config.js` for different networks:

```javascript
require('dotenv').config();
const HDWalletProvider = require('@truffle/hdwallet-provider');

module.exports = {
    networks: {
        // Development network (Ganache)
        development: {
            host: "127.0.0.1",
            port: process.env.GANACHE_PORT || 7545,
            network_id: process.env.GANACHE_NETWORK_ID || "*",
            gas: 6721975,
            gasPrice: 20000000000,
            timeoutBlocks: 50,
            skipDryRun: true
        },
        
        // Test network (Goerli)
        goerli: {
            provider: () => new HDWalletProvider(
                process.env.PRIVATE_KEY,
                `https://goerli.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
            ),
            network_id: 5,
            gas: 6721975,
            gasPrice: 20000000000,
            timeoutBlocks: 200,
            skipDryRun: false,
            confirmations: 2
        },
        
        // Main network
        mainnet: {
            provider: () => new HDWalletProvider(
                process.env.PRIVATE_KEY,
                `https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
            ),
            network_id: 1,
            gas: 6721975,
            gasPrice: 20000000000,
            timeoutBlocks: 200,
            skipDryRun: false,
            confirmations: 6
        }
    },
    
    compilers: {
        solc: {
            version: "0.8.21",
            settings: {
                optimizer: {
                    enabled: true,
                    runs: 200
                },
                evmVersion: "shanghai"
            }
        }
    },
    
    plugins: ['truffle-plugin-verify'],
    
    api_keys: {
        etherscan: process.env.ETHERSCAN_API_KEY
    }
};
```

---

## Local Development Deployment

### **1. Start Local Blockchain**

#### **Option A: Ganache CLI**

```bash
# Install Ganache CLI globally
npm install -g ganache-cli

# Start Ganache with specific configuration
ganache-cli \
    --port 7545 \
    --network-id 1337 \
    --gas-limit 8000000 \
    --accounts 10 \
    --default-balance-ether 1000 \
    --deterministic \
    --mnemonic "your twelve word mnemonic here for deterministic accounts"
```

#### **Option B: Ganache GUI**

1. Download and install Ganache GUI from [https://trufflesuite.com/ganache/](https://trufflesuite.com/ganache/)
2. Create a new workspace
3. Configure network ID to 1337
4. Set port to 7545
5. Start the workspace

### **2. Deploy Smart Contracts**

```bash
# Compile contracts
npx truffle compile

# Deploy to local network
npx truffle migrate --network development

# Verify deployment
npx truffle console --network development
```

**Console Verification Commands:**

```javascript
// Get deployed contracts
const factory = await ProductFactory.deployed();
const implementation = await ProductEscrow_Initializer.deployed();

console.log('Factory address:', factory.address);
console.log('Implementation address:', implementation.address);

// Check factory state
const productCount = await factory.productCount();
const isPaused = await factory.isPaused();
console.log('Product count:', productCount.toString());
console.log('Factory paused:', isPaused);
```

### **3. Start Backend Services**

#### **ZKP Backend Service**

```bash
# Terminal 1: Start ZKP service
cd zkp-backend
cargo run --release
```

#### **Express API Server**

```bash
# Terminal 2: Start API server
cd backend/api
npm start
```

#### **IPFS Node (Optional)**

```bash
# Terminal 3: Start IPFS daemon
ipfs daemon
```

### **4. Start Frontend**

```bash
# Terminal 4: Start React development server
cd frontend
npm start
```

### **5. Verify Local Deployment**

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000
- **ZKP Service**: http://localhost:5010
- **IPFS Gateway**: http://localhost:8080/ipfs/
- **Ganache**: http://localhost:7545

---

## Test Network Deployment

### **1. Prepare Test Network**

#### **Get Test ETH**

- **Goerli Testnet**: Use a faucet like [https://goerlifaucet.com/](https://goerlifaucet.com/)
- **Sepolia Testnet**: Use a faucet like [https://sepoliafaucet.com/](https://sepoliafaucet.com/)

#### **Verify Network Configuration**

```bash
# Check network configuration
npx truffle networks

# Test network connectivity
npx truffle console --network goerli
```

### **2. Deploy Smart Contracts**

```bash
# Compile contracts
npx truffle compile

# Deploy to test network
npx truffle migrate --network goerli

# Verify contracts on Etherscan
npx truffle run verify --network goerli
```

### **3. Update Frontend Configuration**

Update `frontend/src/config/contracts.js`:

```javascript
export const CONTRACT_ADDRESSES = {
    development: {
        factory: '0x...', // Local deployment address
        implementation: '0x...'
    },
    goerli: {
        factory: '0x...', // Goerli deployment address
        implementation: '0x...'
    },
    mainnet: {
        factory: '0x...', // Mainnet deployment address
        implementation: '0x...'
    }
};

export const NETWORK_CONFIG = {
    development: {
        chainId: '0x539', // 1337 in hex
        chainName: 'Ganache Local',
        rpcUrls: ['http://localhost:7545'],
        blockExplorerUrls: []
    },
    goerli: {
        chainId: '0x5', // 5 in hex
        chainName: 'Goerli Testnet',
        rpcUrls: [`https://goerli.infura.io/v3/${process.env.REACT_APP_INFURA_PROJECT_ID}`],
        blockExplorerUrls: ['https://goerli.etherscan.io/']
    }
};
```

### **4. Deploy Backend Services**

#### **Option A: Local Deployment with Test Network**

```bash
# Update environment to use test network
cp .env.testnet .env

# Start services
cd zkp-backend && cargo run --release &
cd backend/api && npm start &
cd frontend && npm start &
```

#### **Option B: Cloud Deployment**

Deploy to services like:
- **Heroku**: For Express API
- **Railway**: For full-stack deployment
- **Vercel**: For frontend deployment

### **5. Test Network Verification**

```bash
# Test contract interactions
npx truffle test --network goerli

# Test frontend integration
# Navigate to deployed frontend and test functionality
```

---

## Main Network Deployment

### **1. Pre-Deployment Checklist**

- [ ] **Security Audit**: Complete smart contract security audit
- [ ] **Test Coverage**: Ensure 100% test coverage
- [ ] **Gas Optimization**: Verify gas costs are acceptable
- [ ] **Documentation**: Complete all technical documentation
- [ ] **Legal Review**: Review regulatory compliance requirements
- [ ] **Insurance**: Consider smart contract insurance coverage

### **2. Security Measures**

#### **Multi-Signature Wallet Setup**

```javascript
// Example: Gnosis Safe deployment
const safe = await GnosisSafe.deploy();
await safe.setup(
    [owner1, owner2, owner3], // Owners
    2,                        // Threshold
    "0x",                     // Contract address
    "0x",                     // Data
    fallbackHandler,          // Fallback handler
    "0x",                     // Payment token
    0,                        // Payment amount
    "0x"                      // Payment receiver
);
```

#### **Timelock Contract**

```javascript
// Example: OpenZeppelin Timelock
const timelock = await TimelockController.deploy(
    minDelay,           // Minimum delay
    [proposer],         // Proposers
    [executor],         // Executors
    admin               // Admin
);
```

### **3. Deploy Smart Contracts**

```bash
# Final compilation
npx truffle compile --all

# Deploy to mainnet
npx truffle migrate --network mainnet

# Verify contracts
npx truffle run verify --network mainnet
```

### **4. Deploy Infrastructure**

#### **Backend Services**

Deploy to production-grade services:

- **AWS**: EC2, RDS, S3, CloudFront
- **Google Cloud**: Compute Engine, Cloud SQL, Cloud Storage
- **Azure**: Virtual Machines, SQL Database, Blob Storage

#### **Frontend Deployment**

```bash
# Build production version
cd frontend
npm run build

# Deploy to CDN
# - AWS S3 + CloudFront
# - Vercel
# - Netlify
# - GitHub Pages
```

### **5. Post-Deployment Verification**

```bash
# Verify contract deployment
npx truffle console --network mainnet

# Test all functionality
# - Product creation
# - Purchase flow
# - Payment processing
# - Delivery confirmation
```

---

## Backend Services Deployment

### **1. Express API Server**

#### **Docker Deployment**

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 5000

CMD ["npm", "start"]
```

```bash
# Build and run
docker build -t ev-battery-api .
docker run -p 5000:5000 ev-battery-api
```

#### **PM2 Deployment**

```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start ecosystem.config.js

# Monitor
pm2 monit

# Logs
pm2 logs
```

**ecosystem.config.js:**

```javascript
module.exports = {
    apps: [{
        name: 'ev-battery-api',
        script: 'server.js',
        instances: 'max',
        exec_mode: 'cluster',
        env: {
            NODE_ENV: 'development'
        },
        env_production: {
            NODE_ENV: 'production'
        }
    }]
};
```

### **2. ZKP Backend Service**

#### **Systemd Service**

```bash
# Create service file
sudo nano /etc/systemd/system/zkp-service.service
```

```ini
[Unit]
Description=ZKP Backend Service
After=network.target

[Service]
Type=simple
User=zkp
WorkingDirectory=/opt/zkp-backend
ExecStart=/opt/zkp-backend/target/release/zkp-backend
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start service
sudo systemctl enable zkp-service
sudo systemctl start zkp-service
sudo systemctl status zkp-service
```

#### **Docker Deployment**

```dockerfile
# Dockerfile
FROM rust:1.70 as builder

WORKDIR /app
COPY . .
RUN cargo build --release

FROM debian:bullseye-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/zkp-backend /usr/local/bin/

EXPOSE 5010

CMD ["zkp-backend"]
```

### **3. Database Deployment**

#### **PostgreSQL Setup**

```bash
# Install PostgreSQL
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib

# Create database and user
sudo -u postgres psql

CREATE DATABASE ev_battery_mainnet;
CREATE USER ev_battery_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE ev_battery_mainnet TO ev_battery_user;
\q
```

#### **Database Migration**

```bash
# Run migrations
npx sequelize-cli db:migrate

# Seed initial data
npx sequelize-cli db:seed:all
```

---

## Frontend Deployment

### **1. Production Build**

```bash
# Install dependencies
npm install

# Build production version
npm run build

# Test build locally
npm run serve
```

### **2. Deployment Options**

#### **Vercel Deployment**

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod
```

#### **Netlify Deployment**

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Deploy
netlify deploy --prod --dir=build
```

#### **AWS S3 + CloudFront**

```bash
# Install AWS CLI
pip install awscli

# Configure AWS
aws configure

# Sync build folder to S3
aws s3 sync build/ s3://your-bucket-name

# Create CloudFront distribution
aws cloudfront create-distribution --distribution-config file://dist-config.json
```

### **3. Environment Configuration**

Create `.env.production`:

```bash
REACT_APP_ETHEREUM_NETWORK=mainnet
REACT_APP_FACTORY_ADDRESS=0x...
REACT_APP_IMPLEMENTATION_ADDRESS=0x...
REACT_APP_INFURA_PROJECT_ID=your_project_id
REACT_APP_IPFS_GATEWAY=https://ipfs.io/ipfs/
REACT_APP_ZKP_SERVICE_URL=https://your-zkp-service.com
REACT_APP_RAILGUN_API_URL=https://api.railgun.org
```

---

## Monitoring and Maintenance

### **1. Health Checks**

#### **API Health Endpoint**

```javascript
// Add to Express server
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.env.npm_package_version
    });
});
```

#### **Smart Contract Monitoring**

```javascript
// Monitor contract events
factory.events.ProductCreated()
    .on('data', (event) => {
        console.log('Product created:', event.args);
        // Send to monitoring service
    });

// Monitor for errors
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Send alert to monitoring service
});
```

### **2. Logging and Analytics**

#### **Structured Logging**

```javascript
const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' })
    ]
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple()
    }));
}
```

#### **Performance Monitoring**

```javascript
// Add performance monitoring
const responseTime = require('response-time');
app.use(responseTime((req, res, time) => {
    logger.info({
        method: req.method,
        url: req.url,
        responseTime: time,
        userAgent: req.get('User-Agent')
    });
}));
```

### **3. Backup and Recovery**

#### **Database Backups**

```bash
# PostgreSQL backup script
#!/bin/bash
BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="ev_battery_mainnet"

pg_dump $DB_NAME > $BACKUP_DIR/backup_$DATE.sql

# Keep only last 7 days of backups
find $BACKUP_DIR -name "backup_*.sql" -mtime +7 -delete
```

#### **Smart Contract Backup**

```javascript
// Store contract addresses and ABIs
const deploymentInfo = {
    network: 'mainnet',
    blockNumber: 12345678,
    contracts: {
        factory: {
            address: '0x...',
            abi: [...],
            verified: true
        },
        implementation: {
            address: '0x...',
            abi: [...],
            verified: true
        }
    }
};

// Save to file
fs.writeFileSync('deployment-info.json', JSON.stringify(deploymentInfo, null, 2));
```

---

## Security Considerations

### **1. Private Key Management**

#### **Environment Variables**

```bash
# Never commit private keys to version control
# Use environment variables or secure key management services

# AWS Secrets Manager
aws secretsmanager create-secret \
    --name "ev-battery-private-key" \
    --secret-string "your-private-key-here"

# Azure Key Vault
az keyvault secret set \
    --vault-name "ev-battery-vault" \
    --name "private-key" \
    --value "your-private-key-here"
```

#### **Hardware Security Modules (HSM)**

```javascript
// Use HSM for production deployments
const { HsmWallet } = require('@aws-sdk/client-kms');
const wallet = new HsmWallet({
    region: 'us-east-1',
    keyId: 'your-hsm-key-id'
});
```

### **2. Access Control**

#### **API Rate Limiting**

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP'
});

app.use('/api/', limiter);
```

#### **CORS Configuration**

```javascript
const cors = require('cors');

app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
```

### **3. Network Security**

#### **Firewall Configuration**

```bash
# UFW firewall rules
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 5000/tcp  # API
sudo ufw allow 5010/tcp  # ZKP Service
sudo ufw enable
```

#### **SSL/TLS Configuration**

```javascript
const https = require('https');
const fs = require('fs');

const options = {
    key: fs.readFileSync('private-key.pem'),
    cert: fs.readFileSync('certificate.pem')
};

https.createServer(options, app).listen(443, () => {
    console.log('HTTPS server running on port 443');
});
```

---

## Troubleshooting

### **1. Common Deployment Issues**

#### **Contract Deployment Failures**

```bash
# Check gas estimation
npx truffle run estimate-gas --network mainnet

# Check network connectivity
npx truffle console --network mainnet

# Verify account balance
web3.eth.getBalance(accounts[0]).then(console.log)
```

#### **Backend Service Issues**

```bash
# Check service status
sudo systemctl status zkp-service
sudo systemctl status nginx

# Check logs
sudo journalctl -u zkp-service -f
sudo tail -f /var/log/nginx/error.log

# Check port usage
sudo netstat -tlnp | grep :5000
sudo netstat -tlnp | grep :5010
```

### **2. Performance Issues**

#### **Database Optimization**

```sql
-- Check slow queries
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;

-- Create indexes
CREATE INDEX idx_products_phase ON products(phase);
CREATE INDEX idx_products_seller ON products(seller);
CREATE INDEX idx_products_buyer ON products(buyer);
```

#### **Smart Contract Gas Optimization**

```bash
# Analyze gas usage
npx truffle run gas-usage --network development

# Optimize storage layout
# Review storage packing in contracts

# Use events instead of storage arrays
# Implement pagination for large datasets
```

### **3. Security Issues**

#### **Vulnerability Scanning**

```bash
# Audit dependencies
npm audit
npm audit fix

# Check smart contracts
npx truffle run slither
npx truffle run mythril

# Monitor for suspicious activity
# Implement alerting for unusual transactions
```

#### **Emergency Procedures**

```javascript
// Emergency pause function
async function emergencyPause() {
    try {
        await factory.pause({ from: owner });
        console.log('Factory paused successfully');
        
        // Notify stakeholders
        await notifyStakeholders('EMERGENCY: Factory paused due to security concern');
        
    } catch (error) {
        console.error('Emergency pause failed:', error);
        // Implement fallback procedures
    }
}
```

---

## Conclusion

This deployment guide provides comprehensive instructions for deploying the EV Battery Supply Chain dApp across different environments. Key considerations include:

- **Security**: Proper private key management and access control
- **Scalability**: Infrastructure planning for growth
- **Monitoring**: Comprehensive logging and health checks
- **Maintenance**: Regular backups and updates
- **Compliance**: Regulatory and legal considerations

For production deployments, always:
1. Complete security audits
2. Test thoroughly on test networks
3. Implement monitoring and alerting
4. Plan for disaster recovery
5. Document all procedures

---

**Document End**

*This document provides comprehensive deployment instructions for the EV Battery Supply Chain dApp. For implementation details, refer to the source code and other documentation files.* 