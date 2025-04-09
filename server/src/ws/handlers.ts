import { WebSocket } from 'ws';
import { LANPeer, PeerMessage } from '../types';
import { PEER_TIMEOUT } from '../config';

// Room storage
export const rooms = new Map<string, Set<LANPeer>>();
export const explicitRooms = new Map<string, Set<LANPeer>>();

/**
 * Handles WebSocket message events
 * @param ws WebSocket connection
 * @param message Message data
 * @param currentPeer Current peer data if already connected
 * @param ip Client's IP address
 * @param subnet Client's subnet
 * @returns Updated peer information if JOIN message
 */
export function handleMessage(
  ws: WebSocket,
  message: PeerMessage,
  currentPeer: LANPeer | null,
  ip: string,
  subnet: string
): { 
  updatedPeer: LANPeer | null, 
  currentRoom: Set<LANPeer> | null,
  isExplicitRoom: boolean
} {
  console.log(`[WS] Message from ${ip}: ${message.type}`);
  
  let updatedPeer = currentPeer;
  let currentRoom = null;
  let isExplicitRoom = false;
  
  switch (message.type) {
    case 'JOIN':
      console.log(`[WS] User ${message.userName || 'Unknown'} (${message.userId}) joining from ${ip} (subnet: ${subnet})`);
      
      // If a roomId is provided, use explicit room
      if (message.roomId) {
        if (!explicitRooms.has(message.roomId)) {
          console.log(`[WS] Creating new explicit room: ${message.roomId}`);
          explicitRooms.set(message.roomId, new Set<LANPeer>());
        }
        
        currentRoom = explicitRooms.get(message.roomId)!;
        isExplicitRoom = true;
        
        // Check if user already exists in this room (reconnecting)
        for (const peer of currentRoom) {
          if (peer.id === message.userId) {
            console.log(`[WS] User ${message.userId} already exists in explicit room ${message.roomId}, removing old connection`);
            currentRoom.delete(peer);
            break;
          }
        }
      } else {
        // Default to subnet-based room for LAN discovery
        if (!rooms.has(subnet)) {
          console.log(`[WS] Creating new room for subnet ${subnet}`);
          rooms.set(subnet, new Set<LANPeer>());
        }
        
        currentRoom = rooms.get(subnet)!;
        isExplicitRoom = false;
        
        // Check if user already exists in this room (reconnecting)
        for (const peer of currentRoom) {
          if (peer.id === message.userId) {
            console.log(`[WS] User ${message.userId} already exists in room ${subnet}, removing old connection`);
            currentRoom.delete(peer);
            break;
          }
        }
      }
      
      updatedPeer = {
        id: message.userId,
        name: message.userName || 'Anonymous',
        peerId: message.peerId || '',
        lastSeen: Date.now(),
        ip,
        subnet,
        ws,
        roomId: message.roomId
      };
      
      currentRoom.add(updatedPeer);
      broadcastPeersToRoom(isExplicitRoom ? message.roomId! : subnet, currentRoom, isExplicitRoom);
      break;
    
    case 'HEARTBEAT':
      // Heartbeat handled outside this function
      break;
      
    case 'MESSAGE':
      if (!currentPeer || !currentPeer.roomId && !rooms.has(subnet)) {
        console.log(`[WS] Cannot relay message: peer not in any room`);
        break;
      }
      
      currentRoom = currentPeer.roomId 
        ? explicitRooms.get(currentPeer.roomId)! 
        : rooms.get(subnet)!;
        
      isExplicitRoom = !!currentPeer.roomId;
      
      console.log(`[WS] Relaying message from ${message.userId} in ${isExplicitRoom ? 'explicit room ' + currentPeer.roomId : 'subnet ' + subnet}: ${message.message?.type}`);
      console.log('[WS] Full message payload:', JSON.stringify(message.message, null, 2));
      
      // If the message has a specific recipient
      if (message.message?.recipient) {
        let recipientFound = false;
        
        // Find the recipient peer in the same room
        for (const peer of currentRoom) {
          if (peer.peerId === message.message.recipient) {
            recipientFound = true;
            
            // Forward the message only to the intended recipient
            if (peer.ws.readyState === WebSocket.OPEN) {
              try {
                peer.ws.send(JSON.stringify(message));
                console.log(`[WS] Message forwarded to recipient ${peer.name} (${peer.peerId})`);
              } catch (error) {
                console.error(`[WS] Error forwarding message to ${peer.name}:`, error);
              }
            } else {
              console.log(`[WS] Recipient ${peer.name} connection not open, cannot deliver`);
            }
            break;
          }
        }
        
        if (!recipientFound) {
          console.log(`[WS] Recipient with peerId ${message.message.recipient} not found in ${isExplicitRoom ? 'explicit room ' + currentPeer.roomId : 'subnet ' + subnet}`);
        }
      } else {
        // Broadcast the message to all peers in the same room except the sender
        console.log(`[WS] Broadcasting message to all peers in ${isExplicitRoom ? 'explicit room ' + currentPeer.roomId : 'subnet ' + subnet} except sender`);
        
        let messagesSent = 0;
        for (const peer of currentRoom) {
          if (peer.id !== message.userId && peer.ws.readyState === WebSocket.OPEN) {
            try {
              peer.ws.send(JSON.stringify(message));
              messagesSent++;
              console.log(`[WS] Message broadcast to ${peer.name}`);
            } catch (error) {
              console.error(`[WS] Error broadcasting message to ${peer.name}:`, error);
            }
          }
        }
        
        console.log(`[WS] Message broadcast to ${messagesSent} peers in ${isExplicitRoom ? 'explicit room ' + currentPeer.roomId : 'subnet ' + subnet}`);
      }
      break;
  }
  
  return { updatedPeer, currentRoom, isExplicitRoom };
}

/**
 * Broadcasts the peer list to all peers in a room
 */
export function broadcastPeersToRoom(roomIdentifier: string, room: Set<LANPeer>, isExplicitRoom: boolean): void {
  const peersList = Array.from(room).map(({ id, name, peerId, lastSeen, ip, subnet, roomId }) => ({ 
    id, 
    name, 
    peerId,
    lastSeen,
    ip,
    subnet,
    roomId
  }));
  
  const message = JSON.stringify({ 
    type: 'PEERS', 
    peers: peersList
  });
  
  console.log(`[WS] Broadcasting peers update to ${isExplicitRoom ? 'explicit room' : 'subnet'} ${roomIdentifier}: ${peersList.length} peers`);
  
  // Send to all peers in the specified room
  room.forEach(peer => {
    if (peer.ws.readyState === WebSocket.OPEN) {
      try {
        peer.ws.send(message);
      } catch (error) {
        console.error(`[WS] Error sending to peer ${peer.name} (${peer.id}):`, error);
      }
    }
  });
}

/**
 * Handles WebSocket connection cleanup when a connection closes
 */
export function handleConnectionClose(
  currentPeer: LANPeer | null,
  currentRoom: Set<LANPeer> | null,
  isExplicitRoom: boolean,
  subnet: string
): void {
  if (currentPeer && currentRoom) {
    if (isExplicitRoom && currentPeer.roomId) {
      console.log(`[WS] Removing peer ${currentPeer.name} (${currentPeer.id}) from explicit room ${currentPeer.roomId}`);
      currentRoom.delete(currentPeer);
      
      // If the room is empty, remove it
      if (currentRoom.size === 0) {
        console.log(`[WS] Explicit room ${currentPeer.roomId} is empty, removing`);
        explicitRooms.delete(currentPeer.roomId);
      } else {
        // Otherwise broadcast updated peer list
        broadcastPeersToRoom(currentPeer.roomId, currentRoom, true);
      }
    } else {
      console.log(`[WS] Removing peer ${currentPeer.name} (${currentPeer.id}) from room ${subnet}`);
      currentRoom.delete(currentPeer);
      
      // If the room is empty, remove it
      if (currentRoom.size === 0) {
        console.log(`[WS] Room for subnet ${subnet} is empty, removing`);
        rooms.delete(subnet);
      } else {
        // Otherwise broadcast updated peer list
        broadcastPeersToRoom(subnet, currentRoom, false);
      }
    }
  }
}

/**
 * Cleans up inactive peers from all rooms
 */
export function cleanupInactivePeers(): void {
  const now = Date.now();
  
  // Check for timed out peers in subnet rooms
  for (const [subnet, room] of rooms.entries()) {
    const timedOutPeers: LANPeer[] = [];
    
    room.forEach(peer => {
      if (now - peer.lastSeen > PEER_TIMEOUT) {
        console.log(`[WS] Peer ${peer.name} (${peer.id}) from ${peer.ip} timed out, removing`);
        timedOutPeers.push(peer);
      }
    });
    
    // Remove timed out peers
    timedOutPeers.forEach(peer => room.delete(peer));
    
    // If the room is empty, delete it
    if (room.size === 0) {
      console.log(`[WS] Room for subnet ${subnet} is empty, removing`);
      rooms.delete(subnet);
    } else {
      // Broadcast updated peer list to this room only
      broadcastPeersToRoom(subnet, room, false);
    }
  }
  
  // Check for timed out peers in explicit rooms
  for (const [roomId, room] of explicitRooms.entries()) {
    const timedOutPeers: LANPeer[] = [];
    
    room.forEach(peer => {
      if (now - peer.lastSeen > PEER_TIMEOUT) {
        console.log(`[WS] Peer ${peer.name} (${peer.id}) from explicit room ${roomId} timed out, removing`);
        timedOutPeers.push(peer);
      }
    });
    
    // Remove timed out peers
    timedOutPeers.forEach(peer => room.delete(peer));
    
    // If the room is empty, delete it
    if (room.size === 0) {
      console.log(`[WS] Explicit room ${roomId} is empty, removing`);
      explicitRooms.delete(roomId);
    } else {
      // Broadcast updated peer list to this room only
      broadcastPeersToRoom(roomId, room, true);
    }
  }
} 