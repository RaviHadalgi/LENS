import { Router } from 'express';

import { analyzeSource, syncYouTubeChannel } from '../controllers/source.controller';

const router = Router();

router.post('/analyze', analyzeSource);
router.post('/youtube/sync', syncYouTubeChannel);

export default router;
