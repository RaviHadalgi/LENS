import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
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

  it('should POST a source URL to the analyze endpoint', () => {
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
        description: 'OpenAI channel',
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
      creatorIdentity: null,
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

  it('should POST a YouTube channel URL to the sync endpoint', () => {
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

    service
      .syncYouTubeChannel('https://www.youtube.com/@OpenAI')
      .subscribe((result) => {
        expect(result).toEqual(response);
      });

    const request = httpMock.expectOne(
      'http://localhost:3000/api/sources/youtube/sync',
    );

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      url: 'https://www.youtube.com/@OpenAI',
    });

    request.flush(response);
  });

  it('should GET the source list', () => {
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
          lastCheckedAt: '2026-08-29T19:34:15.559Z',
          lastSuccessfulSyncAt: '2026-08-29T19:34:15.559Z',
          createdAt: '2026-08-29T18:00:49.095Z',
          updatedAt: '2026-08-29T19:34:15.939Z',
        },
      ],
    };

    service.listSources().subscribe((result) => {
      expect(result).toEqual(response);
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0]?.handle).toBe('@OpenAI');
    });

    const request = httpMock.expectOne(
      'http://localhost:3000/api/sources',
    );

    expect(request.request.method).toBe('GET');
    expect(request.request.body).toBeNull();

    request.flush(response);
  });

  it('should propagate analyze API errors', () => {
    let receivedError: unknown;

    service
      .analyzeSource('https://www.youtube.com/@OpenAI')
      .subscribe({
        next: () => {
          throw new Error('Expected the request to fail');
        },
        error: (error) => {
          receivedError = error;
        },
      });

    const request = httpMock.expectOne(
      'http://localhost:3000/api/sources/analyze',
    );

    request.flush(
      {
        status: 'invalid',
        message: 'Invalid source URL',
      },
      {
        status: 400,
        statusText: 'Bad Request',
      },
    );

    expect(receivedError).toBeTruthy();
  });

  it('should propagate source list API errors', () => {
    let receivedError: unknown;

    service.listSources().subscribe({
      next: () => {
        throw new Error('Expected the request to fail');
      },
      error: (error) => {
        receivedError = error;
      },
    });

    const request = httpMock.expectOne(
      'http://localhost:3000/api/sources',
    );

    request.flush(
      {
        message: 'Server unavailable',
      },
      {
        status: 500,
        statusText: 'Internal Server Error',
      },
    );

    expect(receivedError).toBeTruthy();
  });
});