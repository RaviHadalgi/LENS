import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, map, Observable, tap } from 'rxjs';

import {
  LensApiService,
  type ConversationAnswer,
  type ConversationMode,
  type ConversationSummary,
  type LensConversation,
} from './lens-api.service';

@Injectable({ providedIn: 'root' })
export class ConversationStateService {
  private readonly api = inject(LensApiService);
  private readonly recentSubject = new BehaviorSubject<ConversationSummary[]>([]);
  private readonly activeSubject = new BehaviorSubject<LensConversation | null>(null);
  private contextRevision = 0;

  readonly recentConversations$ = this.recentSubject.asObservable();
  readonly activeConversation$ = this.activeSubject.asObservable();

  get activeConversation(): LensConversation | null {
    return this.activeSubject.value;
  }

  refreshRecent(): void {
    this.api.listConversations().subscribe({
      next: ({ conversations }) => this.recentSubject.next(conversations),
      error: (error) => console.error('Failed to load recent conversations:', error),
    });
  }

  loadConversation(conversationId: string): Observable<LensConversation> {
    const revision = ++this.contextRevision;

    return this.api.getConversation(conversationId).pipe(
      tap(({ conversation }) => {
        if (revision === this.contextRevision) {
          this.activeSubject.next(conversation);
          this.upsertRecent(conversation);
        }
      }),
      map(({ conversation }) => conversation),
    );
  }

  saveTurn(input: {
    conversationId: string | null;
    question: string;
    mode: ConversationMode;
    answer: ConversationAnswer;
  }): Observable<{ conversation: LensConversation; created: boolean }> {
    const revision = this.contextRevision;

    return this.api.saveConversationTurn(input).pipe(
      tap(({ conversation }) => {
        if (revision === this.contextRevision) {
          this.activeSubject.next(conversation);
          this.upsertRecent(conversation);
        }
      }),
    );
  }

  deleteConversation(conversationId: string): Observable<void> {
    return this.api.deleteConversation(conversationId).pipe(
      tap(() => {
        this.recentSubject.next(
          this.recentSubject.value.filter((item) => item.id !== conversationId),
        );

        if (this.activeSubject.value?.id === conversationId) {
          this.startNewChat();
        }
      }),
    );
  }

  startNewChat(): void {
    this.contextRevision += 1;
    this.activeSubject.next(null);
  }

  private upsertRecent(conversation: ConversationSummary): void {
    this.recentSubject.next([
      conversation,
      ...this.recentSubject.value.filter((item) => item.id !== conversation.id),
    ].slice(0, 30));
  }
}
