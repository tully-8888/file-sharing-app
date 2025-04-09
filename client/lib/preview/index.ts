// File preview utilities for AirShare
import WebTorrent, { Torrent } from "webtorrent";

// Global WebTorrent client type declaration
declare global {
  interface Window {
    webTorrentClient?: typeof WebTorrent.prototype;
  }
}

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

// Function to determine file type from name
export function getFileType(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  
  // Image formats
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(extension)) {
    return 'image';
  }
  
  // Video formats
  if (['mp4', 'webm', 'ogg', 'mov', 'avi'].includes(extension)) {
    return 'video';
  }
  
  // Audio formats
  if (['mp3', 'wav', 'ogg', 'aac', 'm4a'].includes(extension)) {
    return 'audio';
  }
  
  // Text formats
  if (['txt', 'md', 'json', 'csv', 'js', 'jsx', 'ts', 'tsx', 'html', 'css', 'yaml', 'yml'].includes(extension)) {
    return 'text';
  }
  
  // PDF
  if (extension === 'pdf') {
    return 'pdf';
  }
  
  // Other formats
  return 'other';
}

// Helper to get MIME type from filename
export function getMimeType(filename: string): string {
  const extension = filename.split('.').pop()?.toLowerCase() || '';
  
  // Common MIME types
  const mimeTypes: {[key: string]: string} = {
    // Images
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'bmp': 'image/bmp',
    
    // Videos
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'ogg': 'video/ogg',
    'mov': 'video/quicktime',
    'avi': 'video/x-msvideo',
    
    // Audio
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'm4a': 'audio/mp4',
    'aac': 'audio/aac',
    
    // Other
    'pdf': 'application/pdf',
    'txt': 'text/plain',
    'md': 'text/markdown',
    'json': 'application/json'
  };
  
  return mimeTypes[extension] || 'application/octet-stream';
}

// Function to preview a file before downloading
export async function generateFilePreview(
  file: PreviewFile,
  onUpdateFile: (updatedFile: PreviewFile) => void,
  onError: (message: string) => void
): Promise<void> {
  // Don't regenerate if already previewing or has preview
  if (file.isGeneratingPreview || file.previewUrl || file.previewContent) {
    return;
  }
  
  const fileType = getFileType(file.name);
  // Only try to preview supported formats
  if (!['image', 'video', 'audio', 'text', 'pdf'].includes(fileType)) {
    return;
  }
  
  // Check if file is too large for preview
  if (file.size > MAX_PREVIEW_SIZE) {
    onError("File too large for preview. Only files under 10MB can be previewed without downloading.");
    return;
  }
  
  try {
    // Mark file as generating preview
    onUpdateFile({
      ...file,
      isGeneratingPreview: true
    });
    
    // Create a temporary client instance to download just enough for preview
    const tempClient = await (window.webTorrentClient as any)?.add(file.magnetURI);
    
    if (!tempClient) {
      throw new Error("Failed to create preview download");
    }
    
    // Wait for metadata to be ready before accessing files
    const waitForMetadata = () => {
      return new Promise<void>((resolve, reject) => {
        // Check if files already exist first
        if (tempClient.files && tempClient.files.length > 0) {
          resolve();
          return;
        }
        
        // Set up event listener for when torrent metadata loads
        const onReady = () => {
          if (tempClient.files && tempClient.files.length > 0) {
            resolve();
          } else {
            reject(new Error("Torrent has no files after metadata loaded"));
          }
        };
        
        // Listen for the ready event
        tempClient.on('ready', onReady);
        
        // Set a timeout in case metadata never loads
        setTimeout(() => {
          tempClient.removeListener('ready', onReady);
          reject(new Error("Timed out waiting for torrent metadata"));
        }, 15000);
      });
    };
    
    // Wait for metadata to be ready
    await waitForMetadata();
    
    // Check if we have files now
    if (!tempClient.files || tempClient.files.length === 0) {
      throw new Error("No files found in torrent after metadata loaded");
    }
    
    // Set priority on first file only
    const torrentFile = tempClient.files[0];
    
    // For most file types, we just need the beginning of the file
    if (['image', 'video', 'audio', 'pdf'].includes(fileType)) {
      // Select just the first chunk to download
      const previewLength = Math.min(PREVIEW_CHUNK_SIZE, file.size);
      
      // Create a promise to wait for enough data for preview
      const previewPromise = new Promise<string>((resolve, reject) => {
        let downloadedEnough = false;
        
        const checkDownload = () => {
          // Only proceed if we downloaded at least 50KB or 10% of file
          const minBytes = Math.min(50 * 1024, file.size * 0.1);
          
          if (tempClient.downloaded >= minBytes && !downloadedEnough) {
            downloadedEnough = true;
            
            try {
              // Get partial content as stream
              const stream = torrentFile.createReadStream({ 
                start: 0,
                end: Math.min(previewLength - 1, torrentFile.length - 1)
              });
              
              const chunks: Uint8Array[] = [];
              
              stream.on('data', (chunk: Uint8Array) => {
                chunks.push(chunk);
              });
              
              stream.on('end', () => {
                const partialContent = new Uint8Array(Buffer.concat(chunks));
                
                // Create blob URL from the partial content
                const blob = new Blob([partialContent], { type: getMimeType(file.name) });
                const url = URL.createObjectURL(blob);
                resolve(url);
              });
              
              stream.on('error', (err: Error) => {
                reject(err);
              });
            } catch (err) {
              reject(err);
            }
          }
        };
        
        // Poll download progress
        const interval = setInterval(checkDownload, 200);
        
        // Timeout after 15 seconds
        const timeout = setTimeout(() => {
          clearInterval(interval);
          reject(new Error("Preview generation timed out"));
        }, 15000);
        
        // Set up cleanup
        tempClient.once('close', () => {
          clearInterval(interval);
          clearTimeout(timeout);
          reject(new Error("Download was closed"));
        });
      });
      
      // Wait for preview to be ready
      const previewUrl = await previewPromise;
      
      // Update file with preview URL
      onUpdateFile({
        ...file,
        previewUrl,
        type: fileType,
        isGeneratingPreview: false
      });
      
      return;
    } 
    
    // For text files, get a small preview of the content
    if (fileType === 'text') {
      const previewPromise = new Promise<string>((resolve, reject) => {
        let downloadedEnough = false;
        
        const checkDownload = () => {
          // Only need first ~10KB for text preview
          const minBytes = Math.min(10 * 1024, file.size);
          
          if (tempClient.downloaded >= minBytes && !downloadedEnough) {
            downloadedEnough = true;
            
            try {
              // Get first part of text file
              const stream = torrentFile.createReadStream({ 
                start: 0,
                end: Math.min(minBytes - 1, torrentFile.length - 1)
              });
              
              const chunks: Uint8Array[] = [];
              
              stream.on('data', (chunk: Uint8Array) => {
                chunks.push(chunk);
              });
              
              stream.on('end', () => {
                try {
                  const content = new TextDecoder().decode(Buffer.concat(chunks));
                  resolve(content.slice(0, 1000)); // First 1000 chars
                } catch (err) {
                  reject(err);
                }
              });
              
              stream.on('error', (err: Error) => {
                reject(err);
              });
            } catch (err) {
              reject(err);
            }
          }
        };
        
        // Poll download progress
        const interval = setInterval(checkDownload, 200);
        
        // Timeout after 15 seconds
        const timeout = setTimeout(() => {
          clearInterval(interval);
          reject(new Error("Preview generation timed out"));
        }, 15000);
        
        // Set up cleanup
        tempClient.once('close', () => {
          clearInterval(interval);
          clearTimeout(timeout);
          reject(new Error("Download was closed"));
        });
      });
      
      // Wait for preview to be ready
      const previewContent = await previewPromise;
      
      // Update file with preview content
      onUpdateFile({
        ...file,
        previewContent,
        type: fileType,
        isGeneratingPreview: false
      });
      
      return;
    }
  } catch (error) {
    console.error(`Error generating preview:`, error);
    
    // Reset generating state
    onUpdateFile({
      ...file,
      isGeneratingPreview: false
    });
    
    onError("Could not generate preview for this file");
  }
}

// Create a hook for managing preview torrents
export function createPreviewTorrentManager() {
  // Store of preview torrents
  const previewTorrents: Record<string, Torrent> = {};
  
  // Add a preview torrent
  const addPreviewTorrent = (fileId: string, torrent: Torrent) => {
    previewTorrents[fileId] = torrent;
  };
  
  // Remove a preview torrent
  const removePreviewTorrent = (fileId: string) => {
    if (previewTorrents[fileId]) {
      try {
        previewTorrents[fileId].destroy();
        delete previewTorrents[fileId];
      } catch (e) {
        console.error("Error destroying preview torrent:", e);
      }
    }
  };
  
  // Clean up all preview torrents
  const cleanupAllPreviewTorrents = () => {
    Object.keys(previewTorrents).forEach(fileId => {
      removePreviewTorrent(fileId);
    });
  };
  
  return {
    addPreviewTorrent,
    removePreviewTorrent,
    cleanupAllPreviewTorrents
  };
}
