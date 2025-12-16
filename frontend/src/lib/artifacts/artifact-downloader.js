/**
 * Artifact Downloader
 * 
 * Minimal stub implementation converted from TypeScript.
 * Full implementation will be added later.
 */

import { ArtifactStore } from './artifact-store';

export class ArtifactDownloader {
  constructor(artifactStore, useNativeArtifacts) {
    this.artifactStore = artifactStore;
    this.useNativeArtifacts = useNativeArtifacts;
  }

  async downloadArtifacts(artifactVariantString) {
    throw new Error('ArtifactDownloader not yet fully implemented');
  }

  async getDownloadedArtifacts(artifactVariantString) {
    throw new Error('ArtifactDownloader not yet fully implemented');
  }
}

