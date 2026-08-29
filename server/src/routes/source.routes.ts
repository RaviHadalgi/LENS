import { Router } from 'express';

import {
  analyzeSource,
  listSources,
  syncYouTubeChannel,
} from '../controllers/source.controller';

const router = Router();

router.get('/', listSources);
router.post('/analyze', analyzeSource);
router.post('/youtube/sync', syncYouTubeChannel);

export default router;