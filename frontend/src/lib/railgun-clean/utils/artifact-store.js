// Simple browser artifact-store wrapper (uses localforage if available)
let store = null;
try {
  // eslint-disable-next-line import/no-extraneous-dependencies
  // localforage is optional; if not present, fall back to in-memory Map
  // This file intentionally avoids heavy logic — the app can vendor artifacts separately
  // to avoid CORS issues when loading ZKP artifacts.
  // Import dynamically to keep module light
  // Note: import may fail in some build pipelines; caller should handle errors.
  // Fallback will be created below.
} catch (e) {}

const memory = new Map();

export async function getArtifact(path) {
  try {
    if (typeof localforage !== 'undefined') {
      const v = await localforage.getItem(path);
      return v || null;
    }
  } catch (err) {
    // ignore and fallback
  }
  return memory.get(path) || null;
}

export async function storeArtifact(path, data) {
  try {
    if (typeof localforage !== 'undefined') {
      await localforage.setItem(path, data);
      return true;
    }
  } catch (err) {
    // ignore and fallback
  }
  memory.set(path, data);
  return true;
}

export async function existsArtifact(path) {
  try {
    if (typeof localforage !== 'undefined') {
      const v = await localforage.getItem(path);
      return v != null;
    }
  } catch (err) {}
  return memory.has(path);
}

export default { getArtifact, storeArtifact, existsArtifact };
