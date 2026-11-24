import { Router } from "express";

import {
  appendConversationTurn,
  getConversation,
  listConversations,
} from "../controllers/conversation.controller";

const router = Router();

router.get("/", listConversations);
router.post("/turns", appendConversationTurn);
router.get("/:conversationId", getConversation);

export default router;
