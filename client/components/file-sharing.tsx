"use client"

import { useState, useCallback, useRef, useEffect } from "@/lib/performance"
import { useToast } from "@/hooks/use-toast"
import MainScreen from "./main-screen"
import { TorrentFile } from "@/hooks/use-webtorrent"
import { useFileSharing } from "@/contexts/file-sharing-context"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FileIcon } from "lucide-react"
import Image from 'next/image'

interface SharingState {
  isSharing: boolean
  progress: number
  stage: 'preparing' | 'hashing' | 'metadata' | 'ready' | null
}

export default function FileSharing() {
  const { toast } = useToast()
  const [isCopied, setIsCopied] = useState(false)
  const [currentMagnetLink, setCurrentMagnetLink] = useState<string>("")
  const [sharingState, setSharingState] = useState<SharingState>({
    isSharing: false,
    progress: 0,
    stage: null
  })
  
  // Use our context hook instead of individual hooks
  const { 
    isClientReady,
    sharedFiles, 
    downloadingFiles,
    createTorrent, 
    createTextTorrent, 
    downloadTorrent,
    setSharedFiles,
    setDownloadingFiles,
    previewFile,
    previewContent,
    isPreviewOpen,
    openPreview,
    closePreview,
    previewBeforeDownload
  } = useFileSharing();

  // All files (shared + downloading) - calculated once per render
  const allFiles = [...sharedFiles, ...downloadingFiles]

  const resetShareState = useCallback(() => {
    setSharingState({
      isSharing: false,
      progress: 0,
      stage: null
    });
    setCurrentMagnetLink("");
  }, []);

  // Handle share cancellation
  const handleShareCancel = useCallback(() => {
    console.log('Cancelling share operation');
    resetShareState();
    
    toast({
      title: "Share cancelled",
      description: "The Iroh sharing request was cancelled",
    });
  }, [resetShareState, toast]);

  // Debug logging for state changes
  useEffect(() => {
    console.log('Sharing State Changed:', {
      isSharing: sharingState.isSharing,
      progress: sharingState.progress,
      stage: sharingState.stage
    });
  }, [sharingState]);

  useEffect(() => {
    console.log('Magnet Link Changed:', currentMagnetLink ? `New link available: ${currentMagnetLink}` : 'No link');
  }, [currentMagnetLink]);


  // Handle file deletion - memoized to maintain stable reference
  const handleFileDelete = useCallback((fileId: string) => {
    // Find the file in either shared or downloading arrays
    const sharedFile = sharedFiles.find(f => f.id === fileId);
    const downloadingFile = downloadingFiles.find(f => f.id === fileId);
    const file = sharedFile || downloadingFile;

    if (!file) {
      console.warn(`File with id ${fileId} not found`);
      return;
    }

    try {
      if (downloadingFile?.downloading) {
        setDownloadingFiles((prev: TorrentFile[]) => prev.filter((f: TorrentFile) => f.id !== fileId));
      }

      if (sharedFile) {
        setSharedFiles((prev: TorrentFile[]) => prev.filter((f: TorrentFile) => f.id !== fileId));
      }

      // Show appropriate toast message
      toast({
        title: downloadingFile?.downloading ? "Download cancelled" : "File removed",
        description: `${file.name} has been ${downloadingFile?.downloading ? 'cancelled' : 'removed'} successfully`,
      });

    } catch (error) {
      console.error("Error deleting file:", error);
      toast({
        title: "Error removing file",
        description: "An error occurred while removing the file. Please try again.",
        variant: "destructive",
      });
    }
  }, [sharedFiles, downloadingFiles, toast, setSharedFiles, setDownloadingFiles]);

  // Simulate connection to local network
  useEffect(() => {
    if (isClientReady) {
      toast({
        title: "Connected to P2P network",
        description: "You can now share files with other users",
      })
    }
  }, [isClientReady, toast])

  const handleFileShare = useCallback(async (file: File) => {
    if (!isClientReady) {
      toast({
        title: "Iroh service not ready",
        description: "Please wait for the sharing client to initialize",
        variant: "destructive",
      });
      return;
    }

    setSharingState({
      isSharing: true,
      progress: 10,
      stage: 'preparing'
    });

    try {
      const sharedFile = await createTorrent(file, "You");

      setSharingState({
        isSharing: false,
        progress: 100,
        stage: 'ready'
      });

      if (sharedFile.magnetURI) {
        setCurrentMagnetLink(sharedFile.magnetURI);
      }

      toast({
        title: "File shared successfully",
        description: `${file.name} is now available to others. Share the Iroh ticket so they can download it.`,
      });
    } catch (err) {
      console.error("Error sharing file:", err);
      resetShareState();
      toast({
        title: "Error sharing file",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  }, [isClientReady, toast, createTorrent, resetShareState]);

  const handleTextShare = useCallback(async (text: string) => {
    if (!isClientReady) {
      toast({
        title: "Iroh service not ready",
        description: "Please wait for the sharing client to initialize",
        variant: "destructive",
      })
      return
    }

    try {
      const newFile = await createTextTorrent(text, "You")
      
      // Show and copy ticket
      if (newFile.magnetURI) {
        setCurrentMagnetLink(newFile.magnetURI)
      }
      
      toast({
        title: "Text shared successfully",
        description: `"${text.slice(0, 30)}${text.length > 30 ? '...' : ''}" is now available to others. Share the Iroh ticket so they can download it.`,
      })
    } catch (err) {
      console.error("Error sharing text:", err)
      toast({
        title: "Error sharing text",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      })
    }
  }, [isClientReady, toast, createTextTorrent]);

  // Function is used internally via the Iroh UI components
  /* eslint-disable @typescript-eslint/no-unused-vars */
  const handleFileDownload = useCallback(async (magnetURI: string) => {
    if (!isClientReady) {
      toast({
        title: "Iroh service not ready",
        description: "Please wait for the sharing client to initialize",
        variant: "destructive",
      })
      return
    }

    try {
      await downloadTorrent(magnetURI)
      
      toast({
        title: "Download started",
        description: "The file will be automatically downloaded when ready",
      })
    } catch (err) {
      console.error("Error downloading file:", err)
      toast({
        title: "Error downloading file",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      })
    }
  }, [isClientReady, toast, downloadTorrent]);
  /* eslint-enable @typescript-eslint/no-unused-vars */

  const handleCopyMagnetLink = useCallback(() => {
    if (!currentMagnetLink) return
    
    navigator.clipboard.writeText(currentMagnetLink)
      .then(() => {
        setIsCopied(true)
        setTimeout(() => setIsCopied(false), 2000)
        
        toast({
          title: "Iroh ticket copied",
          description: "Share this ticket so others can download your file",
        })
      })
      .catch(err => {
        console.error("Error copying to clipboard:", err)
        toast({
          title: "Error copying ticket",
          description: "Please copy it manually",
          variant: "destructive",
        })
      })
  }, [currentMagnetLink, toast]);

  // Handler for previewing a file - memoized for stable reference
  const handlePreviewFile = useCallback(async (file: TorrentFile) => {
    if (file.progress === 100) {
      // File already downloaded, open it directly
      openPreview(file);
    } else {
      // Generate preview for this file
      await previewBeforeDownload(file);
      openPreview(file);
    }
  }, [openPreview, previewBeforeDownload]);

  return (
    <>
      <MainScreen
        onFileShare={handleFileShare}
        onTextShare={handleTextShare}
        onFileDelete={handleFileDelete}
        onShareCancel={handleShareCancel}
        onPreviewFile={handlePreviewFile}
        sharedFiles={allFiles}
        currentMagnetLink={currentMagnetLink}
        onCopyMagnetLink={handleCopyMagnetLink}
        isCopied={isCopied}
        isClientReady={isClientReady}
        isSharing={sharingState.isSharing}
        sharingProgress={sharingState.progress}
        sharingStage={sharingState.stage}
      />

      {/* Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={closePreview}>
        <DialogContent className="sm:max-w-[90vw] max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{previewFile?.name}</DialogTitle>
          </DialogHeader>
          
          <div className="mt-4">
            {previewFile?.type === 'image' && previewFile.previewUrl && (
              <div className="relative w-full h-auto aspect-video">
                <Image 
                  src={previewFile.previewUrl} 
                  alt={previewFile.name} 
                  layout="fill"
                  objectFit="contain"
                  className="rounded-md"
                />
              </div>
            )}
            
            {previewFile?.type === 'video' && previewFile.previewUrl && (
              <video 
                src={previewFile.previewUrl} 
                controls 
                className="max-w-full h-auto rounded-md"
              />
            )}
            
            {previewFile?.type === 'audio' && previewFile.previewUrl && (
              <audio 
                src={previewFile.previewUrl} 
                controls 
                className="w-full"
              />
            )}
            
            {previewFile?.type === 'text' && (
              <pre className="bg-secondary/20 p-4 rounded-md overflow-auto max-h-[60vh] text-sm">
                {previewContent || "Loading content..."}
              </pre>
            )}
            
            {(!previewFile?.type || previewFile.type === 'other') && (
              <div className="text-center p-6 bg-secondary/20 rounded-md">
                <FileIcon className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
                <p>Preview not available for this file type</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
