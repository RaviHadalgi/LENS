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
    return this.api.getConversation(conversationId).pipe(
      tap(({ conversation }) => this.activeSubject.next(conversation)),
      tap(({ conversation }) => this.upsertRecent(conversation)),
      map(({ conversation }) => conversation),
    );
  }

  saveTurn(input: {
    conversationId: string | null;
    question: string;
    mode: ConversationMode;
    answer: ConversationAnswer;
  }): Observable<{ conversation: LensConversation; created: boolean }> {
    return this.api.saveConversationTurn(input).pipe(
      tap(({ conversation }) => {
        this.activeSubject.next(conversation);
        this.upsertRecent(conversation);
      }),
    );
  }

  startNewChat(): void {
    this.activeSubject.next(null);
  }

  private upsertRecent(conversation: ConversationSummary): void {
    this.recentSubject.next([
      conversation,
      ...this.recentSubject.value.filter((item) => item.id !== conversation.id),
    ].slice(0, 30));
  }
}
