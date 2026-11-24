import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { describe, beforeEach, expect, it, vi } from 'vitest';

import { SourcesPage } from './sources-page';
import { LensApiService, type SourceVideo } from '../../../../core/services/lens-api.service';

describe('SourcesPage', () => {
  let fixture: ComponentFixture<SourcesPage>;
  let component: SourcesPage;

  const apiMock = {
    listSources: vi.fn(),
    analyzeSource: vi.fn(),
    syncYouTubeChannel: vi.fn(),
    syncSource: vi.fn(),
    listSourceVideos: vi.fn(),
    updateSourceVideoStatus: vi.fn(),
    processSourceVideo: vi.fn(),
    deleteSourceVideoTranscript: vi.fn(),
    deleteSource: vi.fn(),
  };

  beforeEach(async () => {
    apiMock.syncYouTubeChannel.mockReset();
    apiMock.syncSource.mockReset();
    apiMock.listSourceVideos.mockReset();
    apiMock.processSourceVideo.mockReset();
    apiMock.deleteSourceVideoTranscript.mockReset();
    apiMock.deleteSource.mockReset();
    apiMock.syncYouTubeChannel.mockReturnValue(
      of({
        platform: 'youtube',
        type: 'channel',
        url: 'https://youtube.com/@OpenAI',
        channelId: 'UCXZCJLdBC09xxGZ6gcdrc6A',
        handle: '@OpenAI',
        feedUrl: null,
        status: 'completed',
        sync: null,
        discovered: [],
        skipped: [],
        newVideos: [],
        message: null,
      }),
    );
    apiMock.listSources.mockReset();
    apiMock.analyzeSource.mockReset();

    apiMock.listSources.mockReturnValue(
      of({
        sources: [],
      }),
    );

    await TestBed.configureTestingModule({
      imports: [SourcesPage],
      providers: [
        {
          provide: LensApiService,
          useValue: apiMock,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SourcesPage);
    component = fixture.componentInstance;

    fixture.detectChanges();
  });

  it('should create the page', () => {
    expect(component).toBeTruthy();
  });

  it('should load sources from the API', () => {
    apiMock.listSources.mockReturnValue(
      of({
        sources: [
          {
            sourceKey: 'youtube:channel-id:test',
            platform: 'youtube',
            sourceType: 'channel',
            externalId: 'UCtest',
            url: 'https://youtube.com/@test',
            handle: '@test',
            status: 'active',
            lastCheckedAt: '2026-08-29T19:00:00.000Z',
            lastSuccessfulSyncAt: '2026-08-29T19:00:00.000Z',
            createdAt: '2026-08-29T18:00:00.000Z',
            updatedAt: '2026-08-29T19:00:00.000Z',
            contentCount: 5,
          },
        ],
      }),
    );

    component['loadSources']();

    expect(apiMock.listSources).toHaveBeenCalledTimes(2);
    expect(component.sources).toEqual([
      {
        sourceKey: 'youtube:channel-id:test',
        name: 'test',
        perspective: 'YouTube source',
        contentCount: 5,
        conceptCount: 0,
        status: 'verified',
      },
    ]);
    expect(component.sourcesLoading).toBe(false);
    expect(component.sourcesError).toBe('');
  });

  it('should handle source loading errors', () => {
    apiMock.listSources.mockReturnValue(throwError(() => new Error('Server unavailable')));

    component['loadSources']();

    expect(component.sourcesLoading).toBe(false);
    expect(component.sourcesError).toBe(
      'Unable to load your sources. Confirm the server is running.',
    );
  });

  it('should open the Add Source flow with clean state', () => {
    component.sourceUrl = 'old-url';
    component.analysisError = 'old-error';
    component.selectedType = 'video';
    component.selectedBackfill = 'all';

    component.openAddSource();

    expect(component.showAddSource).toBe(true);
    expect(component.addSourceStep).toBe('input');
    expect(component.sourceUrl).toBe('');
    expect(component.creatorProfile).toBeNull();
    expect(component.analysisError).toBe('');
    expect(component.selectedType).toBe('channel');
    expect(component.selectedBackfill).toBe('recent');
  });

  it('should close the Add Source flow and reset state', () => {
    component.showAddSource = true;
    component.sourceUrl = 'https://youtube.com/@test';
    component.analysisError = 'error';
    component.addSourceStep = 'profile';

    component.closeAddSource();

    expect(component.showAddSource).toBe(false);
    expect(component.sourceUrl).toBe('');
    expect(component.creatorProfile).toBeNull();
    expect(component.analysisError).toBe('');
    expect(component.addSourceStep).toBe('input');
  });

  it('should not analyze an empty URL', () => {
    component.sourceUrl = '   ';

    component.analyzeSource();

    expect(apiMock.analyzeSource).not.toHaveBeenCalled();
    expect(component.addSourceStep).toBe('input');
  });

  it('should move to analyzing state and call the API', () => {
    component.sourceUrl = 'https://youtube.com/@OpenAI';

    apiMock.analyzeSource.mockReturnValue(
      of({
        status: 'unsupported',
        message: 'Unsupported source',
      }),
    );

    component.analyzeSource();

    expect(component.addSourceStep).toBe('error');
    expect(apiMock.analyzeSource).toHaveBeenCalledWith('https://youtube.com/@OpenAI');
  });

  it('should handle API analysis failures', () => {
    component.sourceUrl = 'https://youtube.com/@OpenAI';

    apiMock.analyzeSource.mockReturnValue(throwError(() => new Error('Network error')));

    component.analyzeSource();

    expect(component.addSourceStep).toBe('error');
    expect(component.analysisError).toBe(
      'LENS did not receive a usable response. Confirm the server is running, then try again.',
    );
  });

  it('should reset to source input when requested', () => {
    component.addSourceStep = 'error';
    component.analysisError = 'Something went wrong';

    component.returnToSourceInput();

    expect(component.addSourceStep).toBe('input');
    expect(component.analysisError).toBe('');
  });

  it('should select the requested source type', () => {
    component.selectType('video');

    expect(component.selectedType).toBe('video');
  });

  it('should select the requested backfill option', () => {
    component.selectBackfill('all');

    expect(component.selectedBackfill).toBe('all');
  });

  it('should not confirm a profile when no profile exists', () => {
    component.creatorProfile = null;
    component.addSourceStep = 'profile';

    component.confirmProfile();

    expect(component.addSourceStep).toBe('profile');
  });

  it('should move from profile to processing after confirmation', () => {
    component.creatorProfile = {
      name: 'OpenAI',
      sourceType: 'channel',
      sourceUrl: 'https://youtube.com/@OpenAI',
      avatarUrl: null,
      selfDescription: 'AI research and deployment',
      education: 'Not provided or independently verified',
      professionalExperience: 'Not provided or independently verified',
      relevantExpertise: 'Not yet verified',
      perspective: 'To be classified by you',
      evidenceStyle: 'To be assessed from source content',
      userPerspective: '',
      userRelevantFor: '',
      userNotes: '',
      identityStatus: 'high-confidence',
    };

    component.addSourceStep = 'profile';

    component.confirmProfile();

    expect(component.addSourceStep).toBe('processing');
  });

  it('should move into profile editing', () => {
    component.creatorProfile = {
      name: 'OpenAI',
      sourceType: 'channel',
      sourceUrl: 'https://youtube.com/@OpenAI',
      avatarUrl: null,
      selfDescription: 'AI research and deployment',
      education: 'Not provided or independently verified',
      professionalExperience: 'Not provided or independently verified',
      relevantExpertise: 'Not yet verified',
      perspective: 'To be classified by you',
      evidenceStyle: 'To be assessed from source content',
      userPerspective: '',
      userRelevantFor: '',
      userNotes: '',
      identityStatus: 'high-confidence',
    };

    component.editProfile();

    expect(component.addSourceStep).toBe('editing');
  });

  it('should return to profile after saving edits', () => {
    component.creatorProfile = {
      name: 'OpenAI',
      sourceType: 'channel',
      sourceUrl: 'https://youtube.com/@OpenAI',
      avatarUrl: null,
      selfDescription: 'AI research and deployment',
      education: 'Not provided or independently verified',
      professionalExperience: 'Not provided or independently verified',
      relevantExpertise: 'Not yet verified',
      perspective: 'To be classified by you',
      evidenceStyle: 'To be assessed from source content',
      userPerspective: '',
      userRelevantFor: '',
      userNotes: '',
      identityStatus: 'high-confidence',
    };

    component.addSourceStep = 'editing';

    component.saveProfileEdits();

    expect(component.addSourceStep).toBe('profile');
  });

  it('should cancel profile editing', () => {
    component.addSourceStep = 'editing';

    component.cancelProfileEdits();

    expect(component.addSourceStep).toBe('profile');
  });

  it('should process a YouTube channel and close the Add Source flow', () => {
    component.sourceUrl = 'https://youtube.com/@OpenAI';
    component.selectedType = 'channel';
    component.showAddSource = true;
    component.addSourceStep = 'processing';

    apiMock.analyzeSource.mockReturnValue(of());

    apiMock.syncYouTubeChannel = vi.fn().mockReturnValue(
      of({
        platform: 'youtube',
        type: 'channel',
        url: 'https://youtube.com/@OpenAI',
        channelId: 'UCXZCJLdBC09xxGZ6gcdrc6A',
        handle: '@OpenAI',
        feedUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCXZCJLdBC09xxGZ6gcdrc6A',
        status: 'completed',
        sync: null,
        discovered: [],
        skipped: [],
        newVideos: [],
        message: null,
      }),
    );

    component.startProcessing();

    expect(apiMock.syncYouTubeChannel).toHaveBeenCalledWith('https://youtube.com/@OpenAI');

    expect(component.showAddSource).toBe(false);
    expect(component.addSourceStep).toBe('input');
  });

  it('loads owned content when a source is selected', () => {
    const source = {
      sourceKey: 'youtube:channel-id:uc-test',
      name: 'test',
      perspective: 'YouTube source',
      contentCount: 2,
      conceptCount: 0,
      status: 'verified' as const,
    };

    component.sources = [source];

    apiMock.listSourceVideos.mockReturnValue(
      of({
        videos: [
          {
            videoId: 'VIDEO-1',
            title: 'Owned video #leadership #focus',
            url: 'https://youtube.com/watch?v=VIDEO-1',
            publishedAt: '2026-08-30T00:00:00Z',
            sourceStatements: [
              {
                text: 'Saved transcript statement.',
                context: 'Transcript language: en',
                startSeconds: 12,
                endSeconds: 18,
              },
            ],
          },
        ],
      }),
    );

    component.selectSource(source);

    expect(apiMock.listSourceVideos).toHaveBeenCalledWith('youtube:channel-id:uc-test');
    expect(component.selectedSource).toBe(source);
    expect(component.sourceVideos).toHaveLength(1);
    expect(component.sourceVideos[0]?.videoId).toBe('VIDEO-1');
    expect(component.sourceVideosLoading).toBe(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Saved transcript statement.');
    expect(fixture.nativeElement.querySelector('.source-video-title').textContent.trim()).toBe(
      'Owned video',
    );
    expect(fixture.nativeElement.querySelectorAll('.video-categories span')).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('.video-thumbnail img').src).toContain(
      '/vi/VIDEO-1/mqdefault.jpg',
    );
    expect(fixture.nativeElement.textContent).toContain('Knowledge');
    expect(fixture.nativeElement.textContent).not.toContain('My Notes');
    expect(fixture.nativeElement.textContent).not.toContain('Version History');
    component.toggleTranscript('VIDEO-1');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Transcript');
    expect(fixture.nativeElement.textContent).toContain('Saved transcript statement.');
    expect(fixture.nativeElement.textContent).toContain('0:12–0:18');
    component.toggleTranscript('VIDEO-1');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Saved transcript statement.');
  });

  it('fetches latest content for a saved source and refreshes its inventory', () => {
    const source = {
      sourceKey: 'youtube:channel-id:uc-test',
      name: 'test',
      perspective: 'YouTube source',
      contentCount: 1,
      conceptCount: 0,
      status: 'verified' as const,
    };
    const latestVideo = {
      videoId: 'LATEST',
      title: 'Latest video',
      url: 'https://youtube.com/watch?v=LATEST',
      publishedAt: '2026-11-24T00:00:00.000Z',
      discoveredAt: '2026-11-24T01:00:00.000Z',
      status: 'discovered' as const,
      currentVersionId: null,
      processedAt: null,
      claimCount: 0,
      sourceStatements: [],
    };
    const storedVideo = {
      videoId: 'STORED',
      title: 'Stored video',
      url: 'https://youtube.com/watch?v=STORED',
      publishedAt: '2026-11-20T00:00:00.000Z',
      discoveredAt: '2026-11-20T01:00:00.000Z',
      status: 'processed' as const,
      currentVersionId: 1,
      processedAt: '2026-11-20T02:00:00.000Z',
      claimCount: 1,
      sourceStatements: [
        {
          text: 'Stored statement.',
          context: 'Transcript language: en',
          startSeconds: null,
          endSeconds: null,
        },
      ],
    };
    component.selectedSource = source;
    component.sources = [source];
    apiMock.syncSource.mockReturnValue(
      of({
        status: 'completed',
        newVideos: [latestVideo],
      }),
    );
    apiMock.listSourceVideos.mockReturnValue(of({ videos: [latestVideo, storedVideo] }));

    component.fetchLatestContent(source);

    expect(apiMock.syncSource).toHaveBeenCalledWith(source.sourceKey);
    expect(apiMock.listSourceVideos).toHaveBeenCalledWith(source.sourceKey);
    expect(component.sourceVideos).toEqual([latestVideo, storedVideo]);
    expect(source.contentCount).toBe(2);
    expect(component.fetchLatestMessage).toBe('1 new item added. No duplicates were created.');
    expect(component.fetchingLatestSourceKey).toBeNull();
  });

  it('keeps existing content when fetching latest fails', () => {
    const source = {
      sourceKey: 'youtube:channel-id:uc-test',
      name: 'test',
      perspective: 'YouTube source',
      contentCount: 1,
      conceptCount: 0,
      status: 'verified' as const,
    };
    const existingVideos = [
      {
        videoId: 'STORED',
        title: 'Stored video',
        url: 'https://youtube.com/watch?v=STORED',
        publishedAt: null,
        discoveredAt: null,
        status: 'processed' as const,
        currentVersionId: 1,
        processedAt: null,
        claimCount: 1,
        sourceStatements: [
          {
            text: 'Existing statement.',
            context: 'Transcript language: und',
            startSeconds: null,
            endSeconds: null,
          },
        ],
      },
    ];
    component.selectedSource = source;
    component.sourceVideos = existingVideos;
    apiMock.syncSource.mockReturnValue(
      throwError(() => ({
        error: { message: 'YouTube could not be reached.' },
      })),
    );

    component.fetchLatestContent(source);

    expect(component.sourceVideos).toBe(existingVideos);
    expect(component.fetchLatestError).toBe('YouTube could not be reached.');
    expect(component.fetchingLatestSourceKey).toBeNull();
    expect(apiMock.listSourceVideos).not.toHaveBeenCalled();
  });

  it('groups YouTube videos into newest-first weekly pages with source date bounds', () => {
    component.sourceVideos = [
      {
        videoId: 'LATEST',
        title: 'Latest',
        url: 'https://youtube.com/watch?v=LATEST',
        publishedAt: '2026-11-24T12:00:00.000Z',
        discoveredAt: null,
        status: 'discovered',
        currentVersionId: null,
        processedAt: null,
        claimCount: 0,
        sourceStatements: [],
      },
      {
        videoId: 'MIDDLE',
        title: 'Middle',
        url: 'https://youtube.com/watch?v=MIDDLE',
        publishedAt: '2026-11-18T12:00:00.000Z',
        discoveredAt: null,
        status: 'discovered',
        currentVersionId: null,
        processedAt: null,
        claimCount: 0,
        sourceStatements: [],
      },
      {
        videoId: 'FIRST',
        title: 'First',
        url: 'https://youtube.com/watch?v=FIRST',
        publishedAt: '2026-11-10T12:00:00.000Z',
        discoveredAt: null,
        status: 'discovered',
        currentVersionId: null,
        processedAt: null,
        claimCount: 0,
        sourceStatements: [],
      },
    ];

    expect(component.videoWeeks).toHaveLength(3);
    expect(component.currentVideoWeek?.videos.map((video) => video.videoId)).toEqual(['LATEST']);
    expect(component.firstVideoDate).toBe('2026-11-10T12:00:00.000Z');
    expect(component.latestVideoDate).toBe('2026-11-24T12:00:00.000Z');

    component.showOlderVideoWeek();

    expect(component.currentVideoWeek?.videos.map((video) => video.videoId)).toEqual(['MIDDLE']);
    expect(apiMock.syncSource).not.toHaveBeenCalled();
  });

  it('loads a missing older week from YouTube and shows it when it arrives', () => {
    const source = {
      sourceKey: 'youtube:channel-id:uc-test',
      name: 'test',
      perspective: 'YouTube source',
      contentCount: 1,
      conceptCount: 0,
      status: 'verified' as const,
    };
    const latest: SourceVideo = {
      videoId: 'LATEST',
      title: 'Latest',
      url: 'https://youtube.com/watch?v=LATEST',
      publishedAt: '2026-11-24T12:00:00.000Z',
      discoveredAt: null,
      status: 'discovered',
      currentVersionId: null,
      processedAt: null,
      claimCount: 0,
      sourceStatements: [],
    };
    const older: SourceVideo = {
      ...latest,
      videoId: 'OLDER',
      title: 'Older',
      url: 'https://youtube.com/watch?v=OLDER',
      publishedAt: '2026-11-10T12:00:00.000Z',
    };
    component.selectedSource = source;
    component.sourceVideos = [latest];
    apiMock.syncSource.mockReturnValue(of({ status: 'completed', newVideos: [] }));
    apiMock.listSourceVideos
      .mockReturnValueOnce(of({ videos: [latest] }))
      .mockReturnValueOnce(of({ videos: [latest, older] }));

    component.showOlderVideoWeek();

    expect(apiMock.syncSource).toHaveBeenCalledTimes(2);
    expect(component.currentVideoWeek?.videos.map((video) => video.videoId)).toEqual(['OLDER']);
    expect(component.loadingOlderVideoWeek).toBe(false);
    expect(component.videoWeekError).toBe('');
  });

  it('stops loading an older YouTube week after three failed attempts', () => {
    const source = {
      sourceKey: 'youtube:channel-id:uc-test',
      name: 'test',
      perspective: 'YouTube source',
      contentCount: 1,
      conceptCount: 0,
      status: 'verified' as const,
    };
    component.selectedSource = source;
    component.sourceVideos = [
      {
        videoId: 'LATEST',
        title: 'Latest',
        url: 'https://youtube.com/watch?v=LATEST',
        publishedAt: '2026-11-24T12:00:00.000Z',
        discoveredAt: null,
        status: 'discovered',
        currentVersionId: null,
        processedAt: null,
        claimCount: 0,
        sourceStatements: [],
      },
    ];
    apiMock.syncSource.mockReturnValue(throwError(() => new Error('offline')));

    component.showOlderVideoWeek();

    expect(apiMock.syncSource).toHaveBeenCalledTimes(3);
    expect(component.loadingOlderVideoWeek).toBe(false);
    expect(component.olderVideoWeeksExhausted).toBe(true);
    expect(component.videoWeekError).toContain('after 3 attempts');
  });

  it('moves discovered source video to review', () => {
    const source = {
      name: 'test',
      perspective: 'YouTube source',
      status: 'verified' as const,
      contentCount: 1,
      conceptCount: 0,
      sourceKey: 'youtube:channel-id:test',
    };

    const video = {
      videoId: 'VIDEO-123',
      title: 'Test video',
      url: 'https://youtube.com/watch?v=VIDEO-123',
      publishedAt: '2026-08-30T00:00:00.000Z',
      discoveredAt: '2026-08-30T01:00:00.000Z',
      status: 'discovered' as const,
      currentVersionId: null,
      processedAt: null,
      claimCount: 0,
      sourceStatements: [],
    };

    component.sources = [source];
    component.sourceVideos = [video];
    component.selectedSource = source;

    apiMock.updateSourceVideoStatus.mockReturnValue(
      of({
        sourceKey: source.sourceKey,
        videoId: video.videoId,
        status: 'needs-review',
      }),
    );

    component.updateSourceVideoStatus(video, 'needs-review');

    expect(apiMock.updateSourceVideoStatus).toHaveBeenCalledWith(
      source.sourceKey,
      video.videoId,
      'needs-review',
    );
  });

  it('processes pasted transcript and records the saved result', () => {
    const source = {
      name: 'test',
      perspective: 'YouTube source',
      status: 'verified' as const,
      contentCount: 1,
      conceptCount: 0,
      sourceKey: 'youtube:channel-id:test',
    };
    const video: SourceVideo = {
      videoId: 'VIDEO-123',
      title: 'Test video',
      url: 'https://youtube.com/watch?v=VIDEO-123',
      publishedAt: null,
      discoveredAt: null,
      status: 'needs-review' as const,
      currentVersionId: null,
      processedAt: null,
      claimCount: 0,
      sourceStatements: [],
    };
    component.selectedSource = source;
    component.sourceVideos = [video];
    component.openVideoProcessing(video);
    component.processingTranscript = 'First source statement.\n\nSecond source statement.';
    apiMock.processSourceVideo.mockReturnValue(
      of({
        sourceKey: source.sourceKey,
        videoId: video.videoId,
        status: 'processed',
        attemptId: 1,
        versionId: 1,
        claimCount: 2,
      }),
    );

    component.processSourceVideo(video);

    expect(apiMock.processSourceVideo).toHaveBeenCalledWith(
      source.sourceKey,
      video.videoId,
      'First source statement.\n\nSecond source statement.',
    );
    expect(video.status).toBe('processed');
    expect(video.sourceStatements.map((statement) => statement.text)).toEqual([
      'First source statement.',
      'Second source statement.',
    ]);
    expect(component.processingToast).toEqual({
      videoId: video.videoId,
      message: 'Transcript saved · 2 source statements · Version 1',
    });
    expect(component.processingVideoId).toBeNull();
  });

  it('modifies from the saved text and deletes a confirmed transcript', () => {
    const source = {
      name: 'test',
      perspective: 'YouTube source',
      status: 'verified' as const,
      contentCount: 1,
      conceptCount: 0,
      sourceKey: 'youtube:channel-id:test',
    };
    const video: SourceVideo = {
      videoId: 'VIDEO-123',
      title: 'Test video',
      url: 'https://youtube.com/watch?v=VIDEO-123',
      publishedAt: null,
      discoveredAt: null,
      status: 'processed',
      currentVersionId: 4,
      processedAt: '2026-11-24T00:00:00.000Z',
      claimCount: 2,
      sourceStatements: [
        { text: 'First saved statement.', context: '', startSeconds: null, endSeconds: null },
        { text: 'Second saved statement.', context: '', startSeconds: null, endSeconds: null },
      ],
    };
    component.selectedSource = source;
    component.sourceVideos = [video];
    component.processingToast = { videoId: video.videoId, message: 'Saved.' };
    component.expandedTranscriptVideoIds.add(video.videoId);

    component.openVideoProcessing(video);

    expect(component.processingTranscript).toBe(
      'First saved statement.\n\nSecond saved statement.',
    );

    component.openDeleteTranscriptConfirmation(video);
    apiMock.deleteSourceVideoTranscript.mockReturnValue(
      of({
        status: 'deleted',
        sourceKey: source.sourceKey,
        videoId: video.videoId,
        deletedProcessingAttempts: 2,
        deletedContentVersions: 1,
      }),
    );

    component.confirmDeleteTranscript();

    expect(apiMock.deleteSourceVideoTranscript).toHaveBeenCalledWith(
      source.sourceKey,
      video.videoId,
    );
    expect(video.status).toBe('needs-review');
    expect(video.currentVersionId).toBeNull();
    expect(video.sourceStatements).toEqual([]);
    expect(component.processingToast).toBeNull();
    expect(component.expandedTranscriptVideoIds.has(video.videoId)).toBe(false);
    expect(component.videoPendingTranscriptDeletion).toBeNull();
    expect(component.processingVideoId).toBeNull();
  });

  it('opens and cancels source deletion without deleting data', () => {
    const source = {
      name: 'test',
      perspective: 'YouTube source',
      status: 'verified' as const,
      contentCount: 1,
      conceptCount: 0,
      sourceKey: 'youtube:channel-id:test',
    };

    component.openDeleteSourceConfirmation(source);

    expect(component.showDeleteSource).toBe(true);
    expect(component.sourcePendingDeletion).toBe(source);

    component.cancelDeleteSource();

    expect(component.showDeleteSource).toBe(false);
    expect(component.sourcePendingDeletion).toBeNull();
    expect(apiMock.deleteSource).not.toHaveBeenCalled();
  });

  it('deletes the confirmed source and clears all selected-source state', () => {
    const source = {
      name: 'test',
      perspective: 'YouTube source',
      status: 'verified' as const,
      contentCount: 1,
      conceptCount: 0,
      sourceKey: 'youtube:channel-id:test',
    };
    const retainedSource = {
      name: 'keep',
      perspective: 'YouTube source',
      status: 'verified' as const,
      contentCount: 0,
      conceptCount: 0,
      sourceKey: 'youtube:channel-id:keep',
    };
    component.sources = [source, retainedSource];
    component.selectedSource = source;
    component.sourceVideos = [
      {
        videoId: 'VIDEO-123',
        title: 'Test video',
        url: 'https://youtube.com/watch?v=VIDEO-123',
        publishedAt: null,
        discoveredAt: null,
        status: 'processed',
        currentVersionId: 1,
        processedAt: '2026-11-24T00:00:00.000Z',
        claimCount: 1,
        sourceStatements: [
          {
            text: 'Saved statement.',
            context: 'Transcript language: und',
            startSeconds: null,
            endSeconds: null,
          },
        ],
      },
    ];
    component.processingToast = { videoId: 'VIDEO-123', message: 'Saved.' };
    component.openDeleteSourceConfirmation(source);
    apiMock.deleteSource.mockReturnValue(
      of({
        status: 'deleted',
        sourceKey: source.sourceKey,
        deletedVideos: 1,
        deletedProcessingAttempts: 1,
        deletedContentVersions: 1,
      }),
    );

    component.confirmDeleteSource();

    expect(apiMock.deleteSource).toHaveBeenCalledWith(source.sourceKey);
    expect(component.sources).toEqual([retainedSource]);
    expect(component.selectedSource).toBeNull();
    expect(component.sourceVideos).toEqual([]);
    expect(component.processingToast).toBeNull();
    expect(component.showDeleteSource).toBe(false);
    expect(component.sourcePendingDeletion).toBeNull();
  });

  it('keeps the source and confirmation open when deletion fails', () => {
    const source = {
      name: 'test',
      perspective: 'YouTube source',
      status: 'verified' as const,
      contentCount: 1,
      conceptCount: 0,
      sourceKey: 'youtube:channel-id:test',
    };
    component.sources = [source];
    component.selectedSource = source;
    component.openDeleteSourceConfirmation(source);
    apiMock.deleteSource.mockReturnValue(
      throwError(() => ({
        error: { message: 'Source deletion failed.' },
      })),
    );

    component.confirmDeleteSource();

    expect(component.sources).toEqual([source]);
    expect(component.selectedSource).toBe(source);
    expect(component.showDeleteSource).toBe(true);
    expect(component.deleteSourceError).toBe('Source deletion failed.');
    expect(component.deletingSource).toBe(false);
  });
});
