import path from 'path';
import os from 'os';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import { Request, Response } from 'express';
import multer from 'multer';
import {
  getBlobStream,
  getPreviewChunk,
  inspectTicket,
  shareFileFromPath,
  shareTextContent
} from '../services/irohService';

const uploadDir = path.join(os.tmpdir(), 'iroh-upload-cache');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  }
});

export const upload = multer({
  storage,
  limits: {
    fileSize: 1024 * 1024 * 1024 // 1GB limit per upload
  }
});

export async function handleFileShare(req: Request, res: Response) {
  const file = req.file;

  if (!file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  try {
    const record = await shareFileFromPath({
      filePath: file.path,
      originalName: (req.body?.originalName as string) || file.originalname,
      mimeType: file.mimetype || 'application/octet-stream',
      owner: req.body?.owner || 'Anonymous',
      originalSize: req.body?.originalSize ? Number(req.body.originalSize) : file.size,
      originalType: (req.body?.originalType as string) || file.mimetype || 'application/octet-stream',
      compression: (req.body?.compression as 'gzip' | 'none') || 'none'
    });

    res.json(record);
  } catch (error) {
    console.error('[iroh] Failed to share file:', error);
    res.status(500).json({ error: 'Failed to share file via Iroh' });
  } finally {
    fsPromises.unlink(file.path).catch(() => undefined);
  }
}

export async function handleTextShare(req: Request, res: Response) {
  const { text, owner } = req.body || {};

  if (typeof text !== 'string' || !text.trim()) {
    res.status(400).json({ error: 'Text content is required' });
    return;
  }

  try {
    const record = await shareTextContent({ contents: text, owner });
    res.json(record);
  } catch (error) {
    console.error('[iroh] Failed to share text:', error);
    res.status(500).json({ error: 'Failed to share text via Iroh' });
  }
}

export async function handleInspectTicket(req: Request, res: Response) {
  const ticket = (req.query.ticket || req.body?.ticket) as string | undefined;

  if (!ticket) {
    res.status(400).json({ error: 'Missing ticket parameter' });
    return;
  }

  try {
    const info = await inspectTicket(ticket);
    res.json(info);
  } catch (error) {
    console.error('[iroh] Ticket inspection failed:', error);
    res.status(400).json({ error: 'Invalid or unreachable Iroh ticket' });
  }
}

export async function handleDownloadTicket(req: Request, res: Response) {
  const ticket = (req.query.ticket || req.body?.ticket) as string | undefined;

  if (!ticket) {
    res.status(400).json({ error: 'Missing ticket parameter' });
    return;
  }

  try {
    const { metadata, hash, size, chunkIterator } = await getBlobStream(ticket);
    const fileName = metadata?.name || `${hash}.bin`;
    const mimeType = metadata?.mimeType || 'application/octet-stream';

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', size.toString());
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader('X-File-Name', encodeURIComponent(fileName));
    res.setHeader('X-File-Size', size.toString());
    res.setHeader('X-File-Hash', hash);
    if (metadata?.compression) {
      res.setHeader('X-Compression', metadata.compression);
    }
    if (metadata?.originalName) {
      res.setHeader('X-Original-Name', encodeURIComponent(metadata.originalName));
    }
    if (metadata?.originalSize) {
      res.setHeader('X-Original-Size', metadata.originalSize.toString());
    }
    if (metadata?.originalType) {
      res.setHeader('X-Original-Type', metadata.originalType);
    }

    for await (const chunk of chunkIterator()) {
      res.write(chunk);
    }

    res.end();
  } catch (error) {
    console.error('[iroh] Download failed:', error);
    res.status(400).json({ error: 'Failed to download ticket data' });
  }
}

export async function handlePreviewTicket(req: Request, res: Response) {
  const ticket = (req.query.ticket || req.body?.ticket) as string | undefined;
  const bytesParam = Number(req.query.bytes) || 1024 * 1024;
  const byteLimit = Math.max(1024, Math.min(bytesParam, 2 * 1024 * 1024));

  if (!ticket) {
    res.status(400).json({ error: 'Missing ticket parameter' });
    return;
  }

  try {
    const preview = await getPreviewChunk(ticket, byteLimit);
    const payload = preview.isText
      ? { isText: true, mimeType: preview.mimeType, textContent: preview.buffer.toString('utf8') }
      : { isText: false, mimeType: preview.mimeType, base64: preview.buffer.toString('base64') };

    res.json({
      ...payload,
      name: preview.metadata?.name,
      size: preview.metadata?.size
    });
  } catch (error) {
    console.error('[iroh] Preview failed:', error);
    res.status(400).json({ error: 'Failed to generate preview for ticket' });
  }
}
