import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { describe, beforeEach, expect, it, vi } from 'vitest';

import { SourcesPage } from './sources-page';
import { LensApiService } from '../../../../core/services/lens-api.service';

describe('SourcesPage', () => {
  let fixture: ComponentFixture<SourcesPage>;
  let component: SourcesPage;

  const apiMock = {
    listSources: vi.fn(),
    analyzeSource: vi.fn(),
  };

  beforeEach(async () => {
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
          },
        ],
      }),
    );

    component['loadSources']();

    expect(apiMock.listSources).toHaveBeenCalledTimes(2);
    expect(component.sources).toEqual([
      {
        name: 'test',
        perspective: 'YouTube source',
        contentCount: 0,
        conceptCount: 0,
        status: 'verified',
      },
    ]);
    expect(component.sourcesLoading).toBe(false);
    expect(component.sourcesError).toBe('');
  });

  it('should handle source loading errors', () => {
    apiMock.listSources.mockReturnValue(
      throwError(() => new Error('Server unavailable')),
    );

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
    expect(apiMock.analyzeSource).toHaveBeenCalledWith(
      'https://youtube.com/@OpenAI',
    );
  });

  it('should handle API analysis failures', () => {
    component.sourceUrl = 'https://youtube.com/@OpenAI';

    apiMock.analyzeSource.mockReturnValue(
      throwError(() => new Error('Network error')),
    );

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
});