import { Router } from "express";

import {
  analyzeSource,
  listSources,
  listSourceVideos,
  processSourceVideo,
  syncYouTubeChannel,
  updateSourceVideoStatus,
} from "../controllers/source.controller";

const router = Router();

router.get("/", listSources);
router.post("/analyze", analyzeSource);
router.post("/youtube/sync", syncYouTubeChannel);
router.get("/:sourceKey/videos", listSourceVideos);
router.patch("/:sourceKey/videos/:videoId/status", updateSourceVideoStatus);
router.post("/:sourceKey/videos/:videoId/process", processSourceVideo);

export default router;
