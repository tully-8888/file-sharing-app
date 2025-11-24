"use client";

import { useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { TorrentFile } from "@/hooks/use-webtorrent";
import {
  generateFilePreview,
  getFileType,
  MAX_PREVIEW_SIZE,
  type PreviewFile
} from "@/lib/preview";

// Convert TorrentFile to PreviewFile format
const convertToPreviewFile = (file: TorrentFile): PreviewFile => {
  return {
    id: file.id,
    name: file.name,
    size: file.size,
    magnetURI: file.magnetURI,
    type: getFileType(file.name),
    sender: {
      id: file.owner,
      name: file.owner
    }
  };
};

interface FilePreviewState {
  previewFile: PreviewFile | null;
  previewContent: string | null;
  isPreviewOpen: boolean;
}

export function useFilePreview() {
  const [previewState, setPreviewState] = useState<FilePreviewState>({
    previewFile: null,
    previewContent: null,
    isPreviewOpen: false
  });
  const [previewableFiles, setPreviewableFiles] = useState<Record<string, PreviewFile>>({});
  const { toast } = useToast();
  
  // Update a file's preview information
  const updateFilePreview = useCallback((updatedFile: PreviewFile) => {
    setPreviewableFiles(prev => ({
      ...prev,
      [updatedFile.id]: updatedFile
    }));
  }, []);
  
  // Generate a preview for a file
  const previewBeforeDownload = useCallback(async (file: TorrentFile | PreviewFile) => {
    // Convert file to PreviewFile format if needed
    const previewFile = 'magnetURI' in file ? file as PreviewFile : convertToPreviewFile(file);
    
    // Don't regenerate if already previewing or has preview
    if (
      previewFile.isGeneratingPreview || 
      previewFile.previewUrl || 
      previewFile.previewContent
    ) {
      return;
    }
    
    // Skip if file is too large
    if (previewFile.size > MAX_PREVIEW_SIZE) {
      toast({
        title: "File too large for preview",
        description: "Only files under 10MB can be previewed without downloading",
      });
      return;
    }
    
    try {
      await generateFilePreview(
        previewFile,
        updateFilePreview,
        (errorMessage) => {
          toast({
            title: "Preview generation failed",
            description: errorMessage,
            variant: "destructive"
          });
        }
      );
    } catch (error) {
      console.error("Error generating preview:", error);
      toast({
        title: "Preview generation failed",
        description: "Could not generate preview for this file",
        variant: "destructive"
      });
    }
  }, [toast, updateFilePreview]);
  
  // Open preview dialog for a file
  const openPreview = useCallback((file: TorrentFile | PreviewFile) => {
    // Convert to PreviewFile if needed
    const previewFile = 'magnetURI' in file ? file as PreviewFile : convertToPreviewFile(file);
    
    // Get existing preview info if available
    const existingPreview = previewableFiles[previewFile.id] || previewFile;
    
    setPreviewState({
      previewFile: existingPreview,
      previewContent: existingPreview.previewContent || null,
      isPreviewOpen: true
    });
  }, [previewableFiles]);
  
  // Close preview dialog
  const closePreview = useCallback(() => {
    setPreviewState(prev => ({
      ...prev,
      isPreviewOpen: false
    }));
  }, []);
  
  // Handle fully downloaded file's preview
  const updateFullyDownloadedPreview = useCallback((
    file: TorrentFile, 
    textContent?: string,
    blobUrl?: string
  ) => {
    const fileType = getFileType(file.name);
    
    // Create or update preview file
    const updatedPreviewFile: PreviewFile = {
      id: file.id,
      name: file.name,
      size: file.size,
      magnetURI: file.magnetURI,
      type: fileType,
      sender: {
        id: file.owner,
        name: file.owner
      }
    };
    
    // Add appropriate preview content
    if (textContent && fileType === 'text') {
      updatedPreviewFile.previewContent = textContent;
    }
    
    if (blobUrl && ['image', 'video', 'audio', 'pdf'].includes(fileType)) {
      updatedPreviewFile.previewUrl = blobUrl;
    }
    
    // Update preview files store
    updateFilePreview(updatedPreviewFile);
    
    // If this is the file currently being previewed, update preview content
    if (previewState.previewFile?.id === file.id) {
      setPreviewState(prev => ({
        ...prev,
        previewFile: updatedPreviewFile,
        previewContent: textContent || prev.previewContent
      }));
    }
  }, [previewState.previewFile?.id, updateFilePreview]);
  
  return {
    previewFile: previewState.previewFile,
    previewContent: previewState.previewContent,
    isPreviewOpen: previewState.isPreviewOpen,
    previewableFiles,
    previewBeforeDownload,
    openPreview,
    closePreview,
    updateFilePreview,
    updateFullyDownloadedPreview
  };
}
