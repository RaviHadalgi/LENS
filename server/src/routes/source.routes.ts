import { Router } from 'express';

import {
  analyzeSource,
  listSources,
  listSourceVideos,
  syncYouTubeChannel,
} from '../controllers/source.controller';

const router = Router();

router.get('/', listSources);
router.post('/analyze', analyzeSource);
router.post('/youtube/sync', syncYouTubeChannel);
router.get('/:sourceKey/videos', listSourceVideos);

export default router;