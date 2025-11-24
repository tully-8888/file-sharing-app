"use client";

import { getServerHttpUrl } from "@/lib/network-utils";

export interface PreviewFile {
  id: string;
  name: string;
  size: number;
  magnetURI: string;
  type?: string;
  previewUrl?: string;
  previewContent?: string;
  isGeneratingPreview?: boolean;
  sender?: {
    id: string;
    name: string;
    avatar?: string;
  };
}

// Maximum file size for auto preview in bytes (10MB)
export const MAX_PREVIEW_SIZE = 10 * 1024 * 1024;
// Size of partial download for preview (1MB)
export const PREVIEW_CHUNK_SIZE = 1 * 1024 * 1024;

const SUPPORTED_PREVIEW_TYPES = new Set(["image", "video", "audio", "text", "pdf"]);

// Function to determine file type from name
export function getFileType(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(extension)) return 'image';
  if (["mp4", "webm", "ogg", "mov", "avi"].includes(extension)) return 'video';
  if (["mp3", "wav", "ogg", "aac", "m4a"].includes(extension)) return 'audio';
  if (["txt", "md", "json", "csv", "js", "jsx", "ts", "tsx", "html", "css", "yaml", "yml"].includes(extension)) return 'text';
  if (extension === 'pdf') return 'pdf';
  return 'other';
}

// Helper to get MIME type from filename
export function getMimeType(filename: string): string {
  const extension = filename.split('.').pop()?.toLowerCase() || '';
  const mimeTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
    mp4: 'video/mp4',
    webm: 'video/webm',
    ogg: 'video/ogg',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    pdf: 'application/pdf',
    txt: 'text/plain',
    md: 'text/markdown',
    json: 'application/json'
  };
  return mimeTypes[extension] || 'application/octet-stream';
}

const buildPreviewUrl = (ticket: string, bytes: number) =>
  `${getServerHttpUrl()}/iroh/preview?${new URLSearchParams({ ticket, bytes: bytes.toString() }).toString()}`;

const base64ToBlobUrl = (base64: string, mimeType: string) => {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i += 1) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: mimeType });
  return URL.createObjectURL(blob);
};

// Function to preview a file before downloading
export async function generateFilePreview(
  file: PreviewFile,
  onUpdateFile: (updatedFile: PreviewFile) => void,
  onError: (message: string) => void
): Promise<void> {
  if (file.isGeneratingPreview || file.previewUrl || file.previewContent) {
    return;
  }

  const fileType = file.type || getFileType(file.name);
  if (!SUPPORTED_PREVIEW_TYPES.has(fileType)) {
    return;
  }

  if (file.size > MAX_PREVIEW_SIZE) {
    onError("File too large for preview. Only files under 10MB can be previewed without downloading.");
    return;
  }

  onUpdateFile({ ...file, isGeneratingPreview: true });

  try {
    const response = await fetch(buildPreviewUrl(file.magnetURI, PREVIEW_CHUNK_SIZE));
    if (!response.ok) {
      throw new Error('Preview request failed');
    }

    const data: { isText: boolean; mimeType: string; textContent?: string; base64?: string } = await response.json();

    if (data.isText && data.textContent !== undefined) {
      onUpdateFile({
        ...file,
        previewContent: data.textContent,
        type: 'text',
        isGeneratingPreview: false
      });
      return;
    }

    if (data.base64) {
      const mimeType = data.mimeType || getMimeType(file.name);
      const previewUrl = base64ToBlobUrl(data.base64, mimeType);
      onUpdateFile({
        ...file,
        previewUrl,
        type: fileType,
        isGeneratingPreview: false
      });
      return;
    }

    throw new Error('Preview payload missing data');
  } catch (error) {
    console.error('Error generating preview:', error);
    onUpdateFile({ ...file, isGeneratingPreview: false });
    onError('Could not generate preview for this file');
  }
}
