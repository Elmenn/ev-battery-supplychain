// create-artifact-store.js
// Persistent store for downloading large artifact files required by Engine
import { ArtifactStore } from '@railgun-community/wallet';
import localforage from 'localforage';

export const createArtifactStore = () => {
  console.log('🔧 Creating ArtifactStore for browser environment...');
  
  // Configure localforage for better browser compatibility
  localforage.config({
    name: 'railgun-artifacts',
    storeName: 'zkp-circuits',
    description: 'Railgun ZKP circuit artifacts for private transactions'
  });
  
  // Test localforage functionality
  const testLocalForage = async () => {
    try {
      const testKey = 'test-connection';
      const testValue = 'test-data';
      await localforage.setItem(testKey, testValue);
      const retrieved = await localforage.getItem(testKey);
      await localforage.removeItem(testKey);
      
      if (retrieved === testValue) {
        console.log('✅ LocalForage is working correctly');
        return true;
      } else {
        console.warn('⚠️ LocalForage test failed - retrieved value mismatch');
        return false;
      }
    } catch (error) {
      console.error('❌ LocalForage test failed:', error.message);
      return false;
    }
  };
  
  // Run the test
  testLocalForage();
  
  const artifactStore = new ArtifactStore(
    // Get function - retrieve artifact from storage
    async (path) => {
      try {
        console.log(`📥 ArtifactStore: Retrieving ${path}...`);
        const item = await localforage.getItem(path);
        if (item) {
          console.log(`✅ ArtifactStore: Retrieved ${path} (${item.length || 'unknown'} bytes)`);
        } else {
          console.log(`⏳ ArtifactStore: ${path} not found in storage`);
          console.log(`💡 This may trigger a download from the SDK`);
        }
        return item;
      } catch (error) {
        console.error(`❌ ArtifactStore: Error retrieving ${path}:`, error.message);
        throw error;
      }
    },
    
    // Set function - store artifact in storage
    async (dir, path, item) => {
      try {
        console.log(`💾 ArtifactStore: Storing ${path} (${item.length || 'unknown'} bytes)...`);
        console.log(`   📁 Directory: ${dir}`);
        console.log(`   📄 Path: ${path}`);
        console.log(`   📏 Size: ${item.length || 'unknown'} bytes`);
        console.log(`   🔍 Item type: ${typeof item}`);
        
        if (item instanceof ArrayBuffer) {
          console.log(`   📊 ArrayBuffer: ${item.byteLength} bytes`);
        } else if (item instanceof Uint8Array) {
          console.log(`   📊 Uint8Array: ${item.length} bytes`);
        } else if (typeof item === 'string') {
          console.log(`   📊 String: ${item.length} characters`);
        }
        
        await localforage.setItem(path, item);
        console.log(`✅ ArtifactStore: Stored ${path} successfully`);
        
        // Verify storage
        const verify = await localforage.getItem(path);
        if (verify && verify.length === item.length) {
          console.log(`✅ ArtifactStore: Verified ${path} storage (${verify.length} bytes)`);
        } else {
          console.warn(`⚠️ ArtifactStore: Storage verification failed for ${path}`);
          console.warn(`   Expected: ${item.length} bytes, Got: ${verify?.length || 'null'} bytes`);
        }
      } catch (error) {
        console.error(`❌ ArtifactStore: Error storing ${path}:`, error.message);
        console.error(`   Stack trace:`, error.stack);
        throw error;
      }
    },
    
    // Exists function - check if artifact exists in storage
    async (path) => {
      try {
        const exists = await localforage.getItem(path) != null;
        console.log(`🔍 ArtifactStore: ${path} exists: ${exists}`);
        return exists;
      } catch (error) {
        console.error(`❌ ArtifactStore: Error checking ${path}:`, error.message);
        return false;
      }
    }
  );
  
  console.log('✅ ArtifactStore created successfully');
  return artifactStore;
};
