// Script to check what events were emitted by the target transaction
// This queries the blockchain directly to see actual events

const TARGET_TX = '0x35d98f0b0f011f74e6f3bf0f56c15106fb4799bf44040b2d009a54a7db91f87a';
const RAILGUN_PROXY = '0xeCFCf3b4eC647c4Ca6D49108b311b7a7C9543fea';
const RPC_URL = process.env.RPC_SEPOLIA || 'https://ethereum-sepolia.publicnode.com';

async function checkTransactionEvents() {
  console.log('🔍 Checking transaction events on blockchain...\n');
  console.log(`Transaction: ${TARGET_TX}`);
  console.log(`Railgun Proxy: ${RAILGUN_PROXY}`);
  console.log(`RPC: ${RPC_URL}\n`);

  try {
    // Fetch transaction receipt to get logs
    const response = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getTransactionReceipt',
        params: [TARGET_TX],
        id: 1
      })
    });

    const data = await response.json();
    if (data.error) {
      console.error('❌ RPC Error:', data.error);
      return;
    }

    const receipt = data.result;
    if (!receipt) {
      console.error('❌ Transaction not found');
      return;
    }

    console.log(`✅ Transaction found in block: ${parseInt(receipt.blockNumber, 16)}`);
    console.log(`📊 Total logs: ${receipt.logs.length}\n`);

    // Filter logs from Railgun proxy
    const railgunLogs = receipt.logs.filter(log => 
      log.address.toLowerCase() === RAILGUN_PROXY.toLowerCase()
    );

    console.log(`🎯 Logs from Railgun proxy: ${railgunLogs.length}\n`);

    if (railgunLogs.length === 0) {
      console.log('⚠️  No logs found from Railgun proxy!');
      console.log('   This might mean:');
      console.log('   - Transaction was sent TO the proxy but didn\'t emit events');
      console.log('   - Events were emitted from a different contract');
      console.log('   - Transaction was a simple transfer without events');
      return;
    }

    // Analyze each log
    railgunLogs.forEach((log, index) => {
      console.log(`\n📋 Log ${index}:`);
      console.log(`   Address: ${log.address}`);
      console.log(`   Topics: ${log.topics.length}`);
      console.log(`   Topic[0] (event sig): ${log.topics[0]}`);
      
      if (log.topics.length >= 2) {
        console.log(`   Topic[1] (indexed param): ${log.topics[1]}`);
      }
      if (log.topics.length >= 3) {
        console.log(`   Topic[2]: ${log.topics[2]}`);
      }
      if (log.topics.length >= 4) {
        console.log(`   Topic[3]: ${log.topics[3]}`);
      }
      
      console.log(`   Data length: ${log.data.length} chars (${(log.data.length - 2) / 2} bytes)`);
      if (log.data.length > 2) {
        const dataBytes = (log.data.length - 2) / 2;
        console.log(`   Data preview: ${log.data.substring(0, 66)}...`);
        
        // Try to identify event type
        const topic0 = log.topics[0].toLowerCase();
        console.log(`   Event signature: ${topic0}`);
        
        // Try to decode data field (ABI decode)
        if (log.data.length > 2) {
          const dataHex = log.data.substring(2);
          const dataBytes = Buffer.from(dataHex, 'hex');
          
          console.log(`\n   📦 Data Analysis (${dataBytes.length} bytes):`);
          
          // ABI encoding for multiple arrays:
          // - First N words (32 bytes each) = offsets to arrays
          // - At each offset: length (32 bytes) + array data
          
          // Try to find array offsets (typically 0x60, 0x80, etc.)
          const offsets = [];
          for (let i = 0; i < Math.min(10, Math.floor(dataBytes.length / 32)); i++) {
            const word = dataBytes.slice(i * 32, (i + 1) * 32);
            const offset = word.readUInt32BE(28); // Last 4 bytes
            if (offset >= 32 && offset < dataBytes.length && offset % 32 === 0) {
              offsets.push({ index: i, offset, hex: word.toString('hex') });
            }
          }
          
          console.log(`\n   🔍 Potential array offsets:`);
          offsets.forEach(o => {
            console.log(`   - Word ${o.index}: offset ${o.offset} (0x${o.offset.toString(16)})`);
          });
          
          // Try to decode arrays at each offset
          offsets.forEach(({ offset, index }) => {
            if (offset + 32 <= dataBytes.length) {
              const lengthWord = dataBytes.slice(offset, offset + 32);
              const length = lengthWord.readUInt32BE(28);
              
              console.log(`\n   📊 Array at offset ${offset} (word ${index}):`);
              console.log(`   - Length word: 0x${lengthWord.toString('hex')}`);
              console.log(`   - Interpreted length: ${length}`);
              
              if (length > 0 && length < 100 && (offset + 32 + (length * 32)) <= dataBytes.length) {
                console.log(`   - ✅ Valid array! Extracting ${length} bytes32 values:`);
                const arrayStart = offset + 32; // Skip length word
                
                for (let i = 0; i < Math.min(length, 10); i++) {
                  const hashStart = arrayStart + (i * 32);
                  if (hashStart + 32 <= dataBytes.length) {
                    const hash = '0x' + dataBytes.slice(hashStart, hashStart + 32).toString('hex');
                    console.log(`     [${i}]: ${hash}`);
                  }
                }
                if (length > 10) {
                  console.log(`     ... and ${length - 10} more`);
                }
              } else {
                console.log(`   - ⚠️  Invalid length (${length}), skipping`);
              }
            }
          });
          
          // Also try direct interpretation if offsets don't work
          if (offsets.length === 0 && dataBytes.length >= 64) {
            console.log(`\n   🔍 No clear offsets found, trying direct interpretation:`);
            // Maybe first word is offset to first array
            const firstOffset = dataBytes.readUInt32BE(28);
            if (firstOffset >= 32 && firstOffset < dataBytes.length) {
              const length = dataBytes.readUInt32BE(firstOffset + 28);
              console.log(`   - First offset: ${firstOffset}, length: ${length}`);
              if (length > 0 && length < 100) {
                const arrayStart = firstOffset + 32;
                console.log(`   - Extracting first ${Math.min(length, 5)} values:`);
                for (let i = 0; i < Math.min(length, 5); i++) {
                  const hashStart = arrayStart + (i * 32);
                  if (hashStart + 32 <= dataBytes.length) {
                    const hash = '0x' + dataBytes.slice(hashStart, hashStart + 32).toString('hex');
                    console.log(`     [${i}]: ${hash}`);
                  }
                }
              }
            }
          }
        }
        
        // Common Railgun event signatures (approximate)
        // Nullified(bytes32) ≈ 0x... (need to calculate)
        // Commitment(bytes32,...) ≈ 0x... (need to calculate)
      }
    });

    console.log('\n✅ Analysis complete!');
    console.log('\n💡 Next steps:');
    console.log('   1. Compare topic0 values with known Railgun event signatures');
    console.log('   2. Update processor to match these specific signatures');
    console.log('   3. Extract data from topics[1] for indexed bytes32 parameters');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkTransactionEvents();

