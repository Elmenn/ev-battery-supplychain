const express = require('express');
const cors = require('cors');

const { verifyVC } = require('./verifyVC');
const { fetchVC } = require('./fetchVC');
const { verifyVCChain } = require('./verifyVCChain');

const app = express();
const port = 5000;

const corsOptions = {
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  methods: ['POST'],
  credentials: false,
};

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

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
