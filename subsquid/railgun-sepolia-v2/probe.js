const fetch = (...a) => import('node-fetch').then(({default: f}) => f(...a));
const endpoints = [
  'https://ethereum-sepolia.rpc.subquery.network/public',
  'https://ethereum-sepolia.gateway.tatum.io',
  'https://sepolia.gateway.tenderly.co',
  'https://eth-sepolia.api.onfinality.io/public',
  'https://ethereum-sepolia-rpc.publicnode.com'
];

async function probe(rpc, method, params) {
  const body = { jsonrpc: '2.0', id: 1, method, params };
  try {
    const res = await fetch(rpc, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      return 'non-JSON response: ' + res.status + ' ' + res.statusText + ' ' + text;
    }
    if (json.error) {
      const msg = (json.error.message || '').toLowerCase();
      if (json.error.code === -32601 || msg.includes('method not found')) {
        return 'method not found';
      }
      if (msg.includes('not available')) {
        return json.error.message;
      }
      return 'method exists (' + json.error.message + ')';
    }
    return 'method exists (returned result)';
  } catch (e) {
    return 'request failed: ' + e.message;
  }
}

(async () => {
  for (const rpc of endpoints) {
    console.log('\nHTTP:', rpc);
    console.log(
      ' debug_traceBlockByHash:',
      await probe(rpc, 'debug_traceBlockByHash', ['0x' + '00'.repeat(32), {}])
    );
    console.log(
      ' trace_block:',
      await probe(rpc, 'trace_block', ['0x' + '00'.repeat(32)])
    );
  }
})();
