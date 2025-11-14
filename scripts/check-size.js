const fs = require('fs');

for (const name of ['ProductFactory', 'ProductEscrow']) {
  const a = JSON.parse(fs.readFileSync(`build/contracts/${name}.json`, 'utf8'));
  const size = (a.deployedBytecode || a.bytecode || '').replace(/^0x/, '').length / 2;
  console.log(name, 'bytes:', size);
} 