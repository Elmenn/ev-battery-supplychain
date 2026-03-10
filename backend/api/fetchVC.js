let fetch;
try {
  fetch = global.fetch || require('node-fetch');
} catch {
  throw new Error('Please install node-fetch: npm install node-fetch');
}

const db = require('./db');

const IPFS_GATEWAYS = [
  'https://gateway.pinata.cloud/ipfs/',
  'https://ipfs.io/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
];

const stmtGetArchivedVc = db.prepare('SELECT vc_json FROM vc_archives WHERE cid = ?');

async function fetchFromGateways(cid) {
  let lastError = null;

  for (const gateway of IPFS_GATEWAYS) {
    const url = `${gateway}${cid}`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        lastError = new Error(`HTTP error ${response.status} from ${url}`);
        continue;
      }
      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error(`Failed to fetch VC from configured gateways for CID ${cid}`);
}

async function fetchVC(cid) {
  try {
    if (!cid || typeof cid !== 'string') {
      throw new Error('Invalid or missing CID provided to fetchVC.');
    }

    const normalizedCid = cid.replace(/^ipfs:\/\//, '').trim();
    const archived = stmtGetArchivedVc.get(normalizedCid);
    if (archived?.vc_json) {
      return JSON.parse(archived.vc_json);
    }

    return await fetchFromGateways(normalizedCid);
  } catch (error) {
    console.error('Error fetching VC data:', error);
    throw error;
  }
}

module.exports = { fetchVC, IPFS_GATEWAYS };
