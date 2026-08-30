import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { describe, beforeEach, afterEach, expect, it } from 'vitest';

import {
  LensApiService,
  type AnalyzeSourceResponse,
  type ListSourcesResponse,
  type YouTubeSyncResponse,
} from './lens-api.service';

describe('LensApiService', () => {
  let service: LensApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        LensApiService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(LensApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create the service', () => {
    expect(service).toBeTruthy();
  });

  it('should analyze a source URL', () => {
    const response: AnalyzeSourceResponse = {
      platform: 'youtube',
      type: 'channel',
      url: 'https://www.youtube.com/@OpenAI',
      externalId: 'UCXZCJLdBC09xxGZ6gcdrc6A',
      status: 'detected',
      metadataStatus: 'available',
      metadata: {
        title: 'OpenAI',
        authorName: 'OpenAI',
        authorUrl: 'https://www.youtube.com/@OpenAI',
        thumbnailUrl: null,
        providerName: 'youtube',
      },
      metadataMessage: null,
      channel: {
        platform: 'youtube',
        channelId: 'UCXZCJLdBC09xxGZ6gcdrc6A',
        handle: '@OpenAI',
        name: 'OpenAI',
        description: 'AI research and deployment',
        thumbnailUrl: null,
        subscriberCount: null,
        hiddenSubscriberCount: null,
        videoCount: null,
        viewCount: null,
        country: null,
        createdAt: null,
        uploadsPlaylistId: null,
        sourceUrl: 'https://www.youtube.com/@OpenAI',
        provider: 'youtube',
        fetchedAt: '2026-08-29T19:00:00.000Z',
      },
      creatorIdentity: {
        displayName: 'OpenAI',
        profileUrl: 'https://www.youtube.com/@OpenAI',
        status: 'needs-review',
        basis: 'Resolved from YouTube channel metadata.',
      },
    };

    service.analyzeSource('https://www.youtube.com/@OpenAI').subscribe(
      (result) => {
        expect(result).toEqual(response);
      },
    );

    const request = httpMock.expectOne(
      'http://localhost:3000/api/sources/analyze',
    );

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      url: 'https://www.youtube.com/@OpenAI',
    });

    request.flush(response);
  });

  it('should sync a YouTube channel', () => {
    const response: YouTubeSyncResponse = {
      platform: 'youtube',
      type: 'channel',
      url: 'https://www.youtube.com/@OpenAI',
      channelId: 'UCXZCJLdBC09xxGZ6gcdrc6A',
      handle: '@OpenAI',
      feedUrl:
        'https://www.youtube.com/feeds/videos.xml?channel_id=UCXZCJLdBC09xxGZ6gcdrc6A',
      status: 'completed',
      sync: {
        sourceId: 'youtube:channel-id:ucxzcjldbc09xxgz6gcdrc6a',
        channelId: 'UCXZCJLdBC09xxGZ6gcdrc6A',
        channelUrl: 'https://www.youtube.com/@OpenAI',
        handle: '@OpenAI',
        lastCheckedAt: '2026-08-29T19:00:00.000Z',
        lastSuccessfulSyncAt: '2026-08-29T19:00:00.000Z',
      },
      discovered: [],
      skipped: [],
      newVideos: [],
      message: null,
    };

    service.syncYouTubeChannel('https://www.youtube.com/@OpenAI').subscribe(
      (result) => {
        expect(result).toEqual(response);
      },
    );

    const request = httpMock.expectOne(
      'http://localhost:3000/api/sources/youtube/sync',
    );

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      url: 'https://www.youtube.com/@OpenAI',
    });

    request.flush(response);
  });

  it('should list sources', () => {
    const response: ListSourcesResponse = {
      sources: [
        {
          sourceKey: 'youtube:channel-id:ucxzcjldbc09xxgz6gcdrc6a',
          platform: 'youtube',
          sourceType: 'channel',
          externalId: 'UCXZCJLdBC09xxGZ6gcdrc6A',
          url: 'https://www.youtube.com/@OpenAI',
          handle: '@OpenAI',
          status: 'active',
          lastCheckedAt: '2026-08-29T19:00:00.000Z',
          lastSuccessfulSyncAt: '2026-08-29T19:00:00.000Z',
          createdAt: '2026-08-29T18:00:00.000Z',
          updatedAt: '2026-08-29T19:00:00.000Z',
          contentCount: 0,
        },
      ],
    };

    service.listSources().subscribe((result) => {
      expect(result).toEqual(response);
    });

    const request = httpMock.expectOne(
      'http://localhost:3000/api/sources',
    );

    expect(request.request.method).toBe('GET');
    expect(request.request.body).toBeNull();

    request.flush(response);
  });
});