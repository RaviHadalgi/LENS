import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ConversationStore } from "./conversation.store";

const answer = {
  summary: "Saved answer",
  sources: [],
  commonGround: "",
  differences: "",
  stats: {
    sources: 0,
    knowledgeItems: 0,
    repeatedFiltered: 0,
    newConnections: 0,
  },
};

test("creates a conversation and appends later turns to the same context", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lens-conversations-"));
  const databasePath = join(directory, "conversations.sqlite");

  try {
    const store = new ConversationStore(databasePath);
    const created = await store.appendTurn({
      conversationId: null,
      question: "What makes a strong man?",
      mode: "all",
      answer,
    });

    assert.ok(created);
    assert.equal(created.created, true);
    assert.equal(created.conversation.title, "What makes a strong man?");
    assert.equal(created.conversation.turnCount, 1);
    assert.equal(created.conversation.turns[0]?.question, "What makes a strong man?");

    const second = await store.appendTurn({
      conversationId: null,
      question: "How should I build a daily routine?",
      mode: "related",
      answer,
    });
    assert.ok(second);

    const updated = await store.appendTurn({
      conversationId: created.conversation.id,
      question: "How does discipline fit that context?",
      mode: "deep",
      answer: { ...answer, summary: "Follow-up answer" },
    });

    assert.ok(updated);
    assert.equal(updated.created, false);
    assert.equal(updated.conversation.id, created.conversation.id);
    assert.equal(updated.conversation.turnCount, 2);
    assert.deepEqual(
      updated.conversation.turns.map(turn => turn.question),
      ["What makes a strong man?", "How does discipline fit that context?"],
    );

    const recent = await store.listConversations();
    assert.equal(recent.length, 2);
    assert.equal(recent[0]?.id, created.conversation.id);
    assert.equal(Number(recent[0]?.turnCount), 2);
    assert.equal(recent[1]?.id, second.conversation.id);

    await store.close();

    const reopened = new ConversationStore(databasePath);
    const persisted = await reopened.getConversation(created.conversation.id);
    assert.equal(persisted?.turnCount, 2);
    assert.equal(persisted?.turns[1]?.answer && (persisted.turns[1].answer as typeof answer).summary, "Follow-up answer");
    await reopened.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("does not create a turn for an unknown conversation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lens-conversations-missing-"));
  const databasePath = join(directory, "conversations.sqlite");

  try {
    const store = new ConversationStore(databasePath);
    const result = await store.appendTurn({
      conversationId: "f392ac7c-c812-4d66-9c52-a14e6d83dfe2",
      question: "Do not create this conversation",
      mode: "related",
      answer,
    });

    assert.equal(result, null);
    assert.deepEqual(await store.listConversations(), []);
    await store.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
