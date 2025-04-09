import express from 'express';
import { createRoom } from '../controllers/roomController';
import { getStatus, getIpInfo, getHomePage } from '../controllers/statusController';

const router = express.Router();

// Room endpoints
router.get('/create-room', createRoom);

// Status endpoints
router.get('/status', getStatus);
router.get('/ip', getIpInfo);

// Home page
router.get('/', getHomePage);

export default router; 