import { Request, Response } from 'express';
import { nanoid } from 'nanoid';
import { explicitRooms } from '../ws/handlers';

/**
 * Create a new room with a unique ID
 */
export function createRoom(_: Request, res: Response): void {
  const roomId = nanoid(6);
  explicitRooms.set(roomId, new Set());
  console.log(`[API] Created new explicit room: ${roomId}`);
  res.json({ roomId });
} 