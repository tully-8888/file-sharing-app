import express from 'express';
import { createRoom } from '../controllers/roomController';
import { getStatus, getIpInfo, getHomePage } from '../controllers/statusController';
import {
  upload,
  handleFileShare,
  handleTextShare,
  handleInspectTicket,
  handleDownloadTicket,
  handlePreviewTicket
} from '../controllers/irohController';

const router = express.Router();

// Room endpoints
router.get('/create-room', createRoom);

// Status endpoints
router.get('/status', getStatus);
router.get('/ip', getIpInfo);

// Iroh endpoints
router.post('/iroh/share-file', upload.single('file'), handleFileShare);
router.post('/iroh/share-text', handleTextShare);
router.get('/iroh/inspect', handleInspectTicket);
router.get('/iroh/download', handleDownloadTicket);
router.get('/iroh/preview', handlePreviewTicket);

// Home page
router.get('/', getHomePage);

export default router; 
