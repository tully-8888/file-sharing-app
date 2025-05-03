"use client";

import { createContext, useContext } from '@/lib/performance';
import { ReactNode } from 'react';
import { useWebTorrent, TorrentFile } from '@/hooks/use-webtorrent';
import { useLANDiscovery } from '@/hooks/use-lan-discovery';
import { useFilePreview } from '@/hooks/use-file-preview';

// Define more specific types instead of any
interface User {
  id: string;
  peerId: string;
  name: string;
  avatar?: string;
}

// Base type for preview, matching the state from useFilePreview
interface BasePreviewFile {
  id: string;
  name: string;
  size: number;
  magnetURI: string;
  type?: string;
  previewUrl?: string;
  previewContent?: string;
  progress?: number;
}

// Extended type including properties needed for context functions like update
interface PreviewableFile extends BasePreviewFile {
  owner: string;
  timestamp: string; 
}

// First, define the LANMessage type based on its usage (needs to be defined or imported)
// Assuming it looks something like this based on the error message
interface LANMessage {
  type: string;
  data: Record<string, unknown>;
  recipient?: string; // Optional recipient for direct messages
}

// Define the context shape
interface FileSharingContextType {
  // WebTorrent related
  isClientReady: boolean;
  sharedFiles: TorrentFile[];
  downloadingFiles: TorrentFile[];
  createTorrent: (file: File, owner: string) => Promise<TorrentFile>;
  createTextTorrent: (text: string, owner: string) => Promise<TorrentFile>;
  downloadTorrent: (magnetURI: string) => Promise<void>;
  setSharedFiles: (files: TorrentFile[] | ((prev: TorrentFile[]) => TorrentFile[])) => void;
  setDownloadingFiles: (files: TorrentFile[] | ((prev: TorrentFile[]) => TorrentFile[])) => void;
  
  // LAN Discovery related
  isDiscoveryActive: boolean;
  localUsers: User[];
  currentUser: User;
  currentRoomId: string | null;
  sendMessage: (message: LANMessage) => void; // Use the correct LANMessage type here
  createRoom: () => Promise<string>;
  joinRoom: (roomId: string) => void;
  leaveRoom: () => void;
  
  // File preview related
  previewFile: BasePreviewFile | null; // State from useFilePreview is likely BasePreviewFile
  previewContent: string | null;
  isPreviewOpen: boolean;
  openPreview: (file: BasePreviewFile) => void; // Accepts the base type
  closePreview: () => void;
  previewBeforeDownload: (file: BasePreviewFile) => Promise<void>; // Accepts the base type
  updateFullyDownloadedPreview: (file: PreviewableFile, content?: string, url?: string) => void; 
}

// Create context with a default undefined value
const FileSharingContext = createContext<FileSharingContextType | undefined>(undefined);

// Provider component
export function FileSharingProvider({ children }: { children: ReactNode }) {
  // Initialize hooks
  const webTorrent = useWebTorrent();
  const lanDiscovery = useLANDiscovery();
  const filePreview = useFilePreview();
  
  // Combine all context values
  // Type assertion might be needed here if the hook shapes don't perfectly align 
  // with FileSharingContextType, especially for the preview functions.
  const contextValue = {
    ...webTorrent,
    ...lanDiscovery,
    ...filePreview,
  } as FileSharingContextType; // Use type assertion as a temporary measure
  
  return (
    <FileSharingContext.Provider value={contextValue}>
      {children}
    </FileSharingContext.Provider>
  );
}

// Custom hook to use the context
export function useFileSharing() {
  const context = useContext(FileSharingContext);
  
  if (context === undefined) {
    throw new Error('useFileSharing must be used within a FileSharingProvider');
  }
  
  return context;
} 