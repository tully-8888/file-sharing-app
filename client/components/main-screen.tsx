"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { Upload, Clipboard, X, FileText, File as FileIcon, Copy, Check, Link, Globe, Wifi } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { TorrentFile } from "@/hooks/use-webtorrent"
import { useLANDiscovery } from "@/hooks/use-lan-discovery"
import { LANFileSharing } from "@/components/lan-file-sharing"
import { memo, useCallback } from '@/lib/performance'
import FileList from '@/components/file-list'

interface MainScreenProps {
  onFileShare: (file: File) => void
  onTextShare: (text: string) => void
  onFileDelete: (fileId: string) => void
  onShareCancel: () => void
  onPreviewFile?: (file: TorrentFile) => void
  sharedFiles: TorrentFile[]
  currentMagnetLink: string
  onCopyMagnetLink: () => void
  isCopied: boolean
  isClientReady: boolean
  isSharing: boolean
  sharingProgress: number
  sharingStage: 'preparing' | 'hashing' | 'metadata' | 'ready' | null
}

// Helper function to normalize progress
const normalizeProgress = (progress: number | undefined): number => {
  if (!progress) return 0;
  return Math.min(Math.round(progress), 100);
}

// Change MainScreen to a memoized component
export default memo(function MainScreen({
  onFileShare,
  onTextShare,
  onFileDelete,
  onShareCancel,
  onPreviewFile,
  sharedFiles,
  currentMagnetLink,
  onCopyMagnetLink,
  isCopied,
  isClientReady,
  isSharing,
  sharingProgress,
  sharingStage,
}: MainScreenProps) {
  // Keep existing implementation but make callbacks memoized

  // Use memoized callbacks to prevent unnecessary re-renders
  const [clipboardText, setClipboardText] = useState<string>("")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const [shareMode, setShareMode] = useState<"file" | "text" | "link" | null>(null)
  const [sharingType, setSharingType] = useState<"internet" | "lan">("internet")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Use LAN discovery hook to get users on the network
  const { isDiscoveryActive } = useLANDiscovery();

  // Set current magnet link when provided (only for upload/sharing)
  useEffect(() => {
    if (currentMagnetLink) {
      setShareMode("link")
    }
  }, [currentMagnetLink])

  // Use memoized callback to handle file input change
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0])
    } else {
      // If no file was selected, revert to default view
      setShareMode(null)
    }
  }, [])

  // Use blur event instead of cancel
  useEffect(() => {
    const handleFileInputBlur = () => {
      // Reset to default state if no file was selected
      if (shareMode === "file" && !selectedFile) {
        setShareMode(null)
      }
    }

    const fileInput = fileInputRef.current
    if (fileInput) {
      fileInput.addEventListener('blur', handleFileInputBlur)
      return () => fileInput.removeEventListener('blur', handleFileInputBlur)
    }
  }, [shareMode, selectedFile])

  // Use memoized callback to handle clipboard sharing
  const handleShareClipboard = useCallback(() => {
    if (clipboardText.trim()) {
      onTextShare(clipboardText)
      setClipboardText("")
    }
  }, [clipboardText, onTextShare])

  // Use memoized handlers for events
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
    setShareMode("file")
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0])
      setShareMode("file")
    }
  }, [])

  // Function to generate button classes based on active state
  const getSharingButtonClass = (buttonType: "internet" | "lan") => {
    const isActive = buttonType === sharingType;
    return `rounded-md px-6 ${
      isActive
        ? "bg-[#9D4EDD] text-white hover:bg-[#7B2CBF]" 
        : "text-muted-foreground hover:bg-[#9D4EDD]/10"
    }`;
  };

  // Render based on sharing type
  const renderContent = () => {
    if (sharingType === "lan") {
      return (
        <div className="flex flex-col gap-6 max-w-full mx-auto px-2 w-full">
          {/* Sharing Type Toggle */}
          <Card className="w-full bg-card/50 backdrop-blur-sm border-[#9D4EDD]/20">
            <CardContent className="pt-4 pb-4">
              <div className="flex justify-center">
                <div className="inline-flex bg-background/50 border border-[#9D4EDD]/20 rounded-lg p-1">
                  <Button
                    variant="ghost"
                    className={getSharingButtonClass("internet")}
                    onClick={() => setSharingType("internet")}
                  >
                    <Globe className="h-4 w-4 mr-2" />
                    Internet
                  </Button>
                  <Button
                    variant="ghost"
                    className={getSharingButtonClass("lan")}
                    onClick={() => setSharingType("lan")}
                  >
                    <Wifi className="h-4 w-4 mr-2" />
                    Local Network {isDiscoveryActive && <span className="ml-1 inline-block h-2 w-2 rounded-full bg-green-500"></span>}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <LANFileSharing />
        </div>
      );
    }

    // Default case: internet sharing
    return (
      <div className="flex flex-col gap-6 max-w-full mx-auto px-2 w-full">
        {/* Sharing Type Toggle */}
        <Card className="w-full bg-card/50 backdrop-blur-sm border-[#9D4EDD]/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex justify-center">
              <div className="inline-flex bg-background/50 border border-[#9D4EDD]/20 rounded-lg p-1">
                <Button
                  variant="ghost"
                  className={getSharingButtonClass("internet")}
                  onClick={() => setSharingType("internet")}
                >
                  <Globe className="h-4 w-4 mr-2" />
                  Internet
                </Button>
                <Button
                  variant="ghost"
                  className={getSharingButtonClass("lan")}
                  onClick={() => setSharingType("lan")}
                >
                  <Wifi className="h-4 w-4 mr-2" />
                  Local Network {isDiscoveryActive && <span className="ml-1 inline-block h-2 w-2 rounded-full bg-green-500"></span>}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="w-full bg-card/50 backdrop-blur-sm border-[#9D4EDD]/20">
          <CardContent className="pt-4">
            <div className="flex flex-col md:flex-row gap-6">
              {/* Unified sharing area - always visible */}
              <div className="flex-1 space-y-6">
                <div className="flex items-center justify-between pt-4">
                  <h3 className="text-lg font-medium gradient-text">Share Content</h3>
                </div>
                
                <div 
                  className={`share-content-section relative border-2 border-dashed rounded-lg p-6 text-center transition-all duration-500 min-h-[200px] flex flex-col items-center justify-center ${
                    isDragging
                      ? "border-[#9D4EDD] bg-[#9D4EDD]/10"
                      : "border-[#9D4EDD]/30 hover:border-[#9D4EDD]/60"
                  }`}
                  onDragOver={handleDragOver}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <input 
                    id="file" 
                    type="file" 
                    onChange={handleFileChange}
                    className="hidden" 
                    ref={fileInputRef} 
                  />
                  
                  {/* Share mode selector - only shown when nothing is being shared */}
                  {!shareMode && (
                    <div className="space-y-6">
                      <div className="flex items-center justify-center">
                        <div className="bg-[#9D4EDD]/20 p-4 rounded-full">
                          <Upload className="h-8 w-8 text-[#9D4EDD]" />
                        </div>
                      </div>
                      <div>
                        <h3 className="text-lg font-medium">Drop a file or paste text to share</h3>
                        <p className="text-sm text-gray-400 mt-1">Instantly share with P2P technology</p>
                      </div>
                      <div className="flex gap-3 justify-center flex-wrap">
                        <Button
                          onClick={() => {
                            setShareMode("file");
                            fileInputRef.current?.click();
                          }}
                          variant="outline"
                          className="border-[#9D4EDD]/30 hover:bg-[#9D4EDD]/10"
                          disabled={!isClientReady}
                        >
                          <FileIcon className="h-4 w-4 mr-2" />
                          Select File
                        </Button>
                        <Button
                          onClick={() => {
                            setShareMode("text");
                            setTimeout(() => textareaRef.current?.focus(), 100);
                          }}
                          variant="outline"
                          className="border-[#9D4EDD]/30 hover:bg-[#9D4EDD]/10"
                          disabled={!isClientReady}
                        >
                          <FileText className="h-4 w-4 mr-2" />
                          Share Text
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* File sharing UI */}
                  {shareMode === "file" && (
                    <div className="space-y-4 w-full max-w-md">
                      <div className="flex items-center justify-center">
                        <div className="bg-[#9D4EDD]/20 p-3 rounded-full">
                          {isSharing ? (
                            <div className="h-6 w-6 flex items-center justify-center">
                              <div className="w-4 h-4 border-2 border-[#9D4EDD] border-t-transparent rounded-full animate-spin" />
                            </div>
                          ) : selectedFile ? (
                            <Upload className="h-6 w-6 text-[#9D4EDD]" />
                          ) : (
                            <FileIcon className="h-6 w-6 text-[#9D4EDD]" />
                          )}
                        </div>
                      </div>
                      
                      {isSharing ? (
                        <div className="w-full space-y-4">
                          <div>
                            <p className="font-medium text-white text-center">{selectedFile?.name}</p>
                            <p className="text-sm text-gray-400 text-center">
                              {selectedFile?.size && (
                                selectedFile.size < 1024 
                                  ? selectedFile.size + " B"
                                  : selectedFile.size < 1048576 
                                    ? (selectedFile.size / 1024).toFixed(1) + " KB"
                                    : (selectedFile.size / 1048576).toFixed(1) + " MB"
                              )}
                            </p>
                          </div>

                          {/* Sharing Progress */}
                          <div className="w-full space-y-4">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-[#9D4EDD]">
                                {sharingStage === 'preparing' && "Preparing file..."}
                                {sharingStage === 'hashing' && "Creating secure hash..."}
                                {sharingStage === 'metadata' && "Generating metadata..."}
                                {sharingStage === 'ready' && "File ready!"}
                              </span>
                              <span className="text-[#9D4EDD]">{normalizeProgress(sharingProgress)}%</span>
                            </div>
                            {/* Add progress bar component */}
                            <p className="text-xs text-center text-muted-foreground">
                              {sharingStage === 'preparing' && "Setting up file for sharing..."}
                              {sharingStage === 'hashing' && "Creating unique file fingerprint..."}
                              {sharingStage === 'metadata' && "Almost done! Finalizing..."}
                              {sharingStage === 'ready' && "Ready to share!"}
                            </p>
                          </div>

                          <Button 
                            variant="outline"
                            className="border-[#9D4EDD]/30 bg-background/50 w-full"
                            disabled
                          >
                            <div className="flex items-center gap-2">
                              <div className="h-4 w-4 border-2 border-[#9D4EDD] border-t-transparent rounded-full animate-spin" />
                              <span>Processing...</span>
                            </div>
                          </Button>
                        </div>
                      ) : selectedFile ? (
                        <>
                          <div>
                            <p className="font-medium text-white">{selectedFile.name}</p>
                            <p className="text-sm text-gray-400">
                              {selectedFile.size < 1024 
                                ? selectedFile.size + " B"
                                : selectedFile.size < 1048576 
                                  ? (selectedFile.size / 1024).toFixed(1) + " KB"
                                  : (selectedFile.size / 1048576).toFixed(1) + " MB"
                              }
                            </p>
                          </div>
                          
                          {/* Compression Toggle */}
                          <div className="flex items-center gap-3 w-full max-w-md bg-background/50 rounded-xl p-4 border border-[#9D4EDD]/10">
                            <div className="flex-1 flex items-center gap-3">
                              <div className="bg-[#9D4EDD]/5 rounded-lg p-2">
                                <svg
                                  width="16"
                                  height="16"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  className="text-[#9D4EDD]"
                                >
                                  <path
                                    d="M20 5L4 5"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                  />
                                  <path
                                    d="M16 9L8 9"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                  />
                                  <path
                                    d="M14 13L10 13"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                  />
                                  <path
                                    d="M12 17L12 17"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                  />
                                </svg>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-sm font-medium">Compress File</span>
                                <span className="text-xs text-muted-foreground">Reduce file size before sharing</span>
                              </div>
                            </div>
                            <div className="relative flex items-center">
                              <div className="w-8 h-4 rounded-full bg-[#9D4EDD]/10 cursor-not-allowed">
                                <div className="absolute left-0.5 top-0.5 w-3 h-3 rounded-full bg-[#9D4EDD]/30" />
                              </div>
                              <span className="absolute -top-5 right-0 text-[10px] text-[#9D4EDD] opacity-60 font-medium tracking-wide">SOON</span>
                            </div>
                          </div>

                          <div className="flex gap-2 justify-center">
                            <Button
                              onClick={() => {
                                setSelectedFile(null);
                                setShareMode(null);
                              }}
                              variant="outline"
                              className="border-[#9D4EDD]/30 hover:bg-[#9D4EDD]/10"
                            >
                              <X className="h-4 w-4 mr-2" />
                              Cancel
                            </Button>
                            <Button 
                              onClick={() => onFileShare(selectedFile)} 
                              className="bg-[#9D4EDD] hover:bg-[#7B2CBF]"
                            >
                              <Upload className="h-4 w-4 mr-2" />
                              Share Now
                            </Button>
                          </div>
                        </>
                      ) : (
                        // Show file selection UI only when no file is selected and not sharing
                        <div className="text-center space-y-4">
                          <div className="flex flex-col items-center gap-2">
                            <h4 className="text-lg font-medium text-[#9D4EDD]">Select a File</h4>
                            <p className="text-sm text-gray-400">Choose a file to share</p>
                          </div>
                          <Button
                            onClick={() => setShareMode(null)}
                            variant="outline"
                            className="border-[#9D4EDD]/30 hover:bg-[#9D4EDD]/10"
                          >
                            <X className="h-4 w-4 mr-2" />
                            Cancel
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Text sharing UI */}
                  {shareMode === "text" && (
                    <div className="space-y-4 w-full max-w-md">
                      <div className="flex items-center justify-center">
                        <div className="bg-[#9D4EDD]/20 p-3 rounded-full">
                          <FileText className="h-6 w-6 text-[#9D4EDD]" />
                        </div>
                      </div>
                      <Textarea
                        ref={textareaRef}
                        placeholder="Type or paste text to share"
                        value={clipboardText}
                        onChange={(e) => setClipboardText(e.target.value)}
                        className="min-h-[100px] bg-secondary/50 border-[#9D4EDD]/30"
                        autoFocus
                      />
                      <div className="flex gap-2 justify-center">
                        <Button
                          onClick={() => {
                            setClipboardText("");
                            setShareMode(null);
                          }}
                          variant="outline"
                          className="border-[#9D4EDD]/30 hover:bg-[#9D4EDD]/10"
                        >
                          <X className="h-4 w-4 mr-2" />
                          Cancel
                        </Button>
                        <Button
                          onClick={handleShareClipboard}
                          disabled={!clipboardText.trim()}
                          className="bg-[#9D4EDD] hover:bg-[#7B2CBF]"
                        >
                          <Clipboard className="h-4 w-4 mr-2" />
                          Share Text
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Share ticket (download) UI */}
                  {shareMode === "link" && (
                    <div className="space-y-4 w-full max-w-md">
                      <div className="flex items-center justify-center">
                        <div className="bg-[#9D4EDD]/20 p-3 rounded-full">
                          <Link className="h-6 w-6 text-[#9D4EDD]" />
                        </div>
                      </div>
                      
                      {currentMagnetLink && (
                        <div className="flex flex-col items-center">
                          <p className="text-sm text-center text-muted-foreground mb-2">
                            Share this Iroh ticket with others so they can download your file:
                          </p>
                          <Button
                            onClick={onCopyMagnetLink}
                            variant="outline"
                            className="border-[#9D4EDD]/30 hover:bg-[#9D4EDD]/10"
                          >
                            {isCopied ? (
                              <>
                                <Check className="h-4 w-4 mr-2" />
                                Copied!
                              </>
                            ) : (
                              <>
                                <Copy className="h-4 w-4 mr-2" />
                                Copy Iroh Ticket
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                      
                      <div className="flex gap-2 justify-center">
                        <Button
                          onClick={() => {
                            setShareMode(null);
                          }}
                          variant="outline"
                          className="border-[#9D4EDD]/30 hover:bg-[#9D4EDD]/10"
                        >
                          <X className="h-4 w-4 mr-2" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Close button for any share mode */}
                  {shareMode && (
                    <Button
                      onClick={() => {
                        if (isSharing) {
                          // If sharing is in progress, call the cancel handler
                          onShareCancel();
                        }
                        // Reset UI state
                        setShareMode(null);
                        setSelectedFile(null);
                        setClipboardText("");
                        setIsDragging(false);
                      }}
                      size="icon"
                      variant="ghost"
                      className="absolute top-2 right-2 h-8 w-8 rounded-full hover:bg-[#9D4EDD]/10"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Shared Files Card */}
        <Card className="w-full bg-card/50 backdrop-blur-sm border-[#9D4EDD]/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-medium gradient-text">Available Files</h3>
              <Badge variant="outline" className="border-[#9D4EDD]/30 text-[#9D4EDD]">
                {sharedFiles.length} {sharedFiles.length === 1 ? 'file' : 'files'} total
              </Badge>
            </div>

            <div className="space-y-6 max-h-[500px] overflow-y-auto pr-0 sm:pr-1">
              <FileList 
                files={sharedFiles}
                onPreviewFile={onPreviewFile}
                onFileDelete={onFileDelete}
                onCopyMagnetLink={onCopyMagnetLink}
              />
            </div>
          </CardContent>
        </Card>
        
        {/* Toast notification for copied links */}
        <div 
          id="toast" 
          className="hidden fixed bottom-4 right-4 bg-[#9D4EDD] text-white px-4 py-2 rounded-md shadow-lg"
        >
          Iroh ticket copied to clipboard
        </div>
        
        {/* LAN Users Panel - only show if discovery is active */}
        
      </div>
    );
  };

  return renderContent();
})
