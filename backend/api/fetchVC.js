// fetchVC.js

let fetch;
try {
    fetch = global.fetch || require('node-fetch');
} catch {
    throw new Error("Please install node-fetch: npm install node-fetch");
}

const ipfs_base_link = "https://gateway.pinata.cloud/ipfs/";

async function fetchVC(cid) {
    try {
        if (!cid || typeof cid !== "string") {
            throw new Error("Invalid or missing CID provided to fetchVC.");
        }
        const url = ipfs_base_link + cid;
        console.log("Fetching from IPFS URL:", url);
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status} — URL: ${url}`);
        }

        const vcJsonData = await response.json();
        return vcJsonData;
    } catch (error) {
        console.error('Error fetching JSON data:', error);
        throw error;
    }
}

module.exports = { fetchVC };
