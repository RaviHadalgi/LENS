import { Router } from 'express';

import { analyzeSource } from '../controllers/source.controller';

const router = Router();

router.post('/analyze', analyzeSource);

export default router;