import { Request, Response } from 'express';
import { networkInterfaces } from 'os';
import { rooms, explicitRooms } from '../ws/handlers';
import { getLocalIpAddress } from '../utils/network';

/**
 * Get server status including rooms and connected peers
 */
export function getStatus(_: Request, res: Response): void {
  const subnetRoomsInfo = Array.from(rooms.entries()).map(([subnet, room]) => ({
    subnet,
    peerCount: room.size,
    peers: Array.from(room).map(({ id, name, peerId, ip, lastSeen, subnet }) => ({
      id,
      name,
      peerId,
      ip,
      subnet,
      lastSeen
    }))
  }));
  
  const explicitRoomsInfo = Array.from(explicitRooms.entries()).map(([roomId, room]) => ({
    roomId,
    peerCount: room.size,
    peers: Array.from(room).map(({ id, name, peerId, ip, lastSeen, roomId }) => ({
      id,
      name,
      peerId,
      ip,
      roomId,
      lastSeen
    }))
  }));
  
  res.json({
    status: 'online',
    connections: 0, // This will be updated in the main file
    subnetRoomCount: rooms.size,
    explicitRoomCount: explicitRooms.size,
    totalPeers: subnetRoomsInfo.reduce((acc, room) => acc + room.peerCount, 0) + 
               explicitRoomsInfo.reduce((acc, room) => acc + room.peerCount, 0),
    subnetRooms: subnetRoomsInfo,
    explicitRooms: explicitRoomsInfo
  });
}

/**
 * Get server IP address information
 */
export function getIpInfo(_: Request, res: Response): void {
  const serverIp = getLocalIpAddress();
  res.json({
    ip: serverIp,
    wsUrl: `ws://${serverIp}:3005`,
    interfaces: networkInterfaces()
  });
}

/**
 * Render the home page with connection test UI
 */
export function getHomePage(_: Request, res: Response): void {
  const serverIp = getLocalIpAddress();
  
  res.send(`
    <html>
      <head>
        <title>AirShare LAN Server</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          pre { background: #f5f5f5; padding: 10px; border-radius: 5px; overflow: auto; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
          th { background-color: #f5f5f5; }
          .room { margin-bottom: 30px; border: 1px solid #ddd; padding: 15px; border-radius: 5px; }
          h3 { margin-top: 0; }
          .create-room { margin: 20px 0; padding: 10px; background: #f0f0f0; border-radius: 5px; }
          button { padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; }
          button:hover { background: #45a049; }
          input { padding: 8px; margin-right: 10px; border: 1px solid #ddd; border-radius: 4px; }
        </style>
      </head>
      <body>
        <h1>AirShare LAN Server</h1>
        <p>Server is running. The following endpoints are available:</p>
        <ul>
          <li><a href="/status">/status</a> - View server status</li>
          <li><a href="/ip">/ip</a> - View server IP information</li>
          <li><a href="/create-room">/create-room</a> - Create a new room</li>
        </ul>
        <p>Connect to the WebSocket server at: <code>ws://${serverIp}:3005</code></p>
        
        <div class="create-room">
          <h2>Create or Join Room</h2>
          <div>
            <button id="createRoomBtn">Create New Room</button>
            <div id="roomResult" style="margin-top: 10px;"></div>
          </div>
          <div style="margin-top: 15px;">
            <input id="roomIdInput" placeholder="Enter Room ID" />
            <button id="joinRoomBtn">Join Room</button>
          </div>
        </div>
        
        <h2>Testing WebSocket Connection</h2>
        <p>Open browser console to see connection status.</p>
        <pre id="status">Connecting...</pre>
        
        <h2>Current Room</h2>
        <div id="rooms">Loading...</div>
        
        <script>
          const statusEl = document.getElementById('status');
          const roomsEl = document.getElementById('rooms');
          const createRoomBtn = document.getElementById('createRoomBtn');
          const roomResult = document.getElementById('roomResult');
          const roomIdInput = document.getElementById('roomIdInput');
          const joinRoomBtn = document.getElementById('joinRoomBtn');
          
          let myRoomId = null;
          let mySubnet = null;
          let ws = null;
          
          statusEl.textContent = 'Not connected';
          
          // Create room function
          createRoomBtn.addEventListener('click', async () => {
            try {
              const response = await fetch('/create-room');
              const data = await response.json();
              roomResult.innerHTML = \`Room created! ID: <strong>\${data.roomId}</strong>\`;
              roomIdInput.value = data.roomId;
            } catch (error) {
              console.error('Error creating room:', error);
              roomResult.textContent = 'Error creating room: ' + error.message;
            }
          });
          
          // Join room function
          joinRoomBtn.addEventListener('click', () => {
            const roomId = roomIdInput.value.trim();
            if (!roomId) {
              alert('Please enter a room ID');
              return;
            }
            
            connectToWebSocket(roomId);
          });
          
          function updatePeersList(peers) {
            if (peers.length === 0) {
              roomsEl.innerHTML = '<p>No peers connected in your room</p>';
              return;
            }
            
            // Update room identification
            if (myRoomId) {
              mySubnet = null; // If we're in an explicit room, ignore subnet
            } else if (!mySubnet && peers.length > 0) {
              mySubnet = peers[0].subnet;
            }
            
            const roomIdentifier = myRoomId || mySubnet || 'Unknown';
            
            let html = '<div class="room">';
            html += '<h3>Your Room: ' + (myRoomId ? 'ID: ' + myRoomId : 'Subnet: ' + mySubnet) + '</h3>';
            html += '<table>';
            html += '<tr><th>Name</th><th>ID</th><th>Peer ID</th><th>IP</th><th>Last Seen</th></tr>';
            
            peers.forEach(peer => {
              const lastSeen = new Date(peer.lastSeen).toLocaleTimeString();
              html += '<tr>' +
                '<td>' + peer.name + '</td>' +
                '<td>' + peer.id.substring(0, 8) + '...</td>' +
                '<td>' + peer.peerId.substring(0, 8) + '...</td>' +
                '<td>' + (peer.ip || 'Unknown') + '</td>' +
                '<td>' + lastSeen + '</td>' +
                '</tr>';
            });
            
            html += '</table></div>';
            roomsEl.innerHTML = html;
          }
          
          function connectToWebSocket(roomId = null) {
            // Close existing connection if any
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.close();
            }
            
            myRoomId = roomId;
            statusEl.textContent = 'Attempting connection...';
            
            try {
              ws = new WebSocket(\`\${window.location.protocol === 'https:' ? 'wss://' : 'ws://'}\${window.location.hostname}\${window.location.protocol === 'https:' ? '' : ':3005'}\`);
              
              ws.onopen = () => {
                statusEl.textContent = 'Connected to WebSocket server!';
                console.log('Connected to WebSocket server');
                
                // Generate a unique user ID
                const userId = 'browser-test-' + Date.now();
                
                // Send JOIN message with room ID if provided
                const joinMessage = {
                  type: 'JOIN',
                  userId: userId,
                  userName: 'Browser Test',
                  peerId: 'browser-test-peer-' + Date.now().toString(36),
                };
                
                if (roomId) {
                  joinMessage.roomId = roomId;
                }
                
                ws.send(JSON.stringify(joinMessage));
              };
              
              ws.onclose = () => {
                statusEl.textContent = 'Disconnected from WebSocket server.';
                console.log('Disconnected from WebSocket server');
              };
              
              ws.onerror = (err) => {
                statusEl.textContent = 'Error connecting to WebSocket server!';
                console.error('WebSocket error:', err);
              };
              
              ws.onmessage = (event) => {
                console.log('Received message:', JSON.parse(event.data));
                const data = JSON.parse(event.data);
                if (data.type === 'PEERS') {
                  statusEl.textContent = 'Connected! Current peers in your room: ' + data.peers.length;
                  updatePeersList(data.peers);
                }
              };
              
              // Heartbeat
              setInterval(() => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'HEARTBEAT', userId: 'browser-test-' + Date.now() }));
                }
              }, 10000);
              
            } catch (err) {
              statusEl.textContent = 'Error: ' + err.message;
              console.error('Error initializing WebSocket:', err);
            }
          }
          
          // Auto-connect without a room ID (default to subnet-based for LAN)
          connectToWebSocket();
        </script>
      </body>
    </html>
  `);
} 