"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import SimplePeer from "simple-peer";
// @ts-expect-error - WebTorrent types might not be perfectly up-to-date
import WebTorrent from 'webtorrent/webtorrent.min.js';
import { nanoid } from 'nanoid';

// RTCConfiguration interface definition
interface RTCConfiguration {
  iceServers?: {
    urls: string | string[];
    username?: string;
    credential?: string;
  }[];
  iceCandidatePoolSize?: number;
  iceTransportPolicy?: 'all' | 'relay';
  bundlePolicy?: 'balanced' | 'max-bundle' | 'max-compat';
  rtcpMuxPolicy?: 'require' | 'negotiate';
}

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
  const progressIntervals = useRef<Record<string, NodeJS.Timeout>>({});

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

      return new Promise((resolve, reject) => {
        client.seed(file, { 
          announce: WEBTORRENT_TRACKERS
        }, (torrent: WebTorrent.Torrent) => {
          if (!torrent) {
            return reject(new Error("Failed to create torrent"));
          }
          console.log("Torrent created:", torrent.infoHash, torrent.magnetURI);
          const newFile: TorrentFile = {
            id: torrent.infoHash, // Use infoHash as ID
            name: file.name,
            size: file.size,
            owner: owner,
            magnetURI: torrent.magnetURI,
            timestamp: new Date().toISOString(),
            torrent: torrent,
            uploading: true, // Mark as uploading initially
            progress: 0, // Start progress at 0
          };

          setSharedFiles((prev) => [newFile, ...prev]);
          
          torrent.on("upload", (/* bytes: number */) => { // Comment out or remove unused 'bytes'
            // Update upload progress for the shared file
            setSharedFiles(prev => prev.map(f => 
              f.id === torrent.infoHash 
                ? { ...f, progress: torrent.progress * 100 } // Update progress based on torrent
                : f
            ));
          });
          
          torrent.on("done", () => {
            console.log("Seeding complete for:", torrent.infoHash);
            setSharedFiles(prev => prev.map(f => 
              f.id === torrent.infoHash 
                ? { ...f, progress: 100, uploading: false } // Mark as complete
                : f
            ));
            toast({
              title: "Seeding Complete",
              description: `${file.name} is now being seeded to the network`,
            });
          });

          torrent.on("error", (err: string | Error) => {
            console.error("Torrent error:", err);
            setSharedFiles(prev => prev.filter(f => f.id !== torrent.infoHash)); // Remove failed torrent
            toast({
              title: "Torrent Error",
              description: getErrorMessage(err),
              variant: "destructive",
            });
            reject(err instanceof Error ? err : new Error(err));
          });

          // Resolve immediately after setting up listeners
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

      return new Promise((resolve, reject) => {
        client.seed(file, { 
          announce: WEBTORRENT_TRACKERS
        }, (torrent: WebTorrent.Torrent) => {
           if (!torrent) {
            return reject(new Error("Failed to create text torrent"));
          }
          const newFile: TorrentFile = {
            id: torrent.infoHash, // Use infoHash as ID
            name: "Text Snippet",
            size: file.size,
            owner: owner,
            magnetURI: torrent.magnetURI,
            timestamp: new Date().toISOString(),
            torrent: torrent,
            uploading: true,
            progress: 100, // Text torrents are small, consider seeded immediately
          };

          setSharedFiles((prev) => [newFile, ...prev]);

          torrent.on("error", (err: string | Error) => {
            console.error("Text Torrent error:", err);
            setSharedFiles(prev => prev.filter(f => f.id !== torrent.infoHash));
            toast({
              title: "Torrent Error",
              description: getErrorMessage(err),
              variant: "destructive",
            });
             reject(err instanceof Error ? err : new Error(err));
          });
          
          resolve(newFile);
        });
      });
    },
    [client, toast]
  );

  // Download a torrent from a magnet link
  const downloadTorrent = useCallback(
    async (magnetURI: string): Promise<void> => {
      if (!client) {
        toast({ title: "Client Error", description: "WebTorrent client not ready.", variant: "destructive" });
        return;
      }

      // Check if already downloading this magnet URI
      if (downloadingFiles.some(f => f.magnetURI === magnetURI)) {
        toast({ title: "Already Downloading", description: "This file is already being downloaded." });
        return;
      }

      try {
        const torrent = client.add(magnetURI, {
          announce: WEBTORRENT_TRACKERS,
        });

        if (!torrent) {
          throw new Error("Failed to add torrent");
        }

        console.log("Adding torrent:", magnetURI);
        
        const newFile: TorrentFile = {
          id: torrent.infoHash || nanoid(), // Use infoHash or generate ID if not available yet
          name: torrent.name || "Loading filename...",
          size: torrent.length || 0,
          owner: "Remote",
          magnetURI: magnetURI,
          timestamp: new Date().toISOString(),
          torrent: torrent,
          downloading: true,
          connecting: true, // Start in connecting state
          progress: 0,
        };

        setDownloadingFiles((prev) => [newFile, ...prev]);

        // Listen for metadata to get the real filename and size
        torrent.on('metadata', () => {
          console.log("Metadata received for:", torrent.infoHash);
          setDownloadingFiles(prev => prev.map(f =>
            f.magnetURI === magnetURI
              ? { 
                  ...f, 
                  id: torrent.infoHash, // Ensure ID is infoHash
                  name: torrent.name, 
                  size: torrent.length,
                  connecting: false // Metadata received, now actually downloading
                } 
              : f
          ));
        });

        torrent.on('ready', () => {
          console.log("Torrent ready:", torrent.infoHash);
           setDownloadingFiles(prev => prev.map(f =>
            f.id === torrent.infoHash
              ? { ...f, connecting: false } // Ensure connecting is false when ready
              : f
          ));
        });
        
        // Clear previous interval if any for this torrent ID
        if (progressIntervals.current[torrent.infoHash]) {
           clearInterval(progressIntervals.current[torrent.infoHash]);
        }

        // Function to update progress
        const updateProgress = () => {
          setDownloadingFiles(prev => prev.map(f =>
            f.id === torrent.infoHash
              ? { 
                  ...f, 
                  progress: torrent.progress * 100,
                  downloadSpeed: torrent.downloadSpeed,
                  downloadedSize: torrent.downloaded
                }
              : f
          ));
        };

        // Set interval to update progress
        progressIntervals.current[torrent.infoHash] = setInterval(updateProgress, 500); // Update every 500ms

        torrent.on('download', updateProgress); // Update immediately on download chunk

        torrent.on('done', () => {
          console.log("Download complete for:", torrent.infoHash);
          clearInterval(progressIntervals.current[torrent.infoHash]);
          delete progressIntervals.current[torrent.infoHash];
          
          setDownloadingFiles(prev => prev.map(f =>
            f.id === torrent.infoHash
              ? { 
                  ...f, 
                  progress: 100, 
                  downloading: false, 
                  downloadSpeed: 0 
                }
              : f
          ));
          toast({ title: "Download Complete", description: `${torrent.name} finished downloading.` });
          
          // Try to get Blob URL for potential preview/opening
          const file = torrent.files[0];
          if (file) {
            file.getBlobURL((err: Error | string | undefined, url: string | undefined) => {
              if (err || !url) {
                console.warn("Could not get Blob URL after download:", err);
                return;
              }
              console.log("File available at Blob URL:", url); // Can be used to open/save
              // Optionally update the file state with the blobUrl if needed elsewhere
              // setDownloadingFiles(prev => prev.map(f => f.id === torrent.infoHash ? { ...f, blobUrl: url } : f));
            });
          }
        });

        torrent.on('error', (err: string | Error) => {
          console.error("Download error:", err);
          clearInterval(progressIntervals.current[torrent.infoHash]);
          delete progressIntervals.current[torrent.infoHash];
          setDownloadingFiles(prev => prev.filter(f => f.id !== torrent.infoHash));
          toast({ title: "Download Error", description: getErrorMessage(err), variant: "destructive" });
        });
        
        torrent.on('wire', (wire: SimplePeer.Instance, addr: string) => { // Use SimplePeer.Instance and string types
           console.log('Connected to peer with address:', addr)
           // You can interact with the 'wire' object here if needed, e.g., wire.remoteAddress
        });

      } catch (err) {
        console.error("Failed to add magnet URI:", err);
        toast({ title: "Error Adding Download", description: getErrorMessage(err), variant: "destructive" });
      }
    },
    [client, toast, downloadingFiles] // Added downloadingFiles dependency
  );
  
  // Cleanup function
  const destroyClient = useCallback(() => {
    clientRef.current?.destroy();
    clientRef.current = null;
    setClient(null);
    setIsClientReady(false);
    setSharedFiles([]);
    setDownloadingFiles([]);
    // Clear all progress intervals
    Object.values(progressIntervals.current).forEach(clearInterval);
    progressIntervals.current = {};
    console.log("WebTorrent client destroyed");
  }, []);

  // Cleanup client on component unmount
  useEffect(() => {
    return () => {
      destroyClient();
    };
  }, [destroyClient]);

  return {
    isClientReady,
    sharedFiles,
    downloadingFiles,
    createTorrent,
    createTextTorrent,
    downloadTorrent,
    destroyClient,
    setSharedFiles,
    setDownloadingFiles
  };
} 