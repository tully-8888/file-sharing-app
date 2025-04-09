"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "./use-toast";
import SimplePeer from "simple-peer";
import WebTorrent from "webtorrent";

// Correct window type declarations
declare global {
  interface Window {
    global: typeof globalThis;
    Buffer: typeof Buffer;
    process: typeof process;
    webTorrentClient?: WebTorrent.Instance;
  }
}

// Update process polyfill with modern import
if (typeof window !== 'undefined') {
  window.global = window;
  window.Buffer = window.Buffer || Buffer;
  import('process/browser').then((process) => {
    window.process = window.process || process;
  });
}

export interface TorrentFile {
  id: string;
  name: string;
  size: number;
  owner: string;
  magnetURI: string;
  torrent?: WebTorrent.Torrent;
  progress?: number;
  uploading?: boolean;
  downloading?: boolean;
  connecting?: boolean;
  downloadSpeed?: number;
  downloadedSize?: number;
  timestamp: string;
}

export interface WebTorrentHookReturn {
  isClientReady: boolean;
  sharedFiles: TorrentFile[];
  downloadingFiles: TorrentFile[];
  createTorrent: (file: File, owner: string) => Promise<TorrentFile>;
  createTextTorrent: (text: string, owner: string) => Promise<TorrentFile>;
  downloadTorrent: (magnetURI: string) => Promise<void>;
  destroyClient: () => void;
  setSharedFiles: React.Dispatch<React.SetStateAction<TorrentFile[]>>;
  setDownloadingFiles: React.Dispatch<React.SetStateAction<TorrentFile[]>>;
}

const WEBTORRENT_TRACKERS = [
  "wss://tracker.openwebtorrent.com",
  "wss://tracker.btorrent.xyz",
]

// Function to get additional RTC config if needed (can be expanded with server-provided configuration)
const getRtcConfig = (): RTCConfiguration => {
  // Default STUN servers if you don't have custom TURN servers
  return {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' }
    ]
  };
};

// Helper function to get error message safely
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error occurred';
}

export function useWebTorrent(): WebTorrentHookReturn {
  const [client, setClient] = useState<WebTorrent.Instance | null>(null);
  const [isClientReady, setIsClientReady] = useState(false);
  const [sharedFiles, setSharedFiles] = useState<TorrentFile[]>([]);
  const [downloadingFiles, setDownloadingFiles] = useState<TorrentFile[]>([]);
  const { toast } = useToast();
  const clientRef = useRef<WebTorrent.Instance | null>(null);

  // Initialize WebTorrent client
  useEffect(() => {
    if (typeof window === "undefined") return;

    const initWebTorrent = async () => {
      try {
        const { default: WebTorrentLib } = await import("webtorrent");
        const rtcConfig = getRtcConfig();
        
        const webTorrentClient = new WebTorrentLib({
          tracker: {
            announce: WEBTORRENT_TRACKERS,
            rtcConfig: {
              ...SimplePeer.config,
              ...rtcConfig
            }
          }
        });

        if (process.env.NODE_ENV === 'development') {
          window.webTorrentClient = webTorrentClient;
        }

        setClient(webTorrentClient);
        clientRef.current = webTorrentClient;
        setIsClientReady(true);

        return () => {
          webTorrentClient.destroy();
          setClient(null);
          clientRef.current = null;
        };
      } catch (err) {
        console.error("WebTorrent initialization failed:", err);
        toast({
          title: "WebTorrent Error",
          description: "Failed to initialize file sharing client",
          variant: "destructive",
        });
      }
    };

    initWebTorrent();
  }, [toast]);

  // Create a torrent from a file
  const createTorrent = useCallback(
    async (file: File, owner: string): Promise<TorrentFile> => {
      if (!client) throw new Error("WebTorrent client not initialized");

      return new Promise((resolve) => {
        client.seed(file, { 
          announce: WEBTORRENT_TRACKERS
        }, (torrent: WebTorrent.Torrent) => {
          const newFile: TorrentFile = {
            id: torrent.infoHash,
            name: file.name,
            size: file.size,
            owner: owner,
            magnetURI: torrent.magnetURI,
            timestamp: new Date().toISOString(),
            torrent: torrent,
          };

          setSharedFiles((prev) => [newFile, ...prev]);
          
          // Set up event listeners
          torrent.on("download", () => {
            // Update UI with download progress
          });
          
          torrent.on("upload", () => {
            // Update UI with upload stats
          });
          
          torrent.on("done", () => {
            toast({
              title: "Seeding Complete",
              description: `${file.name} is now being seeded to the network`,
            });
          });

          torrent.on("error", (err: string | Error) => {
            toast({
              title: "Torrent Error",
              description: getErrorMessage(err),
              variant: "destructive",
            });
          });

          resolve(newFile);
        });
      });
    },
    [client, toast]
  );

  // Create a torrent from text content
  const createTextTorrent = useCallback(
    async (text: string, owner: string): Promise<TorrentFile> => {
      if (!client) throw new Error("WebTorrent client not initialized");

      const blob = new Blob([text], { type: "text/plain" });
      const file = new File([blob], "shared-text.txt", { type: "text/plain" });

      return new Promise((resolve) => {
        client.seed(file, { 
          announce: WEBTORRENT_TRACKERS
        }, (torrent: WebTorrent.Torrent) => {
          const newFile: TorrentFile = {
            id: torrent.infoHash,
            name: "Text Snippet",
            size: file.size,
            owner: owner,
            magnetURI: torrent.magnetURI,
            timestamp: new Date().toISOString(),
            torrent: torrent,
          };

          setSharedFiles((prev) => [newFile, ...prev]);
          
          torrent.on("error", (err: string | Error) => {
            toast({
              title: "Torrent Error",
              description: getErrorMessage(err),
              variant: "destructive",
            });
          });

          resolve(newFile);
        });
      });
    },
    [client, toast]
  );

  // Download a torrent from magnetURI
  const downloadTorrent = useCallback(async (magnetURI: string): Promise<void> => {
    if (!client) throw new Error("WebTorrent client not initialized")

    return new Promise<void>((resolve, reject) => {
      try {
        console.log(`[WebTorrent] Starting download process for magnet: ${magnetURI.slice(0, 50)}...`);

        // Don't download if we're already downloading this torrent
        const existingTorrent = client.torrents.find(t => t.magnetURI === magnetURI);
        if (existingTorrent) {
          console.log('[WebTorrent] Torrent already exists in client');
          toast({
            title: "Already downloading",
            description: "This file is already being downloaded",
          });
          return resolve();
        }

        // Create a placeholder file immediately
        const placeholderFile: TorrentFile = {
          id: `connecting-${Date.now()}`,
          name: "Connecting to file...",
          size: 0,
          owner: "Remote",
          magnetURI: magnetURI,
          connecting: true,
          downloading: false,
          progress: 0,
          timestamp: new Date().toISOString()
        };

        console.log('[WebTorrent] Created placeholder file, attempting to connect...');

        // Add placeholder to downloading files
        setDownloadingFiles(prev => [placeholderFile, ...prev]);

        const torrent = client.add(magnetURI, { announce: WEBTORRENT_TRACKERS }, (torrent) => {
          console.log(`[WebTorrent] Connected successfully! Torrent info:`, {
            name: torrent.name,
            size: torrent.length,
            peers: torrent.numPeers,
            infoHash: torrent.infoHash
          });

          // Remove placeholder and add actual file
          setDownloadingFiles(prev => {
            const withoutPlaceholder = prev.filter(f => f.id !== placeholderFile.id);
            const newFile: TorrentFile = {
              id: torrent.infoHash,
              name: torrent.name || "Unknown",
              size: torrent.length,
              owner: "Remote",
              magnetURI: torrent.magnetURI,
              torrent: torrent,
              downloading: true,
              connecting: false,
              progress: 0,
              downloadSpeed: 0,
              downloadedSize: 0,
              timestamp: new Date().toISOString()
            };
            return [newFile, ...withoutPlaceholder];
          });

          // Set up torrent event listeners for detailed tracking
          torrent.on('warning', (err) => {
            console.warn(`[WebTorrent] Warning for ${torrent.name}:`, err);
          });

          torrent.on('wire', (wire, addr) => {
            console.log(`[WebTorrent] Connected to peer for ${torrent.name}:`, {
              address: addr,
              totalPeers: torrent.numPeers
            });
          });

          // Update download progress
          const updateProgress = () => {
            if (torrent) {
              const progress = Math.round(torrent.progress * 100);
              const speed = torrent.downloadSpeed;
              const downloaded = torrent.downloaded;
              
              if (progress % 10 === 0) { // Log every 10% progress
                console.log(`[WebTorrent] Download progress for ${torrent.name}:`, {
                  progress: `${progress}%`,
                  speed: `${(speed / (1024 * 1024)).toFixed(2)} MB/s`,
                  downloaded: `${(downloaded / (1024 * 1024)).toFixed(2)} MB`,
                  peers: torrent.numPeers
                });
              }

              setDownloadingFiles(prev => 
                prev.map(f => {
                  if (f.id === torrent.infoHash) {
                    return {
                      ...f,
                      progress,
                      downloadSpeed: speed,
                      downloadedSize: downloaded
                    };
                  }
                  return f;
                })
              );
            }
          };

          // Update progress every 500ms
          const progressInterval = setInterval(updateProgress, 500);

          // Handle download completion
          torrent.on('done', () => {
            console.log(`[WebTorrent] Download completed for ${torrent.name}`, {
              size: `${(torrent.length / (1024 * 1024)).toFixed(2)} MB`,
              timeElapsed: `${((Date.now() - Number(placeholderFile.timestamp)) / 1000).toFixed(1)}s`
            });

            clearInterval(progressInterval);
            
            setDownloadingFiles(prev => 
              prev.map(f => {
                if (f.id === torrent.infoHash) {
                  return {
                    ...f,
                    downloading: false,
                    progress: 100
                  };
                }
                return f;
              })
            );

            // Get file
            const torrentFile = torrent.files[0];
            
            // Create download link programmatically
            torrentFile.getBlobURL((err, url) => {
              if (err) {
                console.error("[WebTorrent] Error getting blob URL:", err);
                return;
              }
              
              if (!url) {
                console.error("[WebTorrent] No URL returned from getBlobURL");
                return;
              }
              
              const a = document.createElement("a");
              a.href = url;
              a.download = torrentFile.name;
              document.body.appendChild(a);
              a.click();
              setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }, 100);
            });

            resolve();
          });

          // Handle errors
          torrent.on('error', (err) => {
            console.error(`[WebTorrent] Error in torrent ${torrent.name}:`, {
              error: err,
              magnetURI: magnetURI.slice(0, 50),
              infoHash: torrent.infoHash
            });

            clearInterval(progressInterval);
            
            setDownloadingFiles(prev => 
              prev.filter(f => f.id !== torrent.infoHash)
            );

            toast({
              title: "Download Error",
              description: getErrorMessage(err),
              variant: "destructive",
            });
            
            reject(err);
          });
        });

        // Handle initial connection errors
        torrent.on('error', (err) => {
          console.error('[WebTorrent] Initial connection error:', {
            error: err,
            magnetURI: magnetURI.slice(0, 50)
          });

          // Remove the placeholder file
          setDownloadingFiles(prev => 
            prev.filter(f => f.id !== placeholderFile.id)
          );

          toast({
            title: "Download Error",
            description: getErrorMessage(err),
            variant: "destructive",
          });
          reject(err);
        });
      } catch (err) {
        console.error('[WebTorrent] Unexpected error:', err);
        reject(err);
      }
    });
  }, [client, setDownloadingFiles, toast]);

  // Cleanup function
  const destroyClient = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.destroy();
      setClient(null);
      clientRef.current = null;
      setIsClientReady(false);
    }
  }, []);

  return {
    isClientReady,
    sharedFiles,
    downloadingFiles,
    createTorrent,
    createTextTorrent,
    downloadTorrent,
    destroyClient,
    setSharedFiles,
    setDownloadingFiles,
  };
} 