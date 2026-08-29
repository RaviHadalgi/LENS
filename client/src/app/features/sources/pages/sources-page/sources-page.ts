import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { timeout } from 'rxjs';

import { LensModal } from '../../../../shared/components/lens-modal/lens-modal';
import { LensCard } from '../../../../shared/components/lens-card/lens-card';
import { LensBadge } from '../../../../shared/components/lens-badge/lens-badge';
import { LensFormField } from '../../../../shared/components/lens-form-field/lens-form-field';
import { LensButton } from '../../../../shared/components/lens-button/lens-button';
import { LensApiService } from '../../../../core/services/lens-api.service';

import type {
  SourceType,
  AnalyzeSourceResponse,
  YouTubeSyncResponse,
} from '../../../../core/services/lens-api.service';

type AddSourceStep =
  | 'input'
  | 'analyzing'
  | 'error'
  | 'profile'
  | 'editing'
  | 'processing';

type IdentityStatus =
  | 'high-confidence'
  | 'needs-review';

interface Source {
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
  imports: [
    FormsModule,
    LensModal,
    LensButton,
    LensFormField,
    LensBadge,
    LensCard,
  ],
  templateUrl: './sources-page.html',
  styleUrl: './sources-page.css',
})
export class SourcesPage {
  showAddSource = false;

  selectedType: SourceType = 'channel';

  sourceUrl = '';

  addSourceStep: AddSourceStep = 'input';

  analysisError = '';

  private readonly api = inject(LensApiService);

  private readonly changeDetector =
    inject(ChangeDetectorRef);

  selectedBackfill:
    | 'recent'
    | 'playlists'
    | 'all'
    | 'selected' = 'recent';

  creatorProfile: CreatorProfile | null = null;

  readonly sources: Source[] = [
    {
      name: 'Flourish with Laurin',
      perspective: 'Female / lived experience',
      contentCount: 143,
      conceptCount: 87,
      status: 'verified',
    },
    {
      name: 'Rajneesh Kumar',
      perspective: 'Male development / counseling',
      contentCount: 216,
      conceptCount: 132,
      status: 'review',
    },
    {
      name: 'Andrew Huberman',
      perspective: 'Neuroscience / research-oriented',
      contentCount: 198,
      conceptCount: 341,
      status: 'verified',
    },
  ];

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

  selectBackfill(
    option:
      | 'recent'
      | 'playlists'
      | 'all'
      | 'selected',
  ): void {
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
          console.error(
            'Source analysis failed:',
            error,
          );

          this.analysisError =
            'LENS did not receive a usable response. Confirm the server is running, then try again.';

          this.addSourceStep = 'error';

          this.changeDetector.detectChanges();
        },
      });
  }

  private handleSourceAnalysis(
    result: AnalyzeSourceResponse,
  ): void {
    if (result.status !== 'detected') {
      console.warn(
        'Source could not be detected:',
        result,
      );

      this.analysisError =
        result.status === 'unsupported'
          ? 'This source is not supported yet. Use a YouTube channel, playlist, or video URL.'
          : 'Enter a complete, valid source URL and try again.';

      this.addSourceStep = 'error';

      this.changeDetector.detectChanges();

      return;
    }

    /*
     * Always trust the backend's detected source type.
     */
    if (
      result.type === 'channel' ||
      result.type === 'playlist' ||
      result.type === 'video'
    ) {
      this.selectedType = result.type;
    }

    /*
     * YouTube channels require one additional step.
     *
     * /sources/analyze:
     *   detects @OpenAI
     *
     * /sources/youtube/sync:
     *   resolves @OpenAI
     *   -> UCXZCJLdBC09xxGZ6gcdrc6A
     *
     * The successful sync result is then used to
     * build the creator profile shown to the user.
     */
    if (
      result.platform === 'youtube' &&
      result.type === 'channel'
    ) {
      this.addSourceStep = 'analyzing';

      this.changeDetector.detectChanges();

      this.api
        .syncYouTubeChannel(result.url)
        .pipe(timeout(10_000))
        .subscribe({
          next: (syncResult) => {
            this.handleYouTubeSyncResult(
              result,
              syncResult,
            );
          },

          error: (error) => {
            console.error(
              'YouTube channel sync failed:',
              error,
            );

            this.analysisError =
              'LENS could not resolve this YouTube channel. Try again.';

            this.addSourceStep = 'error';

            this.changeDetector.detectChanges();
          },
        });

      return;
    }

    /*
     * Videos and playlists continue using the
     * metadata returned by the analysis endpoint.
     */
    this.creatorProfile =
      this.buildDraftCreatorProfile(result);

    this.addSourceStep = 'profile';

    this.changeDetector.detectChanges();
  }

  private handleYouTubeSyncResult(
    analysis: AnalyzeSourceResponse,
    sync: YouTubeSyncResponse,
  ): void {
    /*
     * A failed sync means we could not resolve the
     * channel sufficiently to continue.
     */
    if (
      sync.status === 'failed' ||
      !sync.channelId
    ) {
      console.warn(
        'YouTube channel could not be resolved:',
        sync,
      );

      this.analysisError =
        sync.message ??
        'LENS could not resolve the YouTube channel. Try again.';

      this.addSourceStep = 'error';

      this.changeDetector.detectChanges();

      return;
    }

    /*
     * The resolver deliberately reports needs-review
     * when it cannot establish a stable channel ID.
     */
    if (sync.status === 'needs-review') {
      console.warn(
        'YouTube channel needs review:',
        sync,
      );

      this.creatorProfile =
        this.buildDraftCreatorProfile(analysis);

      this.analysisError =
        sync.message ??
        'The YouTube channel needs review before it can be added.';

      this.addSourceStep = 'profile';

      this.changeDetector.detectChanges();

      return;
    }

    /*
     * SUCCESS
     *
     * Example:
     *
     * sync.handle
     *   = "@OpenAI"
     *
     * sync.channelId
     *   = "UCXZCJLdBC09xxGZ6gcdrc6A"
     *
     * The channel ID is the stable identity.
     * The handle is the human-readable source label.
     *
     * We intentionally keep identityStatus as
     * needs-review because resolving a public YouTube
     * channel is not the same as independently verifying
     * the creator's real-world identity.
     */

    const displayName =
      this.channelDisplayName(
        sync.handle,
        sync.channelId,
      );

    const resolvedAnalysis: AnalyzeSourceResponse = {
      ...analysis,

      /*
       * Replace the original @handle external ID
       * with the stable channel ID.
       */
      externalId: sync.channelId,

      /*
       * Replace the unresolved creator identity with
       * the successfully resolved YouTube channel.
       */
      creatorIdentity: {
        displayName,

        profileUrl:
          sync.url,

        status: 'needs-review',

        basis:
          'YouTube channel resolved from the supplied public channel page. Creator identity remains subject to user review.',
      },
    };

    /*
     * The backend sync does not currently return full
     * ChannelMetadata such as avatar/description/name.
     *
     * Therefore the UI uses the resolved handle for the
     * profile name rather than showing:
     *
     * "Creator identity not yet resolved"
     */
    this.creatorProfile =
      this.buildDraftCreatorProfile(
        resolvedAnalysis,
      );

    /*
     * Keep the canonical URL returned by the sync.
     */
    this.sourceUrl = sync.url;

    this.addSourceStep = 'profile';

    this.changeDetector.detectChanges();
  }

  private channelDisplayName(
    handle: string | null,
    channelId: string,
  ): string {
    /*
     * @OpenAI -> OpenAI
     *
     * This is a display name derived from the public
     * YouTube handle, not an independently verified
     * real-world identity.
     */
    if (handle) {
      const trimmed = handle.trim();

      if (trimmed.startsWith('@')) {
        const withoutAt = trimmed.slice(1).trim();

        if (withoutAt) {
          return withoutAt;
        }
      }

      if (trimmed) {
        return trimmed;
      }
    }

    /*
     * Never show the raw channel ID as the creator name
     * unless there is genuinely no better source label.
     */
    return channelId;
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

    console.log(
      'Profile saved:',
      this.creatorProfile,
    );

    this.addSourceStep = 'profile';
  }

  cancelProfileEdits(): void {
    this.addSourceStep = 'profile';
  }

  startProcessing(): void {
    console.log(
      'LENS processing started',
      {
        sourceType: this.selectedType,
        sourceUrl: this.sourceUrl,
        backfill: this.selectedBackfill,
        creatorProfile: this.creatorProfile,
      },
    );

    this.closeAddSource();
  }

  private buildDraftCreatorProfile(
    result: AnalyzeSourceResponse,
  ): CreatorProfile {
    const identity =
      result.creatorIdentity;

    const channel =
      result.channel;

    return {
      /*
       * Priority:
       *
       * 1. Verified/resolved channel metadata
       * 2. Creator identity returned by backend
       * 3. Safe unresolved fallback
       */
      name:
        channel?.name ??
        identity?.displayName ??
        'Creator identity not yet resolved',

      sourceType:
        this.selectedType,

      sourceUrl:
        result.url,

      avatarUrl:
        channel?.thumbnailUrl ??
        null,

      /*
       * If the backend has actual channel metadata,
       * use its description.
       *
       * Otherwise use the identity basis so the UI
       * explains where the information came from.
       */
      selfDescription:
        channel?.description ??
        identity?.basis ??
        'No creator information was returned by the source.',

      /*
       * These remain deliberately conservative until
       * LENS has actual source-content analysis.
       */
      relevantExpertise:
        'Not yet verified',

      education:
        'Not provided or independently verified',

      professionalExperience:
        'Not provided or independently verified',

      perspective:
        'To be classified by you',

      evidenceStyle:
        'To be assessed from source content',

      /*
       * User classification remains separate from
       * source-derived information.
       */
      userPerspective:
        '',

      userRelevantFor:
        '',

      userNotes:
        '',

      identityStatus:
        identity?.status ??
        'needs-review',
    };
  }
}