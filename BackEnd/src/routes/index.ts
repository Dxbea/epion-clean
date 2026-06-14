// BackEnd/src/routes/index.ts
import { Router } from 'express';

import { router as articles } from './articles.js';
import { router as categories } from './categories.js';
import { router as categoryArticles } from './categoryArticles.js';
import { router as chat } from './chat.js';
import { router as chatFolders } from './chatFolders.js';

export const router = Router();

// every route listed under the /api namespace
router.use('/articles', articles);
router.use('/categories', categories);
router.use('/categories', categoryArticles);
router.use('/chat', chat);
router.use('/chat', chatFolders);

export default router;
