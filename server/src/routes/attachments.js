import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { mkdirSync, createReadStream, existsSync } from 'fs';
import { join, resolve } from 'path';
import { pipeline } from 'stream/promises';
import { requireAuth } from '../middleware/auth.js';
import { store } from '../store/index.js';

const router = Router();
const UPLOAD_DIR = resolve(process.cwd(), 'uploads');
mkdirSync(UPLOAD_DIR, { recursive: true });
const MAX_BYTES = 15 * 1024 * 1024;

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, _file, cb) => cb(null, `${randomUUID()}.bin`),
  }),
  limits: { fileSize: MAX_BYTES },
});

router.post('/', requireAuth, upload.single('file'), async (req, res, next) => {
  try {
    const conversationId = req.body?.conversationId;
    if (!conversationId) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'conversationId is required' } });
    }
    if (!req.file) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Encrypted file is required' } });
    }
    const result = await store.createAttachment({
      conversationId,
      uploaderUserId: req.user.id,
      storageKey: req.file.filename,
      sizeBytes: req.file.size,
      contentType: req.body?.contentType || 'application/octet-stream',
    });
    if (result.error) {
      return res.status(result.error.code === 'FORBIDDEN' ? 403 : 400).json({ error: result.error });
    }
    res.status(201).json({
      data: {
        id: result.data.id,
        sizeBytes: result.data.sizeBytes,
        conversationId: result.data.conversationId,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await store.getAttachment(req.params.id, req.user.id);
    if (result.error) {
      return res.status(result.error.code === 'FORBIDDEN' ? 403 : 404).json({ error: result.error });
    }
    const filePath = join(UPLOAD_DIR, result.data.storageKey);
    if (!existsSync(filePath)) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Attachment blob missing' } });
    }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', String(result.data.sizeBytes));
    res.setHeader('Cache-Control', 'private, no-store');
    await pipeline(createReadStream(filePath), res);
  } catch (err) {
    next(err);
  }
});

export default router;
