import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
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
      providers: [LensApiService, provideHttpClient(), provideHttpClientTesting()],
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

  it('lists recent conversations', () => {
    service.listConversations().subscribe((result) => {
      expect(result.conversations[0]?.title).toBe('Saved conversation');
    });

    const request = httpMock.expectOne('http://localhost:3000/api/conversations');
    expect(request.request.method).toBe('GET');
    request.flush({
      conversations: [{
        id: '4c3ff1b7-2ed7-4e35-bd10-736f1d05ca6c',
        title: 'Saved conversation',
        createdAt: '2026-11-24T00:00:00.000Z',
        updatedAt: '2026-11-24T00:00:00.000Z',
        turnCount: 1,
      }],
    });
  });

  it('loads a saved conversation with its context', () => {
    const conversationId = '4c3ff1b7-2ed7-4e35-bd10-736f1d05ca6c';

    service.getConversation(conversationId).subscribe((result) => {
      expect(result.conversation.turns).toHaveLength(1);
    });

    const request = httpMock.expectOne(
      `http://localhost:3000/api/conversations/${conversationId}`,
    );
    expect(request.request.method).toBe('GET');
    request.flush({
      conversation: {
        id: conversationId,
        title: 'Saved conversation',
        createdAt: '2026-11-24T00:00:00.000Z',
        updatedAt: '2026-11-24T00:00:00.000Z',
        turnCount: 1,
        turns: [{
          id: 1,
          question: 'Saved conversation',
          mode: 'all',
          answer: {
            summary: 'Saved answer', sources: [], commonGround: '', differences: '',
            stats: { sources: 0, knowledgeItems: 0, repeatedFiltered: 0, newConnections: 0 },
          },
          createdAt: '2026-11-24T00:00:00.000Z',
        }],
      },
    });
  });

  it('creates or appends a conversation turn', () => {
    const answer = {
      summary: 'Saved answer', sources: [], commonGround: '', differences: '',
      stats: { sources: 0, knowledgeItems: 0, repeatedFiltered: 0, newConnections: 0 },
    };

    service.saveConversationTurn({
      conversationId: null,
      question: 'Start a new context',
      mode: 'deep',
      answer,
    }).subscribe((result) => {
      expect(result.created).toBe(true);
    });

    const request = httpMock.expectOne('http://localhost:3000/api/conversations/turns');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      conversationId: null,
      question: 'Start a new context',
      mode: 'deep',
      answer,
    });
    request.flush({
      created: true,
      conversation: {
        id: '4c3ff1b7-2ed7-4e35-bd10-736f1d05ca6c',
        title: 'Start a new context',
        createdAt: '2026-11-24T00:00:00.000Z',
        updatedAt: '2026-11-24T00:00:00.000Z',
        turnCount: 1,
        turns: [],
      },
    });
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

    service.analyzeSource('https://www.youtube.com/@OpenAI').subscribe((result) => {
      expect(result).toEqual(response);
    });

    const request = httpMock.expectOne('http://localhost:3000/api/sources/analyze');

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
      feedUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCXZCJLdBC09xxGZ6gcdrc6A',
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

    service.syncYouTubeChannel('https://www.youtube.com/@OpenAI').subscribe((result) => {
      expect(result).toEqual(response);
    });

    const request = httpMock.expectOne('http://localhost:3000/api/sources/youtube/sync');

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      url: 'https://www.youtube.com/@OpenAI',
    });

    request.flush(response);
  });

  it('syncs the latest content for a previously saved source', () => {
    const sourceKey = 'youtube:channel-id:uc-test';

    service.syncSource(sourceKey).subscribe((result) => {
      expect(result.newVideos).toHaveLength(1);
    });

    const request = httpMock.expectOne(
      'http://localhost:3000/api/sources/youtube%3Achannel-id%3Auc-test/sync',
    );

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});

    request.flush({
      platform: 'youtube',
      type: 'channel',
      url: 'https://youtube.com/channel/UCtest',
      channelId: 'UCtest',
      handle: '@test',
      feedUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCtest',
      status: 'completed',
      sync: null,
      discovered: [{ videoId: 'LATEST' }],
      skipped: [{ videoId: 'STORED' }],
      newVideos: [{ videoId: 'LATEST' }],
      message: null,
    });
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

    const request = httpMock.expectOne('http://localhost:3000/api/sources');

    expect(request.request.method).toBe('GET');
    expect(request.request.body).toBeNull();

    request.flush(response);
  });

  it('deletes a source and its associated data', () => {
    const sourceKey = 'youtube:channel-id:uc-test';

    service.deleteSource(sourceKey).subscribe((result) => {
      expect(result.status).toBe('deleted');
      expect(result.deletedVideos).toBe(2);
    });

    const request = httpMock.expectOne(
      'http://localhost:3000/api/sources/youtube%3Achannel-id%3Auc-test',
    );

    expect(request.request.method).toBe('DELETE');

    request.flush({
      status: 'deleted',
      sourceKey,
      deletedVideos: 2,
      deletedProcessingAttempts: 1,
      deletedContentVersions: 1,
    });
  });

  it('lists videos for a source', () => {
    const sourceKey = 'youtube:channel-id:uc-test';

    service.listSourceVideos(sourceKey).subscribe((result) => {
      expect(result.videos).toHaveLength(1);
    });

    const request = httpMock.expectOne(
  `http://localhost:3000/api/sources/${encodeURIComponent(sourceKey)}/videos`,
);

    expect(request.request.method).toBe('GET');

    request.flush({
      videos: [
        {
          videoId: 'VIDEO-1',
          title: 'Test video',
          url: 'https://youtube.com/watch?v=VIDEO-1',
          publishedAt: '2026-08-30T00:00:00Z',
        },
      ],
    });
  });

  it('updates the processing status of a source video', () => {
  service.updateSourceVideoStatus(
    'youtube:channel-id:uc-test',
    'VIDEO-123',
    'needs-review',
  ).subscribe((result) => {
    expect(result).toEqual({
      sourceKey: 'youtube:channel-id:uc-test',
      videoId: 'VIDEO-123',
      status: 'needs-review',
    });
  });

  const request = httpMock.expectOne(
    'http://localhost:3000/api/sources/youtube%3Achannel-id%3Auc-test/videos/VIDEO-123/status',
  );

  expect(request.request.method).toBe('PATCH');
  expect(request.request.body).toEqual({
    status: 'needs-review',
  });

  request.flush({
    sourceKey: 'youtube:channel-id:uc-test',
    videoId: 'VIDEO-123',
    status: 'needs-review',
  });
});

  it('processes transcript paragraphs as source segments', () => {
    service.processSourceVideo('source/a', 'video-1', 'First.\n\nSecond.').subscribe();

    const request = httpMock.expectOne(
      'http://localhost:3000/api/sources/source%2Fa/videos/video-1/process',
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      transcript: {
        language: 'und',
        segments: [
          { text: 'First.', startSeconds: null, endSeconds: null },
          { text: 'Second.', startSeconds: null, endSeconds: null },
        ],
      },
    });
    request.flush({
      sourceKey: 'source/a', videoId: 'video-1', status: 'processed',
      attemptId: 1, versionId: 1, claimCount: 2,
    });
  });
});
