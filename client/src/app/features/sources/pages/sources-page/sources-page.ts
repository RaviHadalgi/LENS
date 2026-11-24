import { ChangeDetectorRef, Component, ElementRef, inject, OnInit, ViewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { map, switchMap, timeout } from 'rxjs';

import { LensModal } from '../../../../shared/components/lens-modal/lens-modal';
import { LensCard } from '../../../../shared/components/lens-card/lens-card';
import { LensBadge } from '../../../../shared/components/lens-badge/lens-badge';
import { LensFormField } from '../../../../shared/components/lens-form-field/lens-form-field';
import { LensButton } from '../../../../shared/components/lens-button/lens-button';
import { LensApiService } from '../../../../core/services/lens-api.service';

import type {
  SourceType,
  AnalyzeSourceResponse,
  SourceStatement,
  SourceVideo,
} from '../../../../core/services/lens-api.service';

type AddSourceStep = 'input' | 'analyzing' | 'error' | 'profile' | 'editing' | 'processing';

type IdentityStatus = 'high-confidence' | 'needs-review';

interface Source {
  sourceKey: string;
  name: string;
  perspective: string;
  contentCount: number;
  conceptCount: number;
  status: 'verified' | 'review';
}

interface CreatorProfile {
  name: string;
  sourceType: SourceType;
  sourceUrl: string;
  avatarUrl: string | null;

  selfDescription: string;
  education: string;
  professionalExperience: string;

  relevantExpertise: string;
  perspective: string;
  evidenceStyle: string;

  userPerspective: string;
  userRelevantFor: string;
  userNotes: string;

  identityStatus: IdentityStatus;
}

@Component({
  selector: 'app-sources-page',
  imports: [FormsModule, LensModal, LensButton, LensFormField, LensBadge, LensCard, DatePipe],
  templateUrl: './sources-page.html',
  styleUrl: './sources-page.css',
})
export class SourcesPage implements OnInit {
  @ViewChild('sourceCarousel')
  private sourceCarousel?: ElementRef<HTMLElement>;

  showAddSource = false;

  selectedType: SourceType = 'channel';

  sourceUrl = '';

  addSourceStep: AddSourceStep = 'input';

  analysisError = '';
  avatarImageFailed = false;

  private readonly api = inject(LensApiService);
  private readonly changeDetector = inject(ChangeDetectorRef);
  readonly updatingVideoIds = new Set<string>();
  processingVideoId: string | null = null;
  processingTranscript = '';
  processingError = '';
  readonly processingSummaries = new Map<string, string>();
  readonly expandedTranscriptVideoIds = new Set<string>();
  videoPendingTranscriptDeletion: SourceVideo | null = null;
  deletingTranscript = false;
  deleteTranscriptError = '';

  selectedBackfill: 'recent' | 'playlists' | 'all' | 'selected' = 'recent';

  creatorProfile: CreatorProfile | null = null;

  sources: Source[] = [];
  sourcesLoading = false;
  sourcesError = '';

  selectedSource: Source | null = null;
  showDeleteSource = false;
  sourcePendingDeletion: Source | null = null;
  deletingSource = false;
  deleteSourceError = '';
  fetchingLatestSourceKey: string | null = null;
  fetchLatestMessage = '';
  fetchLatestError = '';

  sourceVideos: SourceVideo[] = [];
  sourceVideosLoading = false;
  sourceVideosError = '';

  ngOnInit(): void {
    this.loadSources();
  }

  scrollSources(direction: 'previous' | 'next'): void {
    const carousel = this.sourceCarousel?.nativeElement;

    if (!carousel) {
      return;
    }

    const amount = Math.max(carousel.clientWidth * 0.82, 280);

    carousel.scrollBy({
      left: direction === 'next' ? amount : -amount,
      behavior: 'smooth',
    });
  }

  updateSourceVideoStatus(video: SourceVideo, status: 'needs-review' | 'skipped'): void {
    const source = this.selectedSource;

    if (!source || this.updatingVideoIds.has(video.videoId)) {
      return;
    }

    this.updatingVideoIds.add(video.videoId);
    this.changeDetector.detectChanges();

    this.api.updateSourceVideoStatus(source.sourceKey, video.videoId, status).subscribe({
      next: () => {
        video.status = status;
        this.updatingVideoIds.delete(video.videoId);
        this.changeDetector.detectChanges();
      },

      error: (error) => {
        console.error('Failed to update source video status:', error);
        this.updatingVideoIds.delete(video.videoId);
        this.changeDetector.detectChanges();
      },
    });
  }

  openVideoProcessing(video: SourceVideo): void {
    this.processingVideoId = video.videoId;
    this.processingTranscript = video.sourceStatements.map((statement) => statement.text).join('\n\n');
    this.processingError = '';
  }

  cancelVideoProcessing(): void {
    this.processingVideoId = null;
    this.processingTranscript = '';
    this.processingError = '';
  }

  processSourceVideo(video: SourceVideo): void {
    const source = this.selectedSource;

    const transcript = this.processingTranscript.trim();

    if (!source || !transcript || this.updatingVideoIds.has(video.videoId)) {
      this.processingError = transcript ? '' : 'Paste the available transcript or source text first.';
      return;
    }

    this.updatingVideoIds.add(video.videoId);
    this.changeDetector.detectChanges();

    this.processingError = '';
    this.api.processSourceVideo(source.sourceKey, video.videoId, transcript).subscribe({
      next: (result) => {
        video.status = 'processed';
        video.currentVersionId = result.versionId;
        video.claimCount = result.claimCount;
        video.sourceStatements = this.buildSourceStatements(transcript);
        video.processedAt = new Date().toISOString();
        this.processingSummaries.set(
          video.videoId,
          result.status === 'unchanged'
            ? 'No content change found. The existing version was kept.'
            : `${result.claimCount} source ${result.claimCount === 1 ? 'statement' : 'statements'} saved as version ${result.versionId}.`,
        );
        this.updatingVideoIds.delete(video.videoId);
        this.processingVideoId = null;
        this.processingTranscript = '';
        this.changeDetector.detectChanges();
      },

      error: (error) => {
        console.error('Failed to process source video:', error);
        video.status = error?.status === 422 ? 'failed' : video.status;
        this.processingError = error?.error?.message ?? 'LENS could not process this transcript.';
        this.updatingVideoIds.delete(video.videoId);
        this.changeDetector.detectChanges();
      },
    });
  }

  formatStatementTimestamp(statement: SourceStatement): string | null {
    if (statement.startSeconds === null) {
      return null;
    }

    const start = this.formatSeconds(statement.startSeconds);

    if (statement.endSeconds === null) {
      return start;
    }

    return `${start}–${this.formatSeconds(statement.endSeconds)}`;
  }

  formatStatementContext(statement: SourceStatement): string | null {
    const languagePrefix = 'Transcript language:';

    if (!statement.context.startsWith(languagePrefix)) {
      return statement.context || null;
    }

    const language = statement.context.slice(languagePrefix.length).trim();
    return language && language !== 'und' ? `Language: ${language.toUpperCase()}` : null;
  }

  toggleTranscript(videoId: string): void {
    if (this.expandedTranscriptVideoIds.has(videoId)) {
      this.expandedTranscriptVideoIds.delete(videoId);
    } else {
      this.expandedTranscriptVideoIds.add(videoId);
    }

    this.changeDetector.detectChanges();
  }

  isTranscriptExpanded(videoId: string): boolean {
    return this.expandedTranscriptVideoIds.has(videoId);
  }

  openDeleteTranscriptConfirmation(video: SourceVideo): void {
    this.videoPendingTranscriptDeletion = video;
    this.deleteTranscriptError = '';
  }

  cancelDeleteTranscript(): void {
    if (this.deletingTranscript) {
      return;
    }

    this.videoPendingTranscriptDeletion = null;
    this.deleteTranscriptError = '';
  }

  confirmDeleteTranscript(): void {
    const source = this.selectedSource;
    const video = this.videoPendingTranscriptDeletion;

    if (!source || !video || this.deletingTranscript) {
      return;
    }

    this.deletingTranscript = true;
    this.deleteTranscriptError = '';

    this.api.deleteSourceVideoTranscript(source.sourceKey, video.videoId).subscribe({
      next: () => {
        video.status = 'needs-review';
        video.currentVersionId = null;
        video.processedAt = null;
        video.claimCount = 0;
        video.sourceStatements = [];
        this.processingSummaries.delete(video.videoId);
        this.expandedTranscriptVideoIds.delete(video.videoId);

        if (this.processingVideoId === video.videoId) {
          this.cancelVideoProcessing();
        }

        this.deletingTranscript = false;
        this.videoPendingTranscriptDeletion = null;
        this.changeDetector.detectChanges();
      },

      error: (error) => {
        console.error('Failed to delete saved transcript:', error);
        this.deletingTranscript = false;
        this.deleteTranscriptError =
          error?.error?.message ?? 'LENS could not delete this transcript. Please try again.';
        this.changeDetector.detectChanges();
      },
    });
  }

  private loadSources(): void {
    this.sourcesLoading = true;
    this.sourcesError = '';

    this.api.listSources().subscribe({
      next: (result) => {
        this.sources = result.sources.map((source) => ({
          sourceKey: source.sourceKey,
          name: source.handle?.replace(/^@/, '') || source.externalId,
          perspective: 'YouTube source',
          contentCount: source.contentCount,
          conceptCount: 0,
          status: source.status === 'active' ? 'verified' : 'review',
        }));

        this.sourcesLoading = false;
        this.changeDetector.detectChanges();
      },

      error: (error) => {
        console.error('Failed to load sources:', error);

        this.sourcesLoading = false;
        this.sourcesError = 'Unable to load your sources. Confirm the server is running.';

        this.changeDetector.detectChanges();
      },
    });
  }

  get modalTitle(): string {
    switch (this.addSourceStep) {
      case 'input':
        return 'Add a source';

      case 'analyzing':
        return 'Analyzing source';

      case 'error':
        return 'Unable to analyze source';

      case 'profile':
        return 'Review creator profile';

      case 'editing':
        return 'Edit creator profile';

      case 'processing':
        return 'Choose what to process';

      default:
        return 'LENS';
    }
  }

  selectSource(source: Source): void {
    this.selectedSource = source;
    this.sourceVideos = [];
    this.sourceVideosLoading = true;
    this.sourceVideosError = '';
    this.fetchLatestMessage = '';
    this.fetchLatestError = '';
    this.expandedTranscriptVideoIds.clear();
    this.cancelVideoProcessing();
    this.cancelDeleteTranscript();

    this.api
      .listSourceVideos(source.sourceKey)
      .pipe(timeout(10_000))
      .subscribe({
        next: (result) => {
          if (this.selectedSource?.sourceKey !== source.sourceKey) {
            return;
          }

          this.sourceVideos = result.videos;
          this.sourceVideosLoading = false;
          this.changeDetector.detectChanges();
        },

        error: (error) => {
          console.error('Failed to load source content:', error);

          if (this.selectedSource?.sourceKey !== source.sourceKey) {
            return;
          }

          this.sourceVideosLoading = false;
          this.sourceVideosError = 'Unable to load this source’s content.';

          this.changeDetector.detectChanges();
        },
      });
  }

  fetchLatestContent(source: Source): void {
    if (this.fetchingLatestSourceKey) {
      return;
    }

    this.fetchingLatestSourceKey = source.sourceKey;
    this.fetchLatestMessage = '';
    this.fetchLatestError = '';

    this.api
      .syncSource(source.sourceKey)
      .pipe(
        switchMap((sync) =>
          this.api.listSourceVideos(source.sourceKey).pipe(
            map((inventory) => ({ sync, inventory })),
          ),
        ),
      )
      .subscribe({
        next: ({ sync, inventory }) => {
          source.contentCount = inventory.videos.length;

          if (this.selectedSource?.sourceKey === source.sourceKey) {
            this.sourceVideos = inventory.videos;

            const newCount = sync.newVideos.length;
            this.fetchLatestMessage = newCount
              ? `${newCount} new ${newCount === 1 ? 'item' : 'items'} added. No duplicates were created.`
              : 'You already have the latest available content. No duplicates were created.';
          }
          this.fetchingLatestSourceKey = null;
          this.changeDetector.detectChanges();
        },

        error: (error) => {
          console.error('Failed to fetch latest source content:', error);
          this.fetchingLatestSourceKey = null;
          if (this.selectedSource?.sourceKey === source.sourceKey) {
            this.fetchLatestError =
              error?.error?.message ?? 'LENS could not fetch the latest content. Please try again.';
          }
          this.changeDetector.detectChanges();
        },
      });
  }

  openDeleteSourceConfirmation(source: Source): void {
    this.sourcePendingDeletion = source;
    this.deleteSourceError = '';
    this.showDeleteSource = true;
  }

  cancelDeleteSource(): void {
    if (this.deletingSource) {
      return;
    }

    this.showDeleteSource = false;
    this.sourcePendingDeletion = null;
    this.deleteSourceError = '';
  }

  confirmDeleteSource(): void {
    const source = this.sourcePendingDeletion;

    if (!source || this.deletingSource) {
      return;
    }

    this.deletingSource = true;
    this.deleteSourceError = '';

    this.api.deleteSource(source.sourceKey).subscribe({
      next: () => {
        this.sources = this.sources.filter((item) => item.sourceKey !== source.sourceKey);

        if (this.selectedSource?.sourceKey === source.sourceKey) {
          this.selectedSource = null;
          this.sourceVideos = [];
          this.sourceVideosError = '';
          this.sourceVideosLoading = false;
          this.cancelVideoProcessing();
          this.processingSummaries.clear();
          this.expandedTranscriptVideoIds.clear();
          this.cancelDeleteTranscript();
        }

        this.deletingSource = false;
        this.showDeleteSource = false;
        this.sourcePendingDeletion = null;
        this.changeDetector.detectChanges();
      },

      error: (error) => {
        console.error('Failed to delete source:', error);
        this.deletingSource = false;
        this.deleteSourceError =
          error?.error?.message ?? 'LENS could not remove this source. Please try again.';
        this.changeDetector.detectChanges();
      },
    });
  }

  get modalDescription(): string {
    switch (this.addSourceStep) {
      case 'input':
        return 'Start with a channel, playlist or individual video.';

      case 'analyzing':
        return 'LENS is identifying the creator and preparing a source profile.';

      case 'error':
        return 'The source was not analyzed. Check the message below and try again.';

      case 'profile':
        return 'LENS created a draft. Review it before adding the source.';

      case 'editing':
        return 'Correct anything LENS got wrong. Your classification remains separate.';

      case 'processing':
        return 'Select how much historical content LENS should analyze.';

      default:
        return '';
    }
  }

  openAddSource(): void {
    this.showAddSource = true;
    this.addSourceStep = 'input';
    this.sourceUrl = '';
    this.creatorProfile = null;
    this.analysisError = '';
    this.selectedType = 'channel';
    this.selectedBackfill = 'recent';
  }

  closeAddSource(): void {
    this.showAddSource = false;
    this.sourceUrl = '';
    this.creatorProfile = null;
    this.analysisError = '';
    this.addSourceStep = 'input';
  }

  selectType(type: SourceType): void {
    this.selectedType = type;
  }

  selectBackfill(option: 'recent' | 'playlists' | 'all' | 'selected'): void {
    this.selectedBackfill = option;
  }

  analyzeSource(): void {
    const url = this.sourceUrl.trim();

    if (!url) {
      return;
    }

    this.addSourceStep = 'analyzing';
    this.analysisError = '';

    this.api
      .analyzeSource(url)
      .pipe(timeout(10_000))
      .subscribe({
        next: (result) => {
          this.handleSourceAnalysis(result);
        },

        error: (error) => {
          console.error('Source analysis failed:', error);

          this.analysisError =
            'LENS did not receive a usable response. Confirm the server is running, then try again.';

          this.addSourceStep = 'error';
          this.changeDetector.detectChanges();
        },
      });
  }

  private handleSourceAnalysis(result: AnalyzeSourceResponse): void {
    if (result.status !== 'detected') {
      console.warn('Source could not be detected:', result);

      this.analysisError =
        result.status === 'unsupported'
          ? 'This source is not supported yet. Use a YouTube channel, playlist, or video URL.'
          : 'Enter a complete, valid source URL and try again.';

      this.addSourceStep = 'error';
      this.changeDetector.detectChanges();

      return;
    }

    if (result.type === 'channel' || result.type === 'playlist' || result.type === 'video') {
      this.selectedType = result.type;
    }

    this.creatorProfile = this.buildDraftCreatorProfile(result);
    this.sourceUrl = result.url;
    this.addSourceStep = 'profile';

    this.changeDetector.detectChanges();
  }

  returnToSourceInput(): void {
    this.analysisError = '';
    this.addSourceStep = 'input';
  }

  confirmProfile(): void {
    if (!this.creatorProfile) {
      return;
    }

    this.addSourceStep = 'processing';
  }

  editProfile(): void {
    if (!this.creatorProfile) {
      return;
    }

    this.addSourceStep = 'editing';
  }

  saveProfileEdits(): void {
    if (!this.creatorProfile) {
      return;
    }

    console.log('Profile saved:', this.creatorProfile);
    this.addSourceStep = 'profile';
  }

  cancelProfileEdits(): void {
    this.addSourceStep = 'profile';
  }

  startProcessing(): void {
    if (!this.sourceUrl.trim()) {
      return;
    }

    if (this.selectedType !== 'channel') {
      console.warn('Processing is not implemented yet for:', this.selectedType);

      return;
    }

    this.addSourceStep = 'processing';

    this.api.syncYouTubeChannel(this.sourceUrl.trim()).subscribe({
      next: (result) => {
        if (result.status === 'failed') {
          this.analysisError = result.message ?? 'LENS could not process this YouTube channel.';

          this.addSourceStep = 'error';
          this.changeDetector.detectChanges();

          return;
        }

        this.loadSources();
        this.closeAddSource();
        this.changeDetector.detectChanges();
      },

      error: (error) => {
        console.error('YouTube processing failed:', error);

        this.analysisError =
          'LENS could not process this YouTube channel. Confirm the server is running, then try again.';

        this.addSourceStep = 'error';
        this.changeDetector.detectChanges();
      },
    });
  }

  private buildDraftCreatorProfile(result: AnalyzeSourceResponse): CreatorProfile {
    const identity = result.creatorIdentity;
    const channel = result.channel;

    return {
      name: channel?.name ?? identity?.displayName ?? 'Creator identity not yet resolved',

      sourceType: this.selectedType,

      sourceUrl: result.url,

      avatarUrl: channel?.thumbnailUrl ?? null,

      selfDescription:
        channel?.description ??
        identity?.basis ??
        'No creator information was returned by the source.',

      relevantExpertise: 'Not yet verified',

      education: 'Not provided or independently verified',

      professionalExperience: 'Not provided or independently verified',

      perspective: 'To be classified by you',

      evidenceStyle: 'To be assessed from source content',

      userPerspective: '',

      userRelevantFor: '',

      userNotes: '',

      identityStatus: identity?.status ?? 'needs-review',
    };
  }

  private buildSourceStatements(transcript: string): SourceStatement[] {
    return transcript
      .split(/\n\s*\n/)
      .map(text => text.trim())
      .filter(Boolean)
      .map(text => ({
        text,
        context: 'Transcript language: und',
        startSeconds: null,
        endSeconds: null,
      }));
  }

  private formatSeconds(seconds: number): string {
    const totalSeconds = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const remainder = totalSeconds % 60;

    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
      : `${minutes}:${String(remainder).padStart(2, '0')}`;
  }
}
