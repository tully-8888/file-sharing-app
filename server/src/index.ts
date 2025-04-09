// @ts-nocheck
/* eslint-disable */
import http from 'http';
import express from 'express';
import { WebSocketServer } from 'ws';
import { Request, Response, NextFunction } from 'express';
import { networkInterfaces } from 'os';
import { BIND_ADDRESS, PORT, IS_PRODUCTION, WS_OPTIONS } from './config';
import { getIp, getLocalIpAddress, extractSubnet } from './utils/network';
import { 
  handleMessage, 
  handleConnectionClose, 
  cleanupInactivePeers,
  rooms,
  explicitRooms
} from './ws/handlers';
import apiRoutes from './routes/api';
import { IncomingMessage } from 'http';
import { LANPeer } from './types';

// Create Express app
const app = express();

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ 
  server,
  perMessageDeflate: WS_OPTIONS.perMessageDeflate
});

// Connection counter
let connectionCounter = 0;

// Enable CORS for all routes
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Add a debug middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[HTTP] ${req.method} ${req.url} from ${req.ip}`);
  next();
});

// Use API routes
app.use('/', apiRoutes);

// Set up WebSocket connection handler
wss.on('connection', (ws, req) => {
  connectionCounter++;
  console.log(`[WS] New connection #${connectionCounter} from ${req.socket.remoteAddress}`);
  
  const ip = getIp(req);
  if (!ip) {
    console.log('[WS] No IP detected, closing connection');
    return ws.close();
  }

  // Extract subnet from IP to determine which room the peer belongs to
  const subnet = extractSubnet(ip);
  console.log(`[WS] Connection #${connectionCounter} from IP: ${ip}, Subnet: ${subnet}`);
  
  let currentPeer: LANPeer | null = null;
  let currentRoom: Set<LANPeer> | null = null;
  let isExplicitRoom = false;

  const heartbeat = () => {
    if (currentPeer) {
      currentPeer.lastSeen = Date.now();
    }
  };

  // Heartbeat interval
  const interval = setInterval(() => {
    cleanupInactivePeers();
  }, 5000);

  // Message handler
  ws.on('message', (data) => {
    try {
      // Convert data to string, handling different input types
      let messageStr = '';
      if (Buffer.isBuffer(data)) {
        messageStr = data.toString();
      } else if (data instanceof ArrayBuffer) {
        messageStr = Buffer.from(data).toString();
      } else if (Array.isArray(data)) {
        // Handle array of buffers safely
        messageStr = Array.from(data)
          .map(buf => Buffer.isBuffer(buf) ? buf.toString() : '')
          .join('');
      }
      
      const message = JSON.parse(messageStr);
      
      if (message.type === 'HEARTBEAT') {
        heartbeat();
        return;
      }
      
      const result = handleMessage(ws, message, currentPeer, ip, subnet);
      currentPeer = result.updatedPeer;
      currentRoom = result.currentRoom;
      isExplicitRoom = result.isExplicitRoom;
      
    } catch (error) {
      console.error('[WS] Invalid message format:', error);
    }
  });

  // Close handler
  ws.on('close', (code, reason) => {
    console.log(`[WS] Connection #${connectionCounter} closed with code ${code}, reason: ${reason || 'No reason'}`);
    clearInterval(interval);
    
    handleConnectionClose(currentPeer, currentRoom, isExplicitRoom, subnet);
  });

  // Error handler
  ws.on('error', (error) => {
    console.error(`[WS] Error for connection #${connectionCounter}:`, error);
  });
});

// Heartbeat for server status
setInterval(() => {
  console.log(`[SERVER] Status: ${connectionCounter} total connections, ${rooms.size} subnet rooms, ${explicitRooms.size} explicit rooms`);
  
  let totalSubnetPeers = 0;
  for (const [subnet, room] of rooms.entries()) {
    totalSubnetPeers += room.size;
    console.log(`[SERVER] Subnet room ${subnet}: ${room.size} peers`);
    
    if (room.size > 0) {
      Array.from(room).forEach(peer => {
        console.log(`  - ${peer.name} (${peer.id}) from ${peer.ip}, last seen: ${new Date(peer.lastSeen).toISOString()}`);
      });
    }
  }
  
  let totalExplicitPeers = 0;
  for (const [roomId, room] of explicitRooms.entries()) {
    totalExplicitPeers += room.size;
    console.log(`[SERVER] Explicit room ${roomId}: ${room.size} peers`);
    
    if (room.size > 0) {
      Array.from(room).forEach(peer => {
        console.log(`  - ${peer.name} (${peer.id}) from ${peer.ip}, last seen: ${new Date(peer.lastSeen).toISOString()}`);
      });
    }
  }
  
  console.log(`[SERVER] Total active peers: ${totalSubnetPeers + totalExplicitPeers} (${totalSubnetPeers} in subnet rooms, ${totalExplicitPeers} in explicit rooms)`);
}, 30000);

// Make connectionCounter available to status endpoint
app.locals.connectionCounter = connectionCounter;

// Start the server
server.listen(PORT, BIND_ADDRESS, () => {
  const serverIp = getLocalIpAddress();
  
  console.log(`LAN Server running on port ${PORT}`);
  console.log(`Local IP: ${serverIp}`);
  
  // Use appropriate protocol for logging based on environment
  const protocol = IS_PRODUCTION ? 'wss://' : 'ws://';
  const hostname = IS_PRODUCTION ? 'file-sharing-app-23eq.onrender.com' : serverIp;
  const portDisplay = IS_PRODUCTION ? '' : `:${PORT}`;
  
  console.log(`For other devices, connect to: ${protocol}${hostname}${portDisplay}`);
  console.log(`API available at: http${IS_PRODUCTION ? 's' : ''}://${hostname}${portDisplay}/status`);
  console.log(`Test page available at: http${IS_PRODUCTION ? 's' : ''}://${hostname}${portDisplay}`);
  console.log(`Active network interfaces:`, JSON.stringify(networkInterfaces(), null, 2));
}); 