import { Router } from 'express';

import {
  analyzeSource,
  listSources,
  listSourceVideos,
  syncYouTubeChannel,
  updateSourceVideoStatus,
} from '../controllers/source.controller';

const router = Router();

router.get('/', listSources);
router.post('/analyze', analyzeSource);
router.post('/youtube/sync', syncYouTubeChannel);
router.get('/:sourceKey/videos', listSourceVideos);
router.patch(
  '/:sourceKey/videos/:videoId/status',
  updateSourceVideoStatus,
);

export default router;