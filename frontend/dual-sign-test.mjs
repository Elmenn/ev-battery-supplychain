import { buildStage3VC, freezeVcJson } from './src/utils/vcBuilder.mjs';
import signVcWithMetamaskModule from './src/utils/signVcWithMetamask.js';
const { signVcAsSeller, signVcWithMetamask } = signVcWithMetamaskModule;
import { ethers } from 'ethers';

// --- Example test private keys (DO NOT use in production!) ---
const sellerPrivateKey = '0x59c6995e998f97a5a0044976f7a5e7d5b6e8b8b6b7b8b8b8b8b8b8b8b8b8b8b8';
const buyerPrivateKey = '0x8b3a350cf5c34c9194ca3a545d7cedcda820c368c7e3b6c7b7b7b7b7b7b7b7b7';
const provider = ethers.getDefaultProvider('http://localhost:8545'); // or your testnet
const sellerSigner = new ethers.Wallet(sellerPrivateKey, provider);
const buyerSigner = new ethers.Wallet(buyerPrivateKey, provider);

// --- Example stage2 VC and ZKP objects (replace with real data in production) ---
const stage2 = {
  '@context': ['https://www.w3.org/2018/credentials/v1'],
  id: 'https://example.edu/credentials/uuid-placeholder',
  type: ['VerifiableCredential'],
  issuer: { id: 'did:ethr:1337:' + sellerSigner.address, name: 'Seller' },
  holder: { id: 'did:ethr:1337:' + buyerSigner.address, name: 'Buyer' },
  issuanceDate: new Date().toISOString(),
  credentialSubject: {
    id: 'did:ethr:1337:' + buyerSigner.address,
    productName: 'Test Product',
    batch: '',
    quantity: 1,
    subjectDetails: { productContract: '0x1234567890abcdef1234567890abcdef12345678' },
    previousCredential: '',
    componentCredentials: [],
    transactionId: '',
    certificateCredential: { name: '', cid: '' },
    price: JSON.stringify({ hidden: true })
  },
  proof: []
};

const priceObj = {
  hidden: true,
  zkpProof: {
    protocol: 'bulletproofs-pedersen',
    version: '1.0',
    commitment: '0xabcdef...',
    proof: '0x1234...',
    encoding: 'hex',
    verified: true,
    description: 'This ZKP proves the price is in the allowed range without revealing it.',
    proofType: 'zkRangeProof-v1'
  }
};

(async () => {
  // 1. Buyer builds the VC with ZKP and proofType
  let vc = buildStage3VC({
    stage2,
    price: priceObj,
    buyerProof: {},
    proofType: 'zkRangeProof-v1'
  });

  // 2. Freeze (canonicalize) the VC JSON before signing
  let canonicalVcJson = freezeVcJson(vc);
  let canonicalVcObj = JSON.parse(canonicalVcJson);

  // 3. Seller signs the frozen VC, adds their proof to the array
  const issuerProof = await signVcAsSeller(canonicalVcObj, sellerSigner);
  canonicalVcObj.proof = [issuerProof];

  // 4. Buyer signs the same frozen VC (with seller's proof), adds their proof to the array
  canonicalVcJson = freezeVcJson(canonicalVcObj);
  canonicalVcObj = JSON.parse(canonicalVcJson);
  const buyerProof = await signVcWithMetamask(canonicalVcObj, buyerSigner);
  canonicalVcObj.proof.push(buyerProof);

  // 5. Output the final VC JSON with both proofs
  console.log('Final VC with dual signatures:\n', JSON.stringify(canonicalVcObj, null, 2));
})(); 