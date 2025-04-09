import { WebSocket } from 'ws';

/**
 * Represents a peer connected to the LAN server
 */
export interface LANPeer {
  id: string;
  name: string;
  peerId: string;
  lastSeen: number;
  ip: string; // Store the client's IP
  subnet: string; // Store the subnet to group peers by WiFi network
  ws: WebSocket;
  roomId?: string; // Optional room ID for explicit rooms
}

/**
 * Message structure for communication between peers
 */
export interface PeerMessage {
  type: string;
  userId: string;
  userName?: string;
  peerId?: string;
  roomId?: string; // Add roomId for explicit room joining
  message?: {
    type: string;
    data: Record<string, unknown>;
    recipient?: string;
  };
} 