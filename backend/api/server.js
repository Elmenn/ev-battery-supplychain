const express = require('express');
// const bodyParser = require('body-parser'); // not needed since using express.json()
const { verifyVC } = require('./verifyVC');
const { fetchVC } = require('./fetchVC');
const cors = require('cors');

const app = express();
const port = 5000;

// ✅ Allow both frontends: 3000 and 3001
const corsOptions = {
  origin: ["http://localhost:3000", "http://localhost:3001"],
  methods: ["POST"],
  credentials: false,
};

app.use(cors(corsOptions));
app.use(express.json());

// Endpoint to verify VC
app.post('/verify-vc', async (req, res) => {
  console.log("🔔 /verify-vc endpoint HIT");
  try {
    const { vc, isCertificate, contractAddress } = req.body; // ✅ Accept optional contractAddress
    if (!vc) {
      return res.status(400).json({ error: 'VC data is required.' });
    }

    // ✅ Pass contractAddress to verifyVC for verifyingContract binding
    const verificationResult = await verifyVC(vc, isCertificate || false, contractAddress || null);

    res.json({
      message: 'VC verification complete.',
      issuer: verificationResult.issuer,
      holder: verificationResult.holder,
    });
  } catch (error) {
    console.error('Error verifying VC:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Endpoint to fetch VC
app.post('/fetch-vc', async (req, res) => {
  try {
    const { cid } = req.body;
    if (!cid) {
      return res.status(400).json({ error: 'Cid is required.' });
    }

    console.log("fetch-vc requested for CID:", cid);
    const vcJsonData = await fetchVC(cid);

    res.json({
      message: 'VC fetching complete.',
      vc: vcJsonData
    });
  } catch (error) {
    console.error('Error fetching VC:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server is running at http://localhost:${port}`);
});
