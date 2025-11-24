"use client";

import { useState, useEffect, useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import { nanoid } from "nanoid";
import { useToast } from "@/hooks/use-toast";
import { getServerHttpUrl } from "@/lib/network-utils";
import { gzipSync, gunzipSync } from "fflate";

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
  originalName?: string;
  originalSize?: number;
  originalType?: string;
  compression?: 'gzip' | 'none';
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
  originalName?: string;
  originalSize?: number;
  originalType?: string;
  compression?: 'gzip' | 'none';
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

const COMPRESSIBLE_MIME_PREFIXES = [
  'text/',
  'application/json',
  'application/javascript',
  'application/xml'
];

const ALREADY_COMPRESSED_EXT = /\.(zip|gz|tgz|bz2|xz|7z|rar|mp4|mkv|webm|mov|jpg|jpeg|png|gif|bmp|pdf)$/i;

const shouldCompress = (file: File) => {
  if (ALREADY_COMPRESSED_EXT.test(file.name)) return false;
  if (file.size < 8 * 1024) return false; // avoid overhead on tiny files
  const type = file.type || '';
  return COMPRESSIBLE_MIME_PREFIXES.some(prefix => type.startsWith(prefix));
};

async function compressFileIfUseful(file: File) {
  if (!shouldCompress(file)) {
    return {
      blob: file,
      compression: 'none' as const,
      originalName: file.name,
      originalSize: file.size,
      originalType: file.type || 'application/octet-stream'
    };
  }

  try {
    if (typeof CompressionStream !== 'undefined') {
      const stream = file.stream().pipeThrough(new CompressionStream('gzip'));
      const compressedBlob = await new Response(stream).blob();
      return {
        blob: compressedBlob,
        compression: 'gzip' as const,
        originalName: file.name,
        originalSize: file.size,
        originalType: file.type || 'application/octet-stream'
      };
    }
  } catch (err) {
    console.warn('CompressionStream failed, falling back to fflate', err);
  }

  // Fallback: fflate (synchronous gzip in a worker-like fashion)
  try {
    const arrayBuffer = await file.arrayBuffer();
    const compressed = gzipSync(new Uint8Array(arrayBuffer));
    const blob = new Blob([compressed], { type: 'application/gzip' });
    return {
      blob,
      compression: 'gzip' as const,
      originalName: file.name,
      originalSize: file.size,
      originalType: file.type || 'application/octet-stream'
    };
  } catch (err) {
    console.warn('fflate gzip failed, sending uncompressed', err);
    return {
      blob: file,
      compression: 'none' as const,
      originalName: file.name,
      originalSize: file.size,
      originalType: file.type || 'application/octet-stream'
    };
  }
}

async function maybeDecompressBlob(blob: Blob, compression?: string): Promise<Blob> {
  if (!compression || compression === 'none') return blob;

  if (compression === 'gzip') {
    try {
      if (typeof DecompressionStream !== 'undefined') {
        const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
        return await new Response(stream).blob();
      }
    } catch (err) {
      console.warn('DecompressionStream failed, falling back to fflate', err);
    }

    // Fallback to fflate
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const decompressed = gunzipSync(new Uint8Array(arrayBuffer));
      return new Blob([decompressed]);
    } catch (err) {
      console.error('fflate gunzip failed', err);
      throw err;
    }
  }

  return blob;
}

const hasFileSystemAccess = () =>
  typeof window !== 'undefined' && 'showSaveFilePicker' in window && 'WritableStream' in window;

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
      const compressed = await compressFileIfUseful(file);
      const uploadName = compressed.compression === 'gzip' ? `${file.name}.gz` : file.name;
      const uploadType = compressed.compression === 'gzip' ? 'application/gzip' : file.type || 'application/octet-stream';

      const formData = new FormData();
      formData.append("file", new File([compressed.blob], uploadName, { type: uploadType }));
      formData.append("owner", owner);
      formData.append("originalName", compressed.originalName);
      formData.append("originalSize", String(compressed.originalSize));
      formData.append("originalType", compressed.originalType);
      formData.append("compression", compressed.compression);

      const response = await fetch(buildApiUrl(API_PATHS.shareFile), {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        const reason = response.status === 404
          ? "Iroh endpoints are unavailable on this server. Set NEXT_PUBLIC_IROH_SERVER_URL to a backend with Iroh enabled."
          : `Failed to share file via Iroh (status ${response.status})`;
        throw new Error(reason);
      }

      const data = (await response.json()) as ShareResponse;
      const newFile: TorrentFile = {
        id: data.hash || nanoid(),
        name: data.originalName || data.name || file.name,
        size: data.originalSize || data.size || file.size,
        owner,
        magnetURI: data.ticket,
        timestamp: data.createdAt || new Date().toISOString(),
        uploading: false,
        progress: 100,
        mimeType: data.originalType || data.mimeType || file.type || "application/octet-stream",
        originalName: data.originalName || file.name,
        originalSize: data.originalSize || file.size,
        originalType: data.originalType || file.type || "application/octet-stream",
        compression: data.compression || compressed.compression
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
        const reason = response.status === 404
          ? "Iroh endpoints are unavailable on this server. Set NEXT_PUBLIC_IROH_SERVER_URL to a backend with Iroh enabled."
          : `Failed to share text via Iroh (status ${response.status})`;
        throw new Error(reason);
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
        mimeType: data.mimeType || "text/plain",
        originalName: data.originalName || data.name || "Text Snippet",
        originalSize: data.originalSize || data.size || text.length,
        originalType: data.originalType || data.mimeType || "text/plain",
        compression: data.compression || 'none'
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
        name: metadata?.originalName || metadata?.name || 'Iroh download',
        size: metadata?.originalSize || metadata?.size || 0,
        owner: metadata?.owner || 'Remote peer',
        magnetURI,
        timestamp: new Date().toISOString(),
        downloading: true,
        connecting: true,
        progress: 0,
        mimeType: metadata?.originalType || metadata?.mimeType || 'application/octet-stream',
        originalName: metadata?.originalName || metadata?.name,
        originalSize: metadata?.originalSize || metadata?.size,
        originalType: metadata?.originalType || metadata?.mimeType,
        compression: metadata?.compression || 'none'
      };

      setDownloadingFiles(prev => [placeholder, ...prev]);

      const response = await fetch(buildApiUrl(API_PATHS.download, { ticket: magnetURI }));
      if (!response.ok || !response.body) {
        setDownloadingFiles(prev => prev.filter(file => file.id !== downloadId));
        const reason = response.status === 404
          ? "Iroh endpoints are unavailable on this server. Set NEXT_PUBLIC_IROH_SERVER_URL to a backend with Iroh enabled."
          : `Failed to download ticket (status ${response.status})`;
        throw new Error(reason);
      }

      const compression = response.headers.get('x-compression') || metadata?.compression;
      const fileName =
        decodeHeaderFileName(response.headers.get('x-original-name')) ||
        decodeHeaderFileName(response.headers.get('x-file-name')) ||
        metadata?.originalName ||
        metadata?.name ||
        'iroh-file';
      const originalSizeHeader = Number(response.headers.get('x-original-size'));
      const totalSize = Number(response.headers.get('content-length')) || metadata?.size || 0;
      const trackProgress = (receivedBytes: number) => {
        setDownloadingFiles(prev => prev.map(file =>
          file.id === downloadId
            ? {
                ...file,
                connecting: false,
                progress: totalSize ? (receivedBytes / totalSize) * 100 : file.progress,
                downloadedSize: receivedBytes
              }
            : file
        ));
      };

      const tryStreamToFile = async () => {
        if (!hasFileSystemAccess() || !response.body) return false;
        if (compression === 'gzip' && typeof DecompressionStream === 'undefined') return false;

        try {
          const picker = await (window as any).showSaveFilePicker({ suggestedName: fileName });
          const writable = await picker.createWritable();
          let received = 0;

          const progressStream = new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
              received += chunk.length;
              trackProgress(received);
              controller.enqueue(chunk);
            }
          });

          let stream: ReadableStream<Uint8Array> = response.body.pipeThrough(progressStream);

          if (compression === 'gzip' && typeof DecompressionStream !== 'undefined') {
            stream = stream.pipeThrough(new DecompressionStream('gzip'));
          }

          await stream.pipeTo(writable);
          await writable.close();
          return true;
        } catch (error) {
          console.warn('Streaming download failed, falling back to buffer', error);
          return false;
        }
      };

      const streamed = await tryStreamToFile();
      if (!streamed) {
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let received = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            received += value.length;
            trackProgress(received);
          }
        }

        const compressedBlob = new Blob(chunks, { type: response.headers.get('content-type') || placeholder.mimeType });
        let decompressedBlob: Blob;
        try {
          decompressedBlob = await maybeDecompressBlob(compressedBlob, compression || undefined);
        } catch (error) {
          setDownloadingFiles(prev => prev.filter(file => file.id !== downloadId));
          toast({
            title: 'Decompression failed',
            description: error instanceof Error ? error.message : 'Could not unpack the downloaded file',
            variant: 'destructive'
          });
          return;
        }
        const url = URL.createObjectURL(decompressedBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }

      setDownloadingFiles(prev => prev.map(file =>
        file.id === downloadId
          ? {
              ...file,
              downloading: false,
              connecting: false,
              progress: 100,
              downloadedSize: originalSizeHeader || totalSize || file.downloadedSize || file.size || 0,
              compression: compression === 'gzip' ? 'gzip' : 'none'
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
