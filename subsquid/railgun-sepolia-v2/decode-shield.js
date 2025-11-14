const { ethers } = require('ethers');
const iface = new ethers.utils.Interface(['event Shield(uint256 treeNumber, uint256 startPosition, (bytes32 npk, (uint8 tokenType, address tokenAddress, uint256 tokenSubID) token, uint120 value)[] commitments, (bytes32[3] ciphertext, bytes32 shieldKey)[] shieldCiphertext, uint256[] fees)']);
const provider = new ethers.providers.JsonRpcProvider('https://ethereum-sepolia.publicnode.com');
(async () => {
  const receipt = await provider.getTransactionReceipt('0x35d98f0b0f011f74e6f3bf0f56c15106fb4799bf44040b2d009a54a7db91f87a');
  const log = receipt.logs.find(l => l.address.toLowerCase() === '0xecfcf3b4ec647c4ca6d49108b311b7a7c9543fea');
  const parsed = iface.parseLog(log);
  console.log(JSON.stringify(parsed.args, null, 2));
})();
