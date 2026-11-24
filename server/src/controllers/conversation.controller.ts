import type { Request, Response } from "express";
import { z } from "zod";

import { ConversationStore } from "../services/conversation.store";

const conversationStore = new ConversationStore();

const answerSchema = z.object({
  summary: z.string().max(100_000),
  sources: z.array(z.object({
    creator: z.string().max(1_000),
    perspective: z.string().max(2_000),
    context: z.string().max(10_000),
    statement: z.string().max(100_000),
    timestamp: z.string().max(100),
  })).max(100),
  commonGround: z.string().max(100_000),
  differences: z.string().max(100_000),
  stats: z.object({
    sources: z.number().int().nonnegative(),
    knowledgeItems: z.number().int().nonnegative(),
    repeatedFiltered: z.number().int().nonnegative(),
    newConnections: z.number().int().nonnegative(),
  }),
});

const appendTurnSchema = z.object({
  conversationId: z.string().uuid().nullable(),
  question: z.string().trim().min(1).max(10_000),
  mode: z.enum(["all", "related", "deep"]),
  answer: answerSchema,
});

export async function listConversations(
  _req: Request,
  res: Response,
): Promise<void> {
  res.status(200).json({
    conversations: await conversationStore.listConversations(),
  });
}

export async function getConversation(
  req: Request,
  res: Response,
): Promise<void> {
  const conversationId = req.params["conversationId"];

  if (typeof conversationId !== "string" || !z.string().uuid().safeParse(conversationId).success) {
    res.status(400).json({ status: "invalid", message: "A valid conversation ID is required." });
    return;
  }

  const conversation = await conversationStore.getConversation(conversationId);

  if (!conversation) {
    res.status(404).json({ status: "not-found", message: "Conversation not found." });
    return;
  }

  res.status(200).json({ conversation });
}

export async function appendConversationTurn(
  req: Request,
  res: Response,
): Promise<void> {
  const input = appendTurnSchema.safeParse(req.body);

  if (!input.success) {
    res.status(400).json({ status: "invalid", message: "A valid question and answer are required." });
    return;
  }

  const result = await conversationStore.appendTurn(input.data);

  if (!result) {
    res.status(404).json({ status: "not-found", message: "Conversation not found." });
    return;
  }

  res.status(result.created ? 201 : 200).json(result);
}
