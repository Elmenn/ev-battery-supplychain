const { ethers } = require('ethers');
const eventsInterface = new ethers.utils.Interface([
  'event Transact(uint256 treeNumber, uint256 startPosition, bytes32[] hash, tuple(bytes32[4],bytes32,bytes32,bytes,bytes)[] ciphertext)',
  'event Nullified(uint16 treeNumber, bytes32[] nullifier)',
  'event Unshield(address to, (uint8 tokenType, address tokenAddress, uint256 tokenSubID) token, uint256 amount, uint256 fee)'
]);
const TRANSACT_TOPIC = eventsInterface.getEventTopic('Transact').toLowerCase();
const NULLIFIED_TOPIC = eventsInterface.getEventTopic('Nullified').toLowerCase();
const provider = new ethers.providers.JsonRpcProvider('https://ethereum-sepolia.publicnode.com');
(async () => {
  const receipt = await provider.getTransactionReceipt('0x671586ef7a3fe589bb629a2009bb636ed81ac2e02f114113db51255d3694110e');
  const txLogs = receipt.logs.filter(log => log.address.toLowerCase() === '0xecfcf3b4ec647c4ca6d49108b311b7a7c9543fea');
  console.log('topics', txLogs.map(l => l.topics[0]));
  const transactLogs = txLogs.filter(log => log.topics[0].toLowerCase() === TRANSACT_TOPIC);
  const nullifiedLogs = txLogs.filter(log => log.topics[0].toLowerCase() === NULLIFIED_TOPIC);
  console.log('transact logs', transactLogs.length);
  console.log('nullified logs', nullifiedLogs.length);
  if (transactLogs[0]) {
    const decoded = eventsInterface.parseLog(transactLogs[0]);
    console.log('decoded transact hash length', decoded.args.hash.length);
    console.log('hashes', decoded.args.hash);
  }
  if (nullifiedLogs[0]) {
    const decodedNull = eventsInterface.parseLog(nullifiedLogs[0]);
    console.log('nullifiers', decodedNull.args.nullifier);
  }
})();
