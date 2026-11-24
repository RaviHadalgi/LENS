import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConversationStateService } from './conversation-state.service';
import { LensApiService, type LensConversation } from './lens-api.service';

describe('ConversationStateService', () => {
  const conversation: LensConversation = {
    id: '4c3ff1b7-2ed7-4e35-bd10-736f1d05ca6c',
    title: 'Saved conversation',
    createdAt: '2026-11-24T00:00:00.000Z',
    updatedAt: '2026-11-24T00:00:00.000Z',
    turnCount: 1,
    turns: [{
      id: 1,
      question: 'Saved conversation',
      mode: 'all',
      answer: {
        summary: 'Saved answer', sources: [], commonGround: '', differences: '',
        stats: { sources: 0, knowledgeItems: 0, repeatedFiltered: 0, newConnections: 0 },
      },
      createdAt: '2026-11-24T00:00:00.000Z',
    }],
  };

  const apiMock = {
    listConversations: vi.fn(),
    getConversation: vi.fn(),
    saveConversationTurn: vi.fn(),
  };

  let service: ConversationStateService;

  beforeEach(() => {
    apiMock.listConversations.mockReset();
    apiMock.getConversation.mockReset();
    apiMock.saveConversationTurn.mockReset();

    TestBed.configureTestingModule({
      providers: [
        ConversationStateService,
        { provide: LensApiService, useValue: apiMock },
      ],
    });
    service = TestBed.inject(ConversationStateService);
  });

  it('loads saved conversations into Recent', () => {
    apiMock.listConversations.mockReturnValue(of({ conversations: [conversation] }));
    let recent: string[] = [];
    service.recentConversations$.subscribe((items) => {
      recent = items.map(item => item.title);
    });

    service.refreshRecent();

    expect(recent).toEqual(['Saved conversation']);
  });

  it('loads a selected conversation as the active context', () => {
    apiMock.getConversation.mockReturnValue(of({ conversation }));

    service.loadConversation(conversation.id).subscribe((loaded) => {
      expect(loaded).toEqual(conversation);
    });

    expect(service.activeConversation).toEqual(conversation);
  });

  it('updates Recent after a turn and clears context for New chat', () => {
    const olderConversation = {
      ...conversation,
      id: 'd8094953-b88c-4d03-87f3-0145c8853d8d',
      title: 'Older conversation',
    };
    apiMock.listConversations.mockReturnValue(of({
      conversations: [olderConversation, conversation],
    }));
    service.refreshRecent();

    apiMock.saveConversationTurn.mockReturnValue(of({ conversation, created: true }));
    service.saveTurn({
      conversationId: null,
      question: conversation.title,
      mode: 'all',
      answer: conversation.turns[0]!.answer,
    }).subscribe();

    expect(service.activeConversation?.id).toBe(conversation.id);

    let recentIds: string[] = [];
    service.recentConversations$.subscribe((items) => {
      recentIds = items.map(item => item.id);
    });
    expect(recentIds).toEqual([conversation.id, olderConversation.id]);

    service.startNewChat();
    expect(service.activeConversation).toBeNull();
  });
});
