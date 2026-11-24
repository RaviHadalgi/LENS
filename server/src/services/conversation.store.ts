import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const DEFAULT_PATH = resolve(process.cwd(), "data/lens-conversations.sqlite");

export type ConversationMode = "all" | "related" | "deep";

export interface ConversationTurn {
  id: number;
  question: string;
  mode: ConversationMode;
  answer: unknown;
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  turnCount: number;
}

export interface Conversation extends ConversationSummary {
  turns: ConversationTurn[];
}

export interface AppendConversationTurnInput {
  conversationId: string | null;
  question: string;
  mode: ConversationMode;
  answer: unknown;
}

export class ConversationStore {
  private db: DatabaseSync | null = null;

  constructor(private readonly filePath = DEFAULT_PATH) {}

  async listConversations(limit = 30): Promise<ConversationSummary[]> {
    return this.database()
      .prepare(`
        SELECT
          c.id,
          c.title,
          c.created_at AS createdAt,
          c.updated_at AS updatedAt,
          COUNT(t.id) AS turnCount
        FROM conversations c
        LEFT JOIN conversation_turns t ON t.conversation_id = c.id
        GROUP BY c.id, c.title, c.created_at, c.updated_at
        ORDER BY c.updated_at DESC, MAX(t.id) DESC
        LIMIT ?
      `)
      .all(Math.max(1, Math.min(limit, 100))) as unknown as ConversationSummary[];
  }

  async getConversation(conversationId: string): Promise<Conversation | null> {
    const db = this.database();
    const row = db
      .prepare(`
        SELECT
          c.id,
          c.title,
          c.created_at AS createdAt,
          c.updated_at AS updatedAt,
          COUNT(t.id) AS turnCount
        FROM conversations c
        LEFT JOIN conversation_turns t ON t.conversation_id = c.id
        WHERE c.id = ?
        GROUP BY c.id, c.title, c.created_at, c.updated_at
      `)
      .get(conversationId) as unknown as ConversationSummary | undefined;

    if (!row) {
      return null;
    }

    const turns = db
      .prepare(`
        SELECT
          id,
          question,
          mode,
          answer_json AS answerJson,
          created_at AS createdAt
        FROM conversation_turns
        WHERE conversation_id = ?
        ORDER BY id ASC
      `)
      .all(conversationId) as unknown as Array<{
      id: number;
      question: string;
      mode: ConversationMode;
      answerJson: string;
      createdAt: string;
    }>;

    return {
      ...row,
      turnCount: Number(row.turnCount),
      turns: turns.map(({ answerJson, ...turn }) => ({
        ...turn,
        answer: JSON.parse(answerJson) as unknown,
      })),
    };
  }

  async deleteConversation(conversationId: string): Promise<boolean> {
    const result = this.database()
      .prepare("DELETE FROM conversations WHERE id = ?")
      .run(conversationId);

    return Number(result.changes) === 1;
  }

  async appendTurn(input: AppendConversationTurnInput): Promise<{
    conversation: Conversation;
    created: boolean;
  } | null> {
    const db = this.database();
    const now = new Date().toISOString();
    const conversationId = input.conversationId ?? randomUUID();
    const created = input.conversationId === null;

    db.exec("BEGIN IMMEDIATE");

    try {
      if (created) {
        db.prepare(`
          INSERT INTO conversations (id, title, created_at, updated_at)
          VALUES (?, ?, ?, ?)
        `).run(conversationId, this.titleFromQuestion(input.question), now, now);
      } else {
        const existing = db
          .prepare("SELECT 1 FROM conversations WHERE id = ?")
          .get(conversationId);

        if (!existing) {
          db.exec("COMMIT");
          return null;
        }
      }

      db.prepare(`
        INSERT INTO conversation_turns (
          conversation_id,
          question,
          mode,
          answer_json,
          created_at
        )
        VALUES (?, ?, ?, ?, ?)
      `).run(
        conversationId,
        input.question,
        input.mode,
        JSON.stringify(input.answer),
        now,
      );

      db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?")
        .run(now, conversationId);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    const conversation = await this.getConversation(conversationId);

    if (!conversation) {
      throw new Error("Conversation was not available after saving a turn.");
    }

    return { conversation, created };
  }

  async close(): Promise<void> {
    this.db?.close();
    this.db = null;
  }

  private titleFromQuestion(question: string): string {
    const normalized = question.replace(/\s+/g, " ").trim();
    return normalized.length <= 80 ? normalized : `${normalized.slice(0, 77).trimEnd()}…`;
  }

  private database(): DatabaseSync {
    if (this.db) {
      return this.db;
    }

    mkdirSync(dirname(this.filePath), { recursive: true });
    this.db = new DatabaseSync(this.filePath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS conversation_turns (
        id INTEGER PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        question TEXT NOT NULL,
        mode TEXT NOT NULL CHECK(mode IN ('all', 'related', 'deep')),
        answer_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_conversations_updated_at
        ON conversations(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_conversation_turns_conversation_id
        ON conversation_turns(conversation_id, id);
    `);

    return this.db;
  }
}
