import { Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

import { ConversationStateService } from '../../../core/services/conversation-state.service';
import type { ConversationSummary } from '../../../core/services/lens-api.service';
import { LensButton } from '../../../shared/components/lens-button/lens-button';
import { LensModal } from '../../../shared/components/lens-modal/lens-modal';

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, LensButton, LensModal],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
})
export class Sidebar implements OnInit {
  private readonly conversationState = inject(ConversationStateService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  recentChats: ConversationSummary[] = [];
  activeConversationId: string | null = null;
  conversationPendingDeletion: ConversationSummary | null = null;
  deletingConversation = false;
  deleteConversationError = '';

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
    void this.router.navigateByUrl('/ask');
  }

  openChat(conversationId: string): void {
    void this.router.navigate(['/ask'], {
      queryParams: { chat: conversationId },
    });
  }

  requestDeleteConversation(
    conversation: ConversationSummary,
    event: MouseEvent,
  ): void {
    event.stopPropagation();
    this.conversationPendingDeletion = conversation;
    this.deleteConversationError = '';
  }

  cancelDeleteConversation(): void {
    if (this.deletingConversation) {
      return;
    }

    this.conversationPendingDeletion = null;
    this.deleteConversationError = '';
  }

  confirmDeleteConversation(): void {
    const conversation = this.conversationPendingDeletion;

    if (!conversation || this.deletingConversation) {
      return;
    }

    const currentChat = this.router.parseUrl(this.router.url).queryParams['chat'];
    const deletingOpenConversation =
      this.activeConversationId === conversation.id || currentChat === conversation.id;

    this.deletingConversation = true;
    this.deleteConversationError = '';

    this.conversationState.deleteConversation(conversation.id).subscribe({
      next: () => {
        this.deletingConversation = false;
        this.conversationPendingDeletion = null;

        if (deletingOpenConversation) {
          this.conversationState.startNewChat();
          void this.router.navigateByUrl('/ask');
        }
      },
      error: (error) => {
        console.error('Failed to delete conversation:', error);
        this.deletingConversation = false;
        this.deleteConversationError =
          error?.error?.message ?? 'LENS could not delete this conversation. Please try again.';
      },
    });
  }
}
