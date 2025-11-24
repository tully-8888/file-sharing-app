const HOSTED_FALLBACK_DOMAIN = 'file-sharing-app-23eq.onrender.com';
const HOSTED_FRONTEND_HOSTS = ['netlify.app', 'render.com', 'onrender.com', 'vercel.app'];

const isHostedFrontend = (): boolean => {
  if (typeof window === 'undefined') return false;
  return HOSTED_FRONTEND_HOSTS.some(domain => window.location.hostname.includes(domain));
};

/**
 * Gets WebSocket URL for LAN server based on environment variables or current host
 * @returns {string} WebSocket URL for LAN server
 */
export function getWebSocketUrl(): string {
  // Use environment variables if available
  const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL;
  
  // If deployed server URL is provided, use that
  if (serverUrl) {
    try {
      const parsed = new URL(serverUrl);
      const isSecure = parsed.protocol === 'https:' || parsed.protocol === 'wss:';
      const protocol = isSecure ? 'wss://' : 'ws://';
      const hostWithPort = parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;

      // If the provided URL is non-secure and lacks an explicit port, append LAN port env for dev.
      if (!isSecure && !parsed.port) {
        const port = process.env.NEXT_PUBLIC_LAN_SERVER_PORT || '3005';
        return `${protocol}${hostWithPort}:${port}`;
      }

      return `${protocol}${hostWithPort}`;
    } catch {
      // Fall back to previous behaviour if parsing fails
      const protocol = serverUrl.startsWith('https://') ? 'wss://' : 'ws://';
      const domain = serverUrl.replace(/^https?:\/\//, '');
      const port = process.env.NEXT_PUBLIC_LAN_SERVER_PORT || '3005';
      return protocol === 'wss://' ? `${protocol}${domain}` : `${protocol}${domain}:${port}`;
    }
  }

  // Hosted static frontends (Netlify/Render/Vercel) should default to the Render backend
  if (isHostedFrontend()) {
    return `wss://${HOSTED_FALLBACK_DOMAIN}`;
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

/**
 * Determine the HTTP base URL for talking to the LAN/Iroh server.
 */
export function getServerHttpUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SERVER_URL;
  if (configured) {
    return configured.replace(/\/$/, '');
  }

  if (isHostedFrontend()) {
    return `https://${HOSTED_FALLBACK_DOMAIN}`;
  }

  const port = process.env.NEXT_PUBLIC_LAN_SERVER_PORT || '3005';

  if (typeof window !== 'undefined') {
    const isSecure = window.location.protocol === 'https:';
    const protocol = isSecure ? 'https://' : 'http://';
    const hostname = window.location.hostname;
    if (isSecure) {
      return `${protocol}${hostname}`;
    }
    return `${protocol}${hostname}:${port}`;
  }

  return `http://localhost:${port}`;
}
