import type { DetectedSource, SourceMetadataResult, SourceProvider } from './source-provider';

export class SourceProviderRegistry {
  constructor(private readonly providers: SourceProvider[]) {}

  getMetadata(source: DetectedSource): Promise<SourceMetadataResult> {
    const provider = this.providers.find(
      (candidate) => candidate.platform === source.platform,
    );

    if (!provider) {
      return Promise.resolve({
        status: 'not-requested',
        metadata: null,
        channel: null,
        message: `No metadata provider is configured for ${source.platform}.`,
      });
    }

    return provider.getMetadata(source);
  }
}
