import { IncomingMessage } from 'http';
import { Request } from 'express';
import { networkInterfaces } from 'os';

const TRUST_PROXY = process.env.TRUST_PROXY === 'true';

/**
 * Gets the IP address from request object
 * @param {IncomingMessage | Request} request - HTTP request object
 * @returns {string} IP address
 */
export function getIp(request: IncomingMessage | Request): string {
  let forwarded = request.headers['x-forwarded-for'] || '';
  if (Array.isArray(forwarded)) {
    forwarded = forwarded.join(',');
  }

  // For Express Request objects
  let ip = (request as Request).ip || '';
  
  // If not available or using standard http IncomingMessage
  if (!ip) {
    const forwardedIp = TRUST_PROXY
      ? (forwarded as string).split(',').shift() || ''
      : '';
    
    // Fall back to socket remote address
    ip = forwardedIp || request.socket.remoteAddress || '';
  }

  // Convert localhost IPv6 notation to IPv4
  if (ip === '::1' || ip === '::ffff:127.0.0.1') {
    ip = '127.0.0.1';
  }

  return ip;
}

/**
 * Gets the local IP address of the machine
 * @returns {string} The first non-internal IPv4 address or fallback
 */
export function getLocalIpAddress(): string {
  const interfaces = networkInterfaces();
  
  // Try to find a non-internal IPv4 address
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  
  // If no non-internal IPv4 address is found, use 0.0.0.0
  console.warn('No non-internal IPv4 address found, using 0.0.0.0 (all interfaces)');
  return '0.0.0.0';
}

/**
 * Extract subnet from IP address (e.g., 192.168.1.x → 192.168.1)
 */
export function extractSubnet(ip: string): string {
  const parts = ip.split('.');
  if (parts.length !== 4) return 'unknown';
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
} 