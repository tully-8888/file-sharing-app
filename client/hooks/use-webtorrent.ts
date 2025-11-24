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
  compressedSize?: number;
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

const DOWNLOAD_CHUNK_SIZE = 512 * 1024; // 512KB chunks strike balance between overhead and throughput
const MAX_PARALLEL_CHUNKS = 4;
const MAX_CHUNK_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 400;

const compressionWorthwhile = (original: number, compressed: number) => compressed < original * 0.9;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const waitForOnline = () =>
  typeof window === 'undefined' || navigator.onLine
    ? Promise.resolve()
    : new Promise<void>(resolve => window.addEventListener('online', () => resolve(), { once: true }));
const chooseChunkSize = (bytes: number) => (bytes > 200 * 1024 * 1024 ? 1024 * 1024 : DOWNLOAD_CHUNK_SIZE);

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
      if (!compressionWorthwhile(file.size, compressedBlob.size)) {
        return {
          blob: file,
          compression: 'none' as const,
          originalName: file.name,
          originalSize: file.size,
          originalType: file.type || 'application/octet-stream'
        };
      }
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
    if (!compressionWorthwhile(file.size, blob.size)) {
      return {
        blob: file,
        compression: 'none' as const,
        originalName: file.name,
        originalSize: file.size,
        originalType: file.type || 'application/octet-stream'
      };
    }
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

  const saveBlobToDisk = useCallback(async (blob: Blob, fileName: string) => {
    if (hasFileSystemAccess()) {
      try {
        const picker = await (window as any).showSaveFilePicker({ suggestedName: fileName });
        const writable = await picker.createWritable();
        await blob.stream().pipeTo(writable);
        await writable.close();
        return;
      } catch (error) {
        console.warn('FileSystem API save failed, falling back to link download', error);
      }
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

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

      const downloadUrl = buildApiUrl(API_PATHS.download, { ticket: magnetURI });

      const parseNumberHeader = (headers: Headers | null, key: string) => {
        if (!headers) return undefined;
        const value = headers.get(key);
        const num = value ? Number(value) : NaN;
        return Number.isFinite(num) ? num : undefined;
      };

      let head: Response | null = null;
      try {
        head = await fetch(downloadUrl, { method: 'HEAD' });
      } catch (error) {
        console.warn('HEAD download metadata failed, will fallback', error);
      }

      const compressedSize = parseNumberHeader(head?.headers ?? null, 'x-compressed-size')
        ?? parseNumberHeader(head?.headers ?? null, 'content-length')
        ?? metadata?.compressedSize
        ?? metadata?.size;
      const compression = head?.headers.get('x-compression') || metadata?.compression || 'none';
      const fileName =
        decodeHeaderFileName(head?.headers.get('x-original-name')) ||
        decodeHeaderFileName(head?.headers.get('x-file-name')) ||
        metadata?.originalName ||
        metadata?.name ||
        'iroh-file';
      const originalSizeHeader = parseNumberHeader(head?.headers ?? null, 'x-original-size') || metadata?.originalSize;
      const acceptRanges = head?.headers.get('accept-ranges') === 'bytes';
      const contentType = head?.headers.get('content-type') || metadata?.mimeType || 'application/octet-stream';

      const trackProgress = (receivedBytes: number) => {
        setDownloadingFiles(prev => prev.map(file =>
          file.id === downloadId
            ? {
                ...file,
                connecting: false,
                progress: compressedSize ? (receivedBytes / compressedSize) * 100 : file.progress,
                downloadedSize: receivedBytes
              }
            : file
        ));
      };

      const attemptChunkedDownload = async (): Promise<boolean> => {
        if (!compressedSize || !acceptRanges) return false;

        const chunkSize = chooseChunkSize(compressedSize);
        const chunkCount = Math.ceil(compressedSize / chunkSize);
        const chunks = new Array<Uint8Array>(chunkCount);
        let downloaded = 0;
        let nextIndex = 0;

        const fetchChunk = async (index: number) => {
          const start = index * chunkSize;
          const end = Math.min(compressedSize - 1, start + chunkSize - 1);
          let attempt = 0;

          while (attempt < MAX_CHUNK_RETRIES) {
            try {
              const resp = await fetch(downloadUrl, {
                headers: { Range: `bytes=${start}-${end}` }
              });

              if (!(resp.ok || resp.status === 206)) {
                throw new Error(`Chunk ${index} failed with status ${resp.status}`);
              }

              const buffer = new Uint8Array(await resp.arrayBuffer());
              chunks[index] = buffer;
              downloaded += buffer.length;
              trackProgress(downloaded);
              return;
            } catch (error) {
              attempt += 1;
              if (!navigator.onLine) {
                await waitForOnline();
              }
              await sleep(RETRY_BASE_DELAY_MS * attempt);
              if (attempt >= MAX_CHUNK_RETRIES) {
                throw error;
              }
            }
          }
        };

        const worker = async () => {
          while (true) {
            const current = nextIndex;
            if (current >= chunkCount) return;
            nextIndex += 1;
            await fetchChunk(current);
          }
        };

        const workers = Array.from({ length: Math.min(MAX_PARALLEL_CHUNKS, chunkCount) }, worker);
        await Promise.all(workers);

        const compressedBlob = new Blob(chunks, { type: contentType });
        const finalBlob = await maybeDecompressBlob(compressedBlob, compression || undefined);
        await saveBlobToDisk(finalBlob, fileName);
        return true;
      };

      const fallbackStreamDownload = async () => {
        const response = await fetch(downloadUrl);
        if (!response.ok || !response.body) {
          const reason = response.status === 404
            ? "Iroh endpoints are unavailable on this server. Set NEXT_PUBLIC_IROH_SERVER_URL to a backend with Iroh enabled."
            : `Failed to download ticket (status ${response.status})`;
          throw new Error(reason);
        }

        const fallbackCompression = response.headers.get('x-compression') || compression;
        const total = Number(response.headers.get('content-length')) || compressedSize || 0;

        const tryStreamToFile = async () => {
          if (!hasFileSystemAccess() || !response.body) return false;
          if (fallbackCompression === 'gzip' && typeof DecompressionStream === 'undefined') return false;

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

            if (fallbackCompression === 'gzip' && typeof DecompressionStream !== 'undefined') {
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

          const compressedBlob = new Blob(chunks, { type: response.headers.get('content-type') || contentType });
          const finalBlob = await maybeDecompressBlob(compressedBlob, fallbackCompression || undefined);
          await saveBlobToDisk(finalBlob, fileName);
        }
      };

      try {
        const usedChunked = await attemptChunkedDownload();
        if (!usedChunked) {
          await fallbackStreamDownload();
        }

        setDownloadingFiles(prev => prev.map(file =>
          file.id === downloadId
            ? {
                ...file,
                downloading: false,
                connecting: false,
                progress: 100,
                downloadedSize: originalSizeHeader || compressedSize || file.downloadedSize || file.size || 0,
                compression: compression === 'gzip' ? 'gzip' : 'none'
              }
            : file
        ));
      } catch (error) {
        console.error('[Iroh] Download failed', error);
        setDownloadingFiles(prev => prev.filter(file => file.id !== downloadId));
        toast({
          title: 'Download failed',
          description: error instanceof Error ? error.message : 'Could not complete the download',
          variant: 'destructive'
        });
      }
    },
    [toast, saveBlobToDisk]
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
