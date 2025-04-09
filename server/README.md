# File Sharing App Server

A WebSocket-based LAN file sharing server that enables peer discovery and communication.

## Features

- LAN peer discovery via subnet detection
- Explicit room creation for direct connections
- WebSocket-based real-time communication
- REST API for status and room management

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm 9+

### Installation

```bash
# Install dependencies
npm install
```

### Development

```bash
# Start in development mode with auto-restart
npm run dev
```

### Production

```bash
# Build the TypeScript files
npm run build

# Start the server
npm start
```

## API Endpoints

- `GET /` - Home page with WebSocket connection test UI
- `GET /status` - Server status and connected peers
- `GET /ip` - Server IP address information
- `GET /create-room` - Create a new explicit room

## WebSocket Messages

- `JOIN` - Join a subnet-based or explicit room
- `HEARTBEAT` - Keep connection alive
- `MESSAGE` - Send a message to peers in the room

## Configuration

Configuration constants are stored in `src/config.ts`. The main configurable options are:

- `PORT` - Server port (default: 3005)
- `PEER_TIMEOUT` - Peer inactivity timeout in ms (default: 30000)
- `IS_PRODUCTION` - Production environment flag 