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

@Injectable({
  providedIn: 'root',
})
export class LensApiService {
  private readonly http = inject(HttpClient);

  private readonly baseUrl = 'http://localhost:3000/api';

  analyzeSource(url: string): Observable<AnalyzeSourceResponse> {
    return this.http.post<AnalyzeSourceResponse>(`${this.baseUrl}/sources/analyze`, { url });
  }
}
