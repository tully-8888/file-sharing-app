"use client";

import { useState, useEffect, useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import { nanoid } from "nanoid";
import { useToast } from "@/hooks/use-toast";
import { getServerHttpUrl } from "@/lib/network-utils";

export interface TorrentFile {
  id: string;
  name: string;
  size: number;
  owner: string;
  magnetURI: string;
  torrent?: unknown;
  progress?: number;
  uploading?: boolean;
  downloading?: boolean;
  connecting?: boolean;
  downloadSpeed?: number;
  downloadedSize?: number;
  timestamp: string;
  mimeType?: string;
}

export interface WebTorrentHookReturn {
  isClientReady: boolean;
  sharedFiles: TorrentFile[];
  downloadingFiles: TorrentFile[];
  createTorrent: (file: File, owner: string) => Promise<TorrentFile>;
  createTextTorrent: (text: string, owner: string) => Promise<TorrentFile>;
  downloadTorrent: (magnetURI: string) => Promise<void>;
  destroyClient: () => void;
  setSharedFiles: Dispatch<SetStateAction<TorrentFile[]>>;
  setDownloadingFiles: Dispatch<SetStateAction<TorrentFile[]>>;
}

interface ShareResponse {
  hash: string;
  name: string;
  size: number;
  ticket: string;
  mimeType?: string;
  owner?: string;
  createdAt?: string;
}

interface InspectResponse extends ShareResponse {
  downloadUrlTicket: string;
}

const API_PATHS = {
  shareFile: "/iroh/share-file",
  shareText: "/iroh/share-text",
  inspect: "/iroh/inspect",
  download: "/iroh/download"
};

const buildApiUrl = (path: string, params?: Record<string, string>) => {
  const base = getServerHttpUrl().replace(/\/$/, "");
  const query = params ? `?${new URLSearchParams(params).toString()}` : "";
  return `${base}${path}${query}`;
};

const decodeHeaderFileName = (value: string | null): string | undefined => {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export function useWebTorrent(): WebTorrentHookReturn {
  const [isClientReady, setIsClientReady] = useState(false);
  const [sharedFiles, setSharedFiles] = useState<TorrentFile[]>([]);
  const [downloadingFiles, setDownloadingFiles] = useState<TorrentFile[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    setIsClientReady(true);
  }, []);

  const createTorrent = useCallback(
    async (file: File, owner: string): Promise<TorrentFile> => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("owner", owner);

      const response = await fetch(buildApiUrl(API_PATHS.shareFile), {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        throw new Error("Failed to share file via Iroh");
      }

      const data = (await response.json()) as ShareResponse;
      const newFile: TorrentFile = {
        id: data.hash || nanoid(),
        name: data.name || file.name,
        size: data.size || file.size,
        owner,
        magnetURI: data.ticket,
        timestamp: data.createdAt || new Date().toISOString(),
        uploading: false,
        progress: 100,
        mimeType: data.mimeType || file.type || "application/octet-stream"
      };

      setSharedFiles(prev => [newFile, ...prev]);
      return newFile;
    },
    []
  );

  const createTextTorrent = useCallback(
    async (text: string, owner: string): Promise<TorrentFile> => {
      const response = await fetch(buildApiUrl(API_PATHS.shareText), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ text, owner })
      });

      if (!response.ok) {
        throw new Error("Failed to share text via Iroh");
      }

      const data = (await response.json()) as ShareResponse;

      const newFile: TorrentFile = {
        id: data.hash || nanoid(),
        name: data.name || "Text Snippet",
        size: data.size || text.length,
        owner,
        magnetURI: data.ticket,
        timestamp: data.createdAt || new Date().toISOString(),
        uploading: false,
        progress: 100,
        mimeType: data.mimeType || "text/plain"
      };

      setSharedFiles(prev => [newFile, ...prev]);
      return newFile;
    },
    []
  );

  const downloadTorrent = useCallback(
    async (magnetURI: string): Promise<void> => {
      if (!magnetURI) {
        toast({
          title: "Missing ticket",
          description: "A valid Iroh ticket is required to download",
          variant: "destructive"
        });
        return;
      }

      let metadata: InspectResponse | null = null;
      try {
        const inspectResponse = await fetch(
          buildApiUrl(API_PATHS.inspect, { ticket: magnetURI })
        );
        if (inspectResponse.ok) {
          metadata = (await inspectResponse.json()) as InspectResponse;
        }
      } catch (error) {
        console.warn("[Iroh] Inspect failed", error);
      }

      const downloadId = metadata?.hash || nanoid();
      const placeholder: TorrentFile = {
        id: downloadId,
        name: metadata?.name || 'Iroh download',
        size: metadata?.size || 0,
        owner: metadata?.owner || 'Remote peer',
        magnetURI,
        timestamp: new Date().toISOString(),
        downloading: true,
        connecting: true,
        progress: 0,
        mimeType: metadata?.mimeType || 'application/octet-stream'
      };

      setDownloadingFiles(prev => [placeholder, ...prev]);

      const response = await fetch(buildApiUrl(API_PATHS.download, { ticket: magnetURI }));
      if (!response.ok || !response.body) {
        setDownloadingFiles(prev => prev.filter(file => file.id !== downloadId));
        throw new Error("Failed to download ticket");
      }

      const fileName = decodeHeaderFileName(response.headers.get('x-file-name')) || metadata?.name || 'iroh-file';
      const totalSize = Number(response.headers.get('content-length')) || metadata?.size || 0;
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          received += value.length;
          setDownloadingFiles(prev => prev.map(file =>
            file.id === downloadId
              ? {
                  ...file,
                  connecting: false,
                  progress: totalSize ? (received / totalSize) * 100 : file.progress,
                  downloadedSize: received,
                  downloadSpeed: value.length
                }
              : file
          ));
        }
      }

      const blob = new Blob(chunks, { type: response.headers.get('content-type') || placeholder.mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setDownloadingFiles(prev => prev.map(file =>
        file.id === downloadId
          ? {
              ...file,
              downloading: false,
              connecting: false,
              progress: 100,
              downloadedSize: received
            }
          : file
      ));
    },
    [toast]
  );

  const destroyClient = useCallback(() => {
    setSharedFiles([]);
    setDownloadingFiles([]);
    setIsClientReady(false);
    setTimeout(() => setIsClientReady(true), 0);
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
    setDownloadingFiles
  };
}
