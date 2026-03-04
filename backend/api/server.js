const express = require('express');
const cors = require('cors');

const { verifyVC } = require('./verifyVC');
const { fetchVC } = require('./fetchVC');
const { verifyVCChain } = require('./verifyVCChain');
const db = require('./db');

const app = express();
const port = 5000;

const corsOptions = {
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  methods: ['GET', 'POST', 'PATCH'],
  credentials: false,
};

// Prepared statements created once at startup for performance
const stmtUpsert = db.prepare(`
  INSERT OR REPLACE INTO product_metadata
    (product_address, product_meta, price_wei, price_commitment, seller_railgun_address, updated_at)
  VALUES
    (@productAddress, @productMeta, @priceWei, @priceCommitment, @sellerRailgunAddress, datetime('now'))
`);

const stmtGet = db.prepare(
  'SELECT * FROM product_metadata WHERE product_address = ?'
);

const stmtUpdateVcCid = db.prepare(
  "UPDATE product_metadata SET vc_cid = ?, updated_at = datetime('now') WHERE product_address = ?"
);

const stmtUpsertBuyerSecret = db.prepare(`
  INSERT OR REPLACE INTO buyer_secrets
    (product_address, buyer_address, encrypted_blob, disclosure_pubkey, c_pay, c_pay_proof, updated_at)
  VALUES
    (@productAddress, @buyerAddress, @encryptedBlob, @disclosurePubkey, @cPay, @cPayProof, datetime('now'))
`);

const stmtGetBuyerSecret = db.prepare(
  'SELECT * FROM buyer_secrets WHERE product_address = ? AND buyer_address = ?'
);

const stmtUpdateEncryptedOpening = db.prepare(
  "UPDATE buyer_secrets SET encrypted_opening = ?, updated_at = datetime('now') WHERE product_address = ? AND buyer_address = ?"
);

const stmtUpdateEqualityProof = db.prepare(
  "UPDATE buyer_secrets SET equality_proof = ?, updated_at = datetime('now') WHERE product_address = ? AND buyer_address = ?"
);

app.use(cors(corsOptions));
app.use(express.json());

app.post('/verify-vc', async (req, res) => {
  try {
    const { vc, contractAddress } = req.body;
    if (!vc) {
      return res.status(400).json({ error: 'VC data is required.' });
    }

    const verificationResult = await verifyVC(vc, contractAddress || null);
    const issuerOk = verificationResult?.issuer?.signature_verified === true;
    const holderOk =
      verificationResult?.holder == null ||
      verificationResult?.holder?.skipped === true ||
      verificationResult?.holder?.signature_verified === true;

    return res.json({
      success: issuerOk && holderOk,
      message: 'VC verification complete.',
      issuer: verificationResult.issuer,
      holder: verificationResult.holder,
    });
  } catch (error) {
    console.error('Error verifying VC:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/fetch-vc', async (req, res) => {
  try {
    const { cid } = req.body;
    if (!cid) {
      return res.status(400).json({ error: 'Cid is required.' });
    }

    const vcJsonData = await fetchVC(cid);
    return res.json({
      message: 'VC fetching complete.',
      vc: vcJsonData,
    });
  } catch (error) {
    console.error('Error fetching VC:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/verify-vc-chain', async (req, res) => {
  try {
    const { cid, maxDepth } = req.body;
    if (!cid) {
      return res.status(400).json({ error: 'Cid is required.' });
    }

    const result = await verifyVCChain(cid, fetchVC, { maxDepth });
    return res.json(result);
  } catch (error) {
    console.error('Error verifying VC chain:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /metadata — upsert full product listing metadata (called at product creation)
app.post('/metadata', (req, res) => {
  const { productAddress, productMeta, priceWei, priceCommitment, sellerRailgunAddress } = req.body;
  if (!productAddress || !productMeta) {
    return res.status(400).json({ error: 'productAddress and productMeta are required' });
  }
  try {
    const addr = productAddress.toLowerCase();
    stmtUpsert.run({
      productAddress: addr,
      productMeta: JSON.stringify(productMeta),
      priceWei: priceWei || null,
      priceCommitment: priceCommitment || null,
      sellerRailgunAddress: sellerRailgunAddress || null,
    });
    return res.status(201).json({ success: true, productAddress: addr });
  } catch (error) {
    console.error('Error saving product metadata:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /metadata/:address — read all metadata for a product address
app.get('/metadata/:address', (req, res) => {
  try {
    const addr = req.params.address.toLowerCase();
    const row = stmtGet.get(addr);
    if (!row) return res.status(404).json({ error: 'Not found' });
    return res.json({
      productAddress: row.product_address,
      productMeta: row.product_meta ? JSON.parse(row.product_meta) : null,
      priceWei: row.price_wei,
      priceCommitment: row.price_commitment,
      sellerRailgunAddress: row.seller_railgun_address,
      vcCid: row.vc_cid,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  } catch (error) {
    console.error('Error fetching product metadata:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /metadata/:address/vc-cid — update vcCid after seller confirms order
app.patch('/metadata/:address/vc-cid', (req, res) => {
  try {
    const addr = req.params.address.toLowerCase();
    const { vcCid } = req.body;
    if (!vcCid) return res.status(400).json({ error: 'vcCid is required' });
    const result = stmtUpdateVcCid.run(vcCid, addr);
    if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Error updating vcCid:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /buyer-secrets — upsert buyer secret blob at payment time
app.post('/buyer-secrets', (req, res) => {
  const { productAddress, buyerAddress, encryptedBlob, disclosurePubkey, cPay, cPayProof } = req.body;
  if (!productAddress || !buyerAddress || !encryptedBlob || !disclosurePubkey) {
    return res.status(400).json({ error: 'productAddress, buyerAddress, encryptedBlob, and disclosurePubkey are required' });
  }
  try {
    const pa = productAddress.toLowerCase();
    const ba = buyerAddress.toLowerCase();
    stmtUpsertBuyerSecret.run({
      productAddress: pa,
      buyerAddress: ba,
      encryptedBlob: typeof encryptedBlob === 'string' ? encryptedBlob : JSON.stringify(encryptedBlob),
      disclosurePubkey,
      cPay: cPay || null,
      cPayProof: cPayProof || null,
    });
    return res.status(201).json({ success: true });
  } catch (error) {
    console.error('Error saving buyer secret:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /buyer-secrets/:productAddress/:buyerAddress — read blob (buyer reads own blob; seller reads to get disclosurePubkey)
app.get('/buyer-secrets/:productAddress/:buyerAddress', (req, res) => {
  try {
    const pa = req.params.productAddress.toLowerCase();
    const ba = req.params.buyerAddress.toLowerCase();
    const row = stmtGetBuyerSecret.get(pa, ba);
    if (!row) return res.status(404).json({ error: 'Not found' });
    return res.json({
      productAddress: row.product_address,
      buyerAddress: row.buyer_address,
      encryptedBlob: row.encrypted_blob,
      disclosurePubkey: row.disclosure_pubkey,
      cPay: row.c_pay,
      cPayProof: row.c_pay_proof,
      encryptedOpening: row.encrypted_opening,
      equalityProof: row.equality_proof,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  } catch (error) {
    console.error('Error fetching buyer secret:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /buyer-secrets/:productAddress/:buyerAddress/encrypted-opening — seller writes ciphertext after confirmOrder
app.patch('/buyer-secrets/:productAddress/:buyerAddress/encrypted-opening', (req, res) => {
  try {
    const pa = req.params.productAddress.toLowerCase();
    const ba = req.params.buyerAddress.toLowerCase();
    const { encryptedOpening } = req.body;
    if (!encryptedOpening) return res.status(400).json({ error: 'encryptedOpening is required' });
    const result = stmtUpdateEncryptedOpening.run(
      typeof encryptedOpening === 'string' ? encryptedOpening : JSON.stringify(encryptedOpening),
      pa, ba
    );
    if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Error updating encrypted opening:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /buyer-secrets/:productAddress/:buyerAddress/equality-proof — buyer writes Schnorr proof
app.patch('/buyer-secrets/:productAddress/:buyerAddress/equality-proof', (req, res) => {
  try {
    const pa = req.params.productAddress.toLowerCase();
    const ba = req.params.buyerAddress.toLowerCase();
    const { equalityProof } = req.body;
    if (!equalityProof) return res.status(400).json({ error: 'equalityProof is required' });
    const result = stmtUpdateEqualityProof.run(
      typeof equalityProof === 'string' ? equalityProof : JSON.stringify(equalityProof),
      pa, ba
    );
    if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Error updating equality proof:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
