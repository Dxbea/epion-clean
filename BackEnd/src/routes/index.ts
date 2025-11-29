// BackEnd/src/routes/index.ts
import { Router } from 'express';

import { router as articles } from './articles';
import { router as categories } from './categories';
import { router as categoryArticles } from './categoryArticles';
import { router as chat } from './chat';
import { router as chatFolders } from './chatFolders';

export const router = Router();

// every route listed under the /api namespace
router.use('/articles', articles);
router.use('/categories', categories);
router.use('/categories', categoryArticles);
router.use('/chat', chat);
router.use('/chat', chatFolders);

export default router;
