const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCpayBindingTag } = require('./paymentBridgeModel');

test('buildCpayBindingTag is deterministic for equivalent normalized inputs', () => {
  const lower = buildCpayBindingTag({
    chainId: '11155111',
    escrowAddress: '0x1234567890abcdef1234567890abcdef12345678',
    orderId: '0x' + 'ab'.repeat(32),
    depositTxHash: '0x' + 'cd'.repeat(32),
  });

  const upper = buildCpayBindingTag({
    chainId: 11155111,
    escrowAddress: '0x1234567890ABCDEF1234567890ABCDEF12345678',
    orderId: ('0x' + 'AB'.repeat(32)).toUpperCase(),
    depositTxHash: ('0x' + 'CD'.repeat(32)).toUpperCase(),
  });

  assert.equal(lower, upper);
});

test('buildCpayBindingTag changes when depositTxHash changes', () => {
  const first = buildCpayBindingTag({
    chainId: '11155111',
    escrowAddress: '0x1234567890abcdef1234567890abcdef12345678',
    orderId: '0x' + 'ab'.repeat(32),
    depositTxHash: '0x' + 'cd'.repeat(32),
  });

  const second = buildCpayBindingTag({
    chainId: '11155111',
    escrowAddress: '0x1234567890abcdef1234567890abcdef12345678',
    orderId: '0x' + 'ab'.repeat(32),
    depositTxHash: '0x' + 'ef'.repeat(32),
  });

  assert.notEqual(first, second);
});
