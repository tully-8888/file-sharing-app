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
 * Prefers explicit env overrides. Hosted static frontends default to the
 * Render backend because the static host has no Iroh HTTP endpoints.
 */
export function getServerHttpUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_IROH_SERVER_URL || process.env.NEXT_PUBLIC_SERVER_URL;
  if (explicit) {
    try {
      const parsed = new URL(explicit);
      const protocol = parsed.protocol === 'https:' ? 'https://' : 'http://';
      const hostWithPort = parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
      return `${protocol}${hostWithPort}`.replace(/\/$/, '');
    } catch {
      return explicit.replace(/\/$/, '');
    }
  }

  // Hosted static frontends (Netlify/Render/Vercel) have no local server; default to the Render backend
  if (isHostedFrontend()) {
    return `https://${HOSTED_FALLBACK_DOMAIN}`;
  }

  if (typeof window !== 'undefined') {
    const loc = new URL(window.location.href);
    const isSecure = loc.protocol === 'https:';
    const hostname = loc.hostname;
    const port = process.env.NEXT_PUBLIC_LAN_SERVER_PORT || '3005';

    if (isSecure) {
      const hostWithPort = loc.port ? `${hostname}:${loc.port}` : hostname;
      return `${loc.protocol}//${hostWithPort}`.replace(/\/$/, '');
    }

    // For non-secure origins (local dev), always talk to the LAN server port
    return `${loc.protocol}//${hostname}:${port}`.replace(/\/$/, '');
  }

  const port = process.env.NEXT_PUBLIC_LAN_SERVER_PORT || '3005';
  return `http://localhost:${port}`;
}
