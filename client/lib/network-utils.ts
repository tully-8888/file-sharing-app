/**
 * Gets WebSocket URL for LAN server based on environment variables or current host
 * @returns {string} WebSocket URL for LAN server
 */
export function getWebSocketUrl(): string {
  // Use environment variables if available
  const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL;
  
  // If deployed server URL is provided, use that
  if (serverUrl) {
    // Determine protocol (wss for https, ws for http)
    const protocol = serverUrl.startsWith('https://') ? 'wss://' : 'ws://';
    const domain = serverUrl.replace(/^https?:\/\//, '');
    
    // Don't append port if it's a secure production environment
    if (protocol === 'wss://') {
      return `${protocol}${domain}`;
    }
    
    // For local non-secure environment, include the port
    const port = process.env.NEXT_PUBLIC_LAN_SERVER_PORT || '3005';
    return `${protocol}${domain}:${port}`;
  }
  
  // For local development
  const hostIp = process.env.NEXT_PUBLIC_HOST_IP;
  const port = process.env.NEXT_PUBLIC_LAN_SERVER_PORT || '3005';
  
  // Check if we're in browser context and if the page is secure
  const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const protocol = isSecure ? 'wss://' : 'ws://';
  
  let baseUrl = '';
  
  if (hostIp) {
    baseUrl = `${protocol}${hostIp}:${port}`;
  } else if (typeof window !== 'undefined') {
    // Fallback to using the current hostname from window.location
    const hostname = window.location.hostname;
    baseUrl = `${protocol}${hostname}:${port}`;
  } else {
    // Last resort fallback
    baseUrl = 'ws://localhost:3005';
  }
  
  return baseUrl;
} 