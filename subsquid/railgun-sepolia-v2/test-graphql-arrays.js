// Test GraphQL query for arrays
// Uses built-in fetch (Node 18+) or http module
const http = require('http');

const QUERY = `
  query {
    transactions(where: { transactionHash_eq: "0x35d98f0b0f011f74e6f3bf0f56c15106fb4799bf44040b2d009a54a7db91f87a" }) {
      id
      transactionHash
      nullifiers
      commitments
    }
  }
`;

async function test() {
  try {
    // Use global fetch if available (Node 18+), otherwise use http
    let data;
    if (typeof fetch !== 'undefined') {
      const res = await fetch('http://localhost:4000/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: QUERY }),
      });
      data = await res.json();
    } else {
      // Fallback to http module
      data = await new Promise((resolve, reject) => {
        const req = http.request('http://localhost:4000/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }, (res) => {
          let body = '';
          res.on('data', (chunk) => body += chunk);
          res.on('end', () => {
            try {
              resolve(JSON.parse(body));
            } catch (e) {
              reject(e);
            }
          });
        });
        req.on('error', reject);
        req.write(JSON.stringify({ query: QUERY }));
        req.end();
      });
    }
    console.log('Response:', JSON.stringify(data, null, 2));
    
    if (data.data?.transactions?.[0]) {
      const tx = data.data.transactions[0];
      console.log('\n📊 Transaction:');
      console.log(`   ID: ${tx.id}`);
      console.log(`   Hash: ${tx.transactionHash}`);
      console.log(`   Nullifiers: ${JSON.stringify(tx.nullifiers)} (length: ${tx.nullifiers?.length || 0})`);
      console.log(`   Commitments: ${JSON.stringify(tx.commitments)} (length: ${tx.commitments?.length || 0})`);
      
      if (tx.nullifiers?.length === 0 || tx.commitments?.length === 0) {
        console.log('\n⚠️ Arrays are empty in GraphQL but populated in DB!');
        console.log('   This is an OpenReader serialization issue.');
      } else {
        console.log('\n✅ Arrays are correctly serialized!');
      }
    } else {
      console.log('❌ Transaction not found');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

test();

