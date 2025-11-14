# Frontend - EV Battery Supply Chain Marketplace

React-based frontend for the privacy-preserving EV battery supply chain marketplace. This application provides a user interface for sellers to list products, buyers to purchase them, and auditors to verify credentials.

## Features

- **Product Marketplace**: Browse and search for EV battery components
- **Product Creation**: Multi-step wizard for sellers to create product listings with Verifiable Credentials (VCs)
- **Supply Chain Provenance**: Visual tree showing component relationships and credential chains
- **Private Payments**: Optional Railgun integration for private transactions (requires Railgun backend)
- **Public Payments**: Standard Ethereum transactions with ZKP price commitments
- **VC Verification**: Comprehensive verification tools for auditors
- **IPFS Integration**: Decentralized storage for Verifiable Credentials via Pinata

## Prerequisites

See the main [README.md](../README.md) for full setup instructions. Key requirements:

- Node.js v18 or later
- MetaMask browser extension
- Pinata account (for IPFS storage)
- ZKP backend running (default: `http://localhost:5010`)
- Express API running (optional, default: `http://localhost:5000`)

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   # Copy example file
   copy .env.ganache.example .env.ganache     # Windows
   # cp .env.ganache.example .env.ganache      # macOS/Linux
   
   # Edit .env.ganache and fill in:
   # - REACT_APP_PINATA_JWT (get from https://www.pinata.cloud/)
   # - REACT_APP_FACTORY_ADDRESS (after contract deployment)
   # - REACT_APP_ZKP_BACKEND_URL (default: http://localhost:5010)
   
   # Copy to .env
   copy .env.ganache .env     # Windows
   # cp .env.ganache .env      # macOS/Linux
   ```

3. **Start development server:**
   ```bash
   npm start
   ```

   The app will open at [http://localhost:3000](http://localhost:3000)

## Available Scripts

### `npm start`
Runs the app in development mode with hot reloading.

### `npm start:ganache`
Copies `.env.ganache` to `.env` and starts the development server (for local Ganache setup).

### `npm start:sepolia`
Copies `.env.sepolia` to `.env` and starts the development server (for Sepolia testnet).

### `npm test`
Launches the test runner in interactive watch mode.

### `npm run build`
Builds the app for production to the `build` folder. The build is optimized and minified.

## Project Structure

```
frontend/
├── public/              # Static assets
├── src/
│   ├── components/      # React components
│   │   ├── marketplace/ # Product listing, detail, creation forms
│   │   ├── railgun/     # Private payment components (optional)
│   │   ├── vc/          # Verifiable Credential viewers and verification
│   │   └── ui/          # Reusable UI components
│   ├── lib/             # Railgun SDK integration and utilities
│   ├── utils/           # Helper functions (IPFS, VC signing, etc.)
│   ├── views/           # Page-level components
│   ├── config/          # Configuration files
│   └── App.js           # Main application component
├── .env.example         # Environment variable template
├── .env.ganache.example # Ganache-specific template
├── .env.sepolia.example # Sepolia-specific template
└── package.json
```

## Key Components

### Marketplace Components
- **`MarketplaceView`**: Main marketplace page showing all products
- **`ProductDetail`**: Product detail page with purchase options and credential viewing
- **`ProductFormWizard`**: Multi-step form for creating new products
  - Step 1: Basic product information
  - Step 2: Additional details and component selection
  - Step 3: Review and confirm VC creation

### VC Components
- **`VCViewer`**: Display Verifiable Credential JSON with copyable fields
- **`ProvenanceChainViewer`**: Visual tree showing supply chain relationships
- **`VerifyVCInline`**: Comprehensive VC verification tool for auditors

### Railgun Components (Optional)
- **`PrivatePaymentModal`**: Modal for private payment flow
- **`RailgunConnectionButton`**: Connect to Railgun wallet
- **`PrivateFundsDrawer`**: View and manage private balances

## Environment Variables

Required environment variables (see `.env.example` for full list):

| Variable | Description | Required |
|----------|-------------|----------|
| `REACT_APP_FACTORY_ADDRESS` | ProductFactory contract address | ✅ Yes |
| `REACT_APP_PINATA_JWT` | Pinata API JWT token for IPFS | ✅ Yes |
| `REACT_APP_ZKP_BACKEND_URL` | ZKP backend service URL | ✅ Yes |
| `REACT_APP_RPC_URL` | Ethereum RPC endpoint | ✅ Yes |
| `REACT_APP_CHAIN_ID` | Ethereum chain ID | ✅ Yes |
| `REACT_APP_RAILGUN_API_URL` | Railgun backend URL | ❌ Optional |

## Development Notes

### Import Order
The `src/index.js` file has a specific import order that must be maintained:
1. Setup script (log filtering)
2. Railgun bootstrap (patches network config)
3. Railgun V2 client
4. React and app code

### Railgun Integration
Railgun integration is **optional**. The frontend gracefully handles the Railgun API being offline:
- Private payment buttons are hidden if the API is unavailable
- Public purchase flow works completely without Railgun
- See `src/lib/railgun-bootstrap.js` for network configuration patches

### VC Creation Flow
1. Seller fills out product form
2. Frontend generates VC with ZKP price commitment
3. VC is signed with MetaMask (EIP-712)
4. VC is uploaded to IPFS (Pinata)
5. IPFS CID is stored on-chain via ProductFactory

### Supply Chain Provenance
Products can reference component VCs via `componentCredentials` array:
- Component VCs are fetched from IPFS
- Provenance tree is built recursively
- Each VC in the chain is verified
- Status indicators show delivery state

## Troubleshooting

### "Invalid factory address" error
- Ensure `REACT_APP_FACTORY_ADDRESS` in `.env` matches the deployed contract address
- Restart `npm start` after updating `.env`

### "REACT_APP_PINATA_JWT is missing" error
- Sign up at [Pinata](https://www.pinata.cloud/)
- Create an API key and copy the JWT token
- Add to `.env` as `REACT_APP_PINATA_JWT=your-token`
- Restart `npm start`

### ZKP verification fails
- Ensure ZKP backend is running: `cd ../zkp-backend && cargo run`
- Verify `REACT_APP_ZKP_BACKEND_URL` in `.env` points to the backend (default: `http://localhost:5010`)

### Environment variables not updating
- React apps read environment variables at build time
- **Always restart `npm start`** after changing `.env` files

## Testing

Run tests with:
```bash
npm test
```

Tests use Jest and React Testing Library. See individual component directories for component-specific tests.

## Building for Production

```bash
npm run build
```

This creates an optimized production build in the `build/` folder. The build is ready to be deployed to any static hosting service.

## Learn More

- [React Documentation](https://reactjs.org/)
- [Create React App Documentation](https://create-react-app.dev/)
- [Ethers.js Documentation](https://docs.ethers.org/)
- [Railgun Documentation](https://docs.railgun.org/)

For project-specific documentation, see the main [README.md](../README.md) and the `docs/` directory.
