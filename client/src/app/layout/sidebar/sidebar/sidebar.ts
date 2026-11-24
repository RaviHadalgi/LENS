import { Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

import { ConversationStateService } from '../../../core/services/conversation-state.service';
import type { ConversationSummary } from '../../../core/services/lens-api.service';

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
})
export class Sidebar implements OnInit {
  private readonly conversationState = inject(ConversationStateService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  recentChats: ConversationSummary[] = [];
  activeConversationId: string | null = null;

  constructor() {
    this.conversationState.recentConversations$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((conversations) => {
        this.recentChats = conversations;
      });

    this.conversationState.activeConversation$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((conversation) => {
        this.activeConversationId = conversation?.id ?? null;
      });
  }

  ngOnInit(): void {
    this.conversationState.refreshRecent();
  }

  newChat(): void {
    this.conversationState.startNewChat();
    void this.router.navigate(['/ask'], { queryParams: {} });
  }

  openChat(conversationId: string): void {
    void this.router.navigate(['/ask'], {
      queryParams: { chat: conversationId },
    });
  }
}
