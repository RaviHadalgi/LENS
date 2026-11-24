import { Router } from "express";

import {
  appendConversationTurn,
  deleteConversation,
  getConversation,
  listConversations,
} from "../controllers/conversation.controller";

const router = Router();

router.get("/", listConversations);
router.post("/turns", appendConversationTurn);
router.delete("/:conversationId", deleteConversation);
router.get("/:conversationId", getConversation);

export default router;
