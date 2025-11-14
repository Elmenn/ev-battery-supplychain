const { keccak256, toUtf8Bytes } = require('ethers/lib/utils');
const paths = [
  './node_modules/@railgun-community/engine/dist/abi/V1/RailgunLogic_LegacyEvents.json',
  './node_modules/@railgun-community/engine/dist/abi/V2/RailgunSmartWallet_Legacy_PreMar23.json',
  './node_modules/@railgun-community/engine/dist/abi/V2.1/RailgunSmartWallet.json'
];
const targetHashes = new Set([
  '0x3a5b9dc26075a3801a6ddccf95fec485bb7500a91b44cec1add984c21ee6db3b',
  '0xd93cf895c7d5b2cd7dc7a098b678b3089f37d91f48d9b83a0800a91cbdf05284'
]);
const format = input => {
  if (!input) return 'unknown';
  if (input.type === 'tuple' || input.type === 'tuple[]') {
    const components = input.components.map(c => format(c));
    const suffix = input.type.endsWith('[]') ? '[]' : '';
    return '(' + components.join(',') + ')' + suffix;
  }
  return input.type;
};
for (const p of paths) {
  let abi;
  try {
    abi = require(p);
  } catch (err) {
    continue;
  }
  for (const item of abi) {
    if (item.type !== 'event') continue;
    const signature = `${item.name}(${item.inputs.map(format).join(',')})`;
    const hash = keccak256(toUtf8Bytes(signature)).toLowerCase();
    if (targetHashes.has(hash)) {
      console.log('Found match in', p, ':', signature, hash);
    }
  }
}
