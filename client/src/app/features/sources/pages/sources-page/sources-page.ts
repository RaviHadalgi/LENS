import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { timeout } from 'rxjs';

import { LensModal } from '../../../../shared/components/lens-modal/lens-modal';
import { LensCard } from '../../../../shared/components/lens-card/lens-card';
import { LensBadge } from '../../../../shared/components/lens-badge/lens-badge';
import { LensFormField } from '../../../../shared/components/lens-form-field/lens-form-field';
import { LensButton } from '../../../../shared/components/lens-button/lens-button';
import { LensApiService } from '../../../../core/services/lens-api.service';
import type { SourceType, AnalyzeSourceResponse } from '../../../../core/services/lens-api.service';

type AddSourceStep = 'input' | 'analyzing' | 'error' | 'profile' | 'editing' | 'processing';

type IdentityStatus = 'high-confidence' | 'needs-review';

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
  imports: [FormsModule, LensModal, LensButton, LensFormField, LensBadge, LensCard],
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
  private readonly changeDetector = inject(ChangeDetectorRef);
  selectedBackfill: 'recent' | 'playlists' | 'all' | 'selected' = 'recent';

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

    this.api.analyzeSource(url).pipe(timeout(10_000)).subscribe({
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

    /*
     * Keep the source type returned by the backend.
     * This becomes important once the user pastes a URL
     * without manually selecting Video/Playlist/Channel.
     */
    if (result.type === 'channel' || result.type === 'playlist' || result.type === 'video') {
      this.selectedType = result.type;
    }

    /*
     * Temporary profile creation remains here.
     *
     * Later this will be replaced by:
     * backend identity resolution →
     * creator profile response.
     */
    this.creatorProfile = this.buildDraftCreatorProfile(result);

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
    console.log('LENS processing started', {
      sourceType: this.selectedType,
      sourceUrl: this.sourceUrl,
      backfill: this.selectedBackfill,
      creatorProfile: this.creatorProfile,
    });

    this.closeAddSource();
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
}
