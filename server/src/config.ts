/**
 * Server configuration constants
 */

// Environment flags
export const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Connection settings
export const PEER_TIMEOUT = 30000; // 30 seconds
export const PORT = Number(process.env.PORT || 3005);
export const BIND_ADDRESS = '0.0.0.0'; // Explicitly bind to all interfaces

// WebSocket settings
export const WS_OPTIONS = {
  perMessageDeflate: {
    zlibDeflateOptions: {
      chunkSize: 1024,
      memLevel: 7,
      level: 3
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024
    },
    threshold: 1024 // Only compress messages larger than 1KB
  }
}; 