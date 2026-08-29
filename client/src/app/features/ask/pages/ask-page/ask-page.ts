import { Component } from '@angular/core';

import {
  AskInput,
  AnalysisMode,
} from '../../components/ask-input/ask-input';

import {
  LensSource,
  SourcePerspectiveCard,
} from '../../components/source-perspective-card/source-perspective-card';

import { SuggestionCard } from '../../components/suggestion-card/suggestion-card';

import { LensBadge } from '../../../../shared/components/lens-badge/lens-badge';

export interface LensAnswer {
  summary: string;
  sources: LensSource[];
  commonGround: string;
  differences: string;
  stats: {
    sources: number;
    knowledgeItems: number;
    repeatedFiltered: number;
    newConnections: number;
  };
}

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
export class AskPage {
  question = '';
  submittedQuestion = '';
  selectedMode: AnalysisMode = 'all';
  hasConversation = false;

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

  answer: LensAnswer = {
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

  ask(): void {
    const cleaned = this.question.trim();

    if (!cleaned) {
      return;
    }

    this.submittedQuestion = cleaned;
    this.question = '';
    this.hasConversation = true;

    this.answer = this.buildMockAnswer(
      cleaned,
      this.selectedMode,
    );
  }

  setMode(mode: AnalysisMode): void {
    this.selectedMode = mode;
  }

  useSuggestion(suggestion: string): void {
    this.question = suggestion;
  }

  newChat(): void {
    this.question = '';
    this.submittedQuestion = '';
    this.hasConversation = false;
    this.selectedMode = 'all';
  }

  private buildMockAnswer(
    query: string,
    mode: AnalysisMode,
  ): LensAnswer {
    const lower = query.toLowerCase();

    if (lower.includes('groom')) {
      return {
        ...this.answer,
        summary:
          mode === 'deep'
            ? 'Across the saved material, grooming appears in several connected contexts: physical presentation, hygiene, female perception, self-respect and social signaling. The sources overlap on self-maintenance but assign different meanings to it.'
            : mode === 'related'
              ? 'This connects with existing LENS knowledge around hygiene, appearance, self-maintenance, female perception and self-respect. Most of the basic grooming idea is already represented; the useful part is how different sources frame it.'
              : 'The current question is centered on grooming and how it may be perceived. The saved material contains perspectives that approach the topic differently.',
      };
    }

    return {
      ...this.answer,
      summary:
        `I found related material for "${query}". ` +
        'This is currently a mock LENS response; the real retrieval engine will use your local knowledge base.',
    };
  }
}