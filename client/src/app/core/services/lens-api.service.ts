import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export type SourceType = 'channel' | 'playlist' | 'video';

export interface AnalyzeSourceResponse {
  platform: 'youtube' | 'unknown';
  type: SourceType | 'unknown';
  url: string;
  externalId: string | null;
  status: 'detected' | 'unsupported' | 'invalid';
  metadataStatus: 'available' | 'unavailable' | 'not-requested';
  metadata: {
    title: string;
    authorName: string;
    authorUrl: string;
    thumbnailUrl: string | null;
    providerName: string;
  } | null;
  metadataMessage: string | null;
  channel: {
    platform: 'youtube';
    channelId: string;
    handle: string | null;
    name: string;
    description: string | null;
    thumbnailUrl: string | null;
    subscriberCount: number | null;
    hiddenSubscriberCount: boolean | null;
    videoCount: number | null;
    viewCount: number | null;
    country: string | null;
    createdAt: string | null;
    uploadsPlaylistId: string | null;
    sourceUrl: string;
    provider: string;
    fetchedAt: string;
  } | null;
  creatorIdentity: {
    displayName: string;
    profileUrl: string | null;
    status: 'needs-review';
    basis: string;
  } | null;
}

export interface YouTubeSyncResponse {
  platform: 'youtube';
  type: 'channel';
  url: string;
  channelId: string | null;
  handle: string | null;
  feedUrl: string | null;
  status: 'completed' | 'needs-review' | 'failed';
  sync: {
    sourceId: string;
    channelId: string;
    channelUrl: string;
    handle: string | null;
    lastCheckedAt: string | null;
    lastSuccessfulSyncAt: string | null;
  } | null;
  discovered: Array<{
    videoId: string;
    title: string | null;
    url: string;
    publishedAt: string | null;
    discoveredAt?: string;
    status?: string;
  }>;
  skipped: Array<{
    videoId: string;
    title: string | null;
    url: string;
    publishedAt: string | null;
    status?: string;
  }>;
  newVideos: Array<{
    videoId: string;
    title: string | null;
    url: string;
    publishedAt: string | null;
    discoveredAt?: string;
    status?: string;
  }>;
  message: string | null;
}
export interface SourceAccount {
  sourceKey: string;
  platform: 'youtube';
  sourceType: SourceType;
  externalId: string;
  url: string;
  handle: string | null;
  status: 'active' | 'needs-review' | 'failed';
  lastCheckedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
  contentCount: number;
}

export interface SourceVideo {
  videoId: string;
  title: string | null;
  url: string;
  publishedAt: string | null;
  discoveredAt: string | null;
  status: 'discovered' | 'skipped' | 'processed' | 'failed' | 'needs-review' | 'processing' | null;
}

export interface ListSourceVideosResponse {
  sourceKey: string;
  videos: SourceVideo[];
}

export interface ListSourcesResponse {
  sources: SourceAccount[];
}

@Injectable({
  providedIn: 'root',
})
export class LensApiService {
  private readonly http = inject(HttpClient);

  private readonly baseUrl = 'http://localhost:3000/api';

  analyzeSource(url: string): Observable<AnalyzeSourceResponse> {
    return this.http.post<AnalyzeSourceResponse>(`${this.baseUrl}/sources/analyze`, { url });
  }

  syncYouTubeChannel(url: string): Observable<YouTubeSyncResponse> {
    return this.http.post<YouTubeSyncResponse>(`${this.baseUrl}/sources/youtube/sync`, { url });
  }

  listSources(): Observable<ListSourcesResponse> {
    return this.http.get<ListSourcesResponse>(`${this.baseUrl}/sources`);
  }

  listSourceVideos(sourceKey: string): Observable<ListSourceVideosResponse> {
    return this.http.get<ListSourceVideosResponse>(
      `${this.baseUrl}/sources/${encodeURIComponent(sourceKey)}/videos`,
    );
  }

  updateSourceVideoStatus(sourceKey: string, videoId: string, status: SourceVideo['status']) {
    return this.http.patch<{
      sourceKey: string;
      videoId: string;
      status: NonNullable<SourceVideo['status']>;
    }>(
      `${this.baseUrl}/sources/${encodeURIComponent(sourceKey)}/videos/${encodeURIComponent(videoId)}/status`,
      {
        status,
      },
    );
  }

  processSourceVideo(
    sourceKey: string,
    videoId: string,
  ): Observable<{
    sourceKey: string;
    videoId: string;
    status: 'processing';
  }> {
    return this.http.post<{
      sourceKey: string;
      videoId: string;
      status: 'processing';
    }>(
      `${this.baseUrl}/sources/${encodeURIComponent(sourceKey)}/videos/${encodeURIComponent(videoId)}/process`,
      {},
    );
  }
}
