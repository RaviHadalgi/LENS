import { Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { distinctUntilChanged, map } from 'rxjs';

import {
  AskInput,
  AnalysisMode,
} from '../../components/ask-input/ask-input';

import {
  SourcePerspectiveCard,
} from '../../components/source-perspective-card/source-perspective-card';

import { SuggestionCard } from '../../components/suggestion-card/suggestion-card';
import { LensBadge } from '../../../../shared/components/lens-badge/lens-badge';
import { ConversationStateService } from '../../../../core/services/conversation-state.service';
import type {
  ConversationAnswer,
  ConversationTurn,
} from '../../../../core/services/lens-api.service';

export type LensAnswer = ConversationAnswer;

@Component({
  selector: 'app-ask-page',
  imports: [
    AskInput,
    SourcePerspectiveCard,
    SuggestionCard,
    LensBadge,
  ],
  templateUrl: './ask-page.html',
  styleUrl: './ask-page.css',
})
export class AskPage implements OnInit {
  private readonly conversationState = inject(ConversationStateService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  question = '';
  selectedMode: AnalysisMode = 'all';
  turns: ConversationTurn[] = [];
  activeConversationId: string | null = null;
  loadingConversation = false;
  savingConversation = false;
  conversationError = '';

  readonly suggestions = [
    {
      title: "Grooming + women's perspective",
      description: 'Compare what your sources say.',
    },
    {
      title: 'What makes a strong man?',
      description: 'Find common ground and differences.',
    },
    {
      title: 'What is genuinely new?',
      description: 'Find knowledge you have not seen before.',
    },
    {
      title: 'Where do my sources disagree?',
      description: 'Surface conflicting perspectives.',
    },
  ];

  private readonly baseAnswer: LensAnswer = {
    summary:
      'Your saved sources connect grooming with personal presentation, self-maintenance and social perception, but they approach the subject from different perspectives.',
    sources: [
      {
        creator: 'Flourish with Laurin',
        perspective: 'Female / lived experience',
        context: 'Physical presentation → female perception',
        statement:
          'Grooming can be noticed as part of a man’s overall presentation and the effort he puts into himself.',
        timestamp: '14:32',
      },
      {
        creator: 'Rajneesh Kumar',
        perspective: 'Male development / counseling',
        context: 'Self-maintenance → discipline / self-respect',
        statement:
          'Personal maintenance can be viewed as part of maintaining standards and self-respect.',
        timestamp: '08:17',
      },
      {
        creator: 'Research-oriented source',
        perspective: 'Scientific / research-oriented',
        context: 'Appearance → social perception',
        statement:
          'Relevant research can help distinguish observable social-perception effects from broader interpretations.',
        timestamp: '03:12',
      },
    ],
    commonGround:
      'Personal maintenance is treated as meaningful beyond the physical act itself: it can relate to presentation, standards and how a person is perceived.',
    differences:
      'Laurin emphasizes how a man may be perceived by women. Rajneesh emphasizes the man’s internal standards and self-respect. Scientific material should be evaluated according to the evidence supporting the specific claim.',
    stats: {
      sources: 3,
      knowledgeItems: 7,
      repeatedFiltered: 12,
      newConnections: 2,
    },
  };

  get hasConversation(): boolean {
    return this.turns.length > 0;
  }

  ngOnInit(): void {
    this.conversationState.activeConversation$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((conversation) => {
        this.activeConversationId = conversation?.id ?? null;
        this.turns = conversation?.turns ?? [];

        if (conversation?.turns.length) {
          this.selectedMode = conversation.turns.at(-1)?.mode ?? 'all';
        } else {
          this.question = '';
          this.selectedMode = 'all';
        }
      });

    this.route.queryParamMap
      .pipe(
        map((params) => params.get('chat')),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((conversationId) => {
        this.loadConversationFromRoute(conversationId);
      });
  }

  ask(): void {
    const cleaned = this.question.trim();

    if (!cleaned || this.savingConversation) {
      return;
    }

    const previousConversationId = this.activeConversationId;
    const answer = this.buildMockAnswer(cleaned, this.selectedMode);
    this.savingConversation = true;
    this.conversationError = '';

    this.conversationState.saveTurn({
      conversationId: previousConversationId,
      question: cleaned,
      mode: this.selectedMode,
      answer,
    }).subscribe({
      next: ({ conversation }) => {
        this.question = '';
        this.savingConversation = false;

        if (!previousConversationId) {
          void this.router.navigate(['/ask'], {
            queryParams: { chat: conversation.id },
            replaceUrl: true,
          });
        }
      },
      error: (error) => {
        console.error('Failed to save conversation:', error);
        this.savingConversation = false;
        this.conversationError =
          error?.error?.message ?? 'LENS could not save this conversation. Please try again.';
      },
    });
  }

  setMode(mode: AnalysisMode): void {
    this.selectedMode = mode;
  }

  useSuggestion(suggestion: string): void {
    this.question = suggestion;
  }

  private loadConversationFromRoute(conversationId: string | null): void {
    this.conversationError = '';

    if (!conversationId) {
      this.loadingConversation = false;
      this.conversationState.startNewChat();
      return;
    }

    if (this.conversationState.activeConversation?.id === conversationId) {
      this.loadingConversation = false;
      return;
    }

    this.loadingConversation = true;
    this.conversationState.loadConversation(conversationId).subscribe({
      next: () => {
        this.loadingConversation = false;
      },
      error: (error) => {
        console.error('Failed to load conversation:', error);
        this.loadingConversation = false;
        this.conversationError =
          error?.status === 404
            ? 'This conversation is no longer available.'
            : 'LENS could not load this conversation.';
        this.conversationState.startNewChat();
      },
    });
  }

  private buildMockAnswer(
    query: string,
    mode: AnalysisMode,
  ): LensAnswer {
    const lower = query.toLowerCase();

    if (lower.includes('groom')) {
      return {
        ...this.baseAnswer,
        summary:
          mode === 'deep'
            ? 'Across the saved material, grooming appears in several connected contexts: physical presentation, hygiene, female perception, self-respect and social signaling. The sources overlap on self-maintenance but assign different meanings to it.'
            : mode === 'related'
              ? 'This connects with existing LENS knowledge around hygiene, appearance, self-maintenance, female perception and self-respect. Most of the basic grooming idea is already represented; the useful part is how different sources frame it.'
              : 'The current question is centered on grooming and how it may be perceived. The saved material contains perspectives that approach the topic differently.',
      };
    }

    return {
      ...this.baseAnswer,
      summary:
        `I found related material for "${query}". ` +
        'This is currently a mock LENS response; the real retrieval engine will use your local knowledge base.',
    };
  }
}
