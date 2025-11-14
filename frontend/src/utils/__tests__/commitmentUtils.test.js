// Tests for commitmentUtils.js
import { generateBindingTag, generateDeterministicBlinding } from '../commitmentUtils';

describe('generateBindingTag', () => {
  const testContext = {
    chainId: 11155111, // Sepolia
    escrowAddr: '0x1234567890123456789012345678901234567890',
    productId: 1,
    stage: 0,
    schemaVersion: '1.0',
  };

  it('should generate a binding tag with required parameters', () => {
    const bindingTag = generateBindingTag(testContext);
    
    expect(bindingTag).toBeDefined();
    expect(typeof bindingTag).toBe('string');
    expect(bindingTag.length).toBe(64); // 32 bytes = 64 hex chars
    expect(bindingTag).toMatch(/^[0-9a-f]{64}$/); // Valid hex string
  });

  it('should generate different binding tags for different contexts', () => {
    const tag1 = generateBindingTag(testContext);
    const tag2 = generateBindingTag({ ...testContext, productId: 2 });
    const tag3 = generateBindingTag({ ...testContext, stage: 1 });
    
    expect(tag1).not.toBe(tag2);
    expect(tag1).not.toBe(tag3);
    expect(tag2).not.toBe(tag3);
  });

  it('should generate the same binding tag for the same context', () => {
    const tag1 = generateBindingTag(testContext);
    const tag2 = generateBindingTag(testContext);
    
    expect(tag1).toBe(tag2);
  });

  it('should include previous VC CID when provided (v2)', () => {
    const tagV1 = generateBindingTag(testContext);
    const tagV2 = generateBindingTag({
      ...testContext,
      previousVCCid: 'QmTest1234567890123456789012345678901234567890',
    });
    
    expect(tagV1).not.toBe(tagV2);
  });

  it('should throw error for missing required parameters', () => {
    expect(() => generateBindingTag({})).toThrow();
    expect(() => generateBindingTag({ chainId: 11155111 })).toThrow();
    expect(() => generateBindingTag({ chainId: 11155111, escrowAddr: '0x123...' })).toThrow();
  });

  it('should throw error for invalid stage', () => {
    expect(() => generateBindingTag({ ...testContext, stage: -1 })).toThrow();
    expect(() => generateBindingTag({ ...testContext, stage: 3 })).toThrow();
    expect(() => generateBindingTag({ ...testContext, stage: 'invalid' })).toThrow();
  });

  it('should normalize addresses correctly', () => {
    const tag1 = generateBindingTag(testContext);
    const tag2 = generateBindingTag({
      ...testContext,
      escrowAddr: testContext.escrowAddr.toLowerCase(), // Lowercase address
    });
    
    // Should generate the same tag (addresses are normalized)
    expect(tag1).toBe(tag2);
  });

  it('should handle different chain IDs', () => {
    const sepoliaTag = generateBindingTag({ ...testContext, chainId: 11155111 });
    const localTag = generateBindingTag({ ...testContext, chainId: 1337 });
    
    expect(sepoliaTag).not.toBe(localTag);
  });

  it('should handle bigint productId', () => {
    const tag1 = generateBindingTag({ ...testContext, productId: 1 });
    const tag2 = generateBindingTag({ ...testContext, productId: BigInt(1) });
    
    expect(tag1).toBe(tag2);
  });

  it('should handle string chainId', () => {
    const tag1 = generateBindingTag({ ...testContext, chainId: 11155111 });
    const tag2 = generateBindingTag({ ...testContext, chainId: '11155111' });
    
    expect(tag1).toBe(tag2);
  });
});

describe('generateDeterministicBlinding', () => {
  it('should generate the same blinding for the same inputs', () => {
    const productAddr = '0x1234567890123456789012345678901234567890';
    const sellerAddr = '0x0987654321098765432109876543210987654321';
    
    const blinding1 = generateDeterministicBlinding(productAddr, sellerAddr);
    const blinding2 = generateDeterministicBlinding(productAddr, sellerAddr);
    
    expect(blinding1).toBe(blinding2);
    expect(blinding1.length).toBe(64); // 32 bytes = 64 hex chars
  });

  it('should generate different blinding for different inputs', () => {
    const productAddr = '0x1234567890123456789012345678901234567890';
    const sellerAddr1 = '0x0987654321098765432109876543210987654321';
    const sellerAddr2 = '0x1111111111111111111111111111111111111111';
    
    const blinding1 = generateDeterministicBlinding(productAddr, sellerAddr1);
    const blinding2 = generateDeterministicBlinding(productAddr, sellerAddr2);
    
    expect(blinding1).not.toBe(blinding2);
  });
});

