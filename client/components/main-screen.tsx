"use client"

import type React from "react"
import { useState, useRef, useCallback, useEffect } from "react"
import { Upload, Clipboard, Download, X, FileText, File as FileIcon, Copy, Check, Link, Plus, Globe, Wifi, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { TorrentFile } from "@/hooks/use-webtorrent"
import { useLANDiscovery } from "@/hooks/use-lan-discovery"
import { LANFileSharing } from "@/components/lan-file-sharing"

interface MainScreenProps {
  onFileShare: (file: File) => void
  onTextShare: (text: string) => void
  onFileDownload: (magnetURI: string) => void
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

export default function MainScreen({
  onFileShare,
  onTextShare,
  onFileDownload,
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
  const [clipboardText, setClipboardText] = useState<string>("")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const [shareMode, setShareMode] = useState<"file" | "text" | "link" | null>(null)
  const [downloadMagnetLink, setDownloadMagnetLink] = useState<string>("")
  const [showMagnetInput, setShowMagnetInput] = useState<boolean>(false)
  const [sharingType, setSharingType] = useState<"internet" | "lan">("internet")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const magnetInputRef = useRef<HTMLInputElement>(null)

  // Use LAN discovery hook to get users on the network
  const { isDiscoveryActive } = useLANDiscovery();

  // Set current magnet link when provided (only for upload/sharing)
  useEffect(() => {
    if (currentMagnetLink) {
      setShareMode("link")
    }
  }, [currentMagnetLink])

  useEffect(() => {
    const handlePaste = async () => {
      try {
        const clipboardItems = await navigator.clipboard.read();
        for (const item of clipboardItems) {
          // Check if clipboard has text
          if (item.types.includes('text/plain')) {
            const blob = await item.getType('text/plain');
            const text = await blob.text();
            if (text && !clipboardText) {
              setClipboardText(text);
              setShareMode("text");
            }
          }
        }
      } catch {
        // Clipboard API not available or permission denied
        console.log("Clipboard detection not available");
      }
    };

    // Try to detect clipboard content when textarea is focused
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.addEventListener('focus', handlePaste);
      return () => textarea.removeEventListener('focus', handlePaste);
    }
  }, [clipboardText]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0])
    } else {
      // If no file was selected, revert to default view
      setShareMode(null)
    }
  }

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

  const handleShareClipboard = () => {
    if (clipboardText.trim()) {
      onTextShare(clipboardText)
      setClipboardText("")
    }
  }

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
                            <Progress 
                              value={normalizeProgress(sharingProgress)} 
                              className="h-2 w-full"
                              indicatorClassName="bg-[#9D4EDD]"
                            />
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

                  {/* Magnet link (download) UI */}
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
                            Share this magnet link with others so they can download your file:
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
                                Copy Magnet Link
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                      
                      <div className="flex gap-2 justify-center">
                        <Button
                          onClick={() => {
                            setDownloadMagnetLink("");
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
                        setDownloadMagnetLink("");
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
              {/* Files Sections */}
              <div className="grid grid-cols-1 gap-6">
                {/* Your Shared Files Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Upload className="h-4 w-4 text-[#9D4EDD]" />
                      <h4 className="text-sm font-medium text-[#9D4EDD]">Your Shared Files</h4>
                    </div>
                    <Badge variant="outline" className="border-[#9D4EDD]/30 text-[#9D4EDD] text-xs">
                      {sharedFiles.filter(f => f.owner === "You").length} files
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    {sharedFiles
                      .filter(file => file.owner === "You")
                      .map((file) => (
                        <div
                          key={file.id}
                          className="flex flex-col p-2 sm:p-3 rounded-lg border border-[#9D4EDD]/30 bg-secondary/30 hover:bg-secondary/50 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 sm:gap-3">
                              <div className="bg-[#9D4EDD]/10 p-1.5 sm:p-2 rounded-full">
                                <FileIcon className="h-4 w-4 sm:h-5 sm:w-5 text-[#9D4EDD]" />
                              </div>
                              <div className="flex flex-col">
                                <span className="font-medium text-sm sm:text-base truncate max-w-[200px] sm:max-w-none">{file.name}</span>
                                <div className="flex items-center gap-2 text-xs text-gray-400">
                                  <span>{file.size}</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              {/* Preview button for shared files */}
                              {onPreviewFile && file.progress === 100 && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={(e: React.MouseEvent) => {
                                          e.stopPropagation();
                                          onPreviewFile(file);
                                        }}
                                        className="h-8 w-8 hover:bg-[#9D4EDD]/20"
                                      >
                                        <Eye className="h-4 w-4 text-[#9D4EDD]" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Preview file</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={(e: React.MouseEvent) => {
                                        e.stopPropagation();
                                        if (file.magnetURI) {
                                          navigator.clipboard.writeText(file.magnetURI);
                                          const toast = document.getElementById('toast');
                                          if (toast) {
                                            toast.classList.remove('hidden');
                                            setTimeout(() => toast.classList.add('hidden'), 2000);
                                          }
                                        }
                                      }}
                                      className="h-8 w-8 hover:bg-[#9D4EDD]/20"
                                    >
                                      <Copy className="h-4 w-4 text-[#9D4EDD]" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Copy magnet link</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={(e: React.MouseEvent) => {
                                        e.stopPropagation();
                                        onFileDelete(file.id);
                                      }}
                                      className="h-8 w-8 hover:bg-[#9D4EDD]/20"
                                    >
                                      <X className="h-4 w-4 text-[#9D4EDD]" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Remove file</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </div>
                          
                          {/* Progress bar for uploading files if needed */}
                          {file.uploading && typeof file.progress === 'number' && (
                            <div className="mt-2">
                              <div className="flex justify-between text-xs mb-1">
                                <span>Uploading</span>
                                <span>{normalizeProgress(file.progress)}%</span>
                              </div>
                              <Progress 
                                value={normalizeProgress(file.progress)} 
                                className="h-2"
                                indicatorClassName="bg-[#9D4EDD]"
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    {sharedFiles.filter(f => f.owner === "You").length === 0 && (
                      <div
                        className="flex flex-col p-2 sm:p-3 rounded-lg border border-[#9D4EDD]/30 bg-secondary/10 hover:bg-secondary/30 cursor-pointer transition-all duration-200"
                        onClick={() => {
                          // Scroll to the share content section smoothly
                          const shareContentSection = document.querySelector('.share-content-section');
                          if (shareContentSection) {
                            shareContentSection.scrollIntoView({ behavior: 'smooth' });
                            // Add a temporary highlight effect
                            shareContentSection.classList.add('highlight-pulse');
                            setTimeout(() => shareContentSection.classList.remove('highlight-pulse'), 2000);
                          }
                        }}
                      >
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div className="bg-[#9D4EDD]/10 p-1.5 sm:p-2 rounded-full">
                            <Upload className="h-4 w-4 sm:h-5 sm:w-5 text-[#9D4EDD]" />
                          </div>
                          <div className="flex flex-col flex-1">
                            <span className="font-medium text-[#9D4EDD]/80 text-sm sm:text-base">Share New File</span>
                            <span className="text-xs text-gray-400">Click to open file sharing options</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="opacity-50 hover:opacity-100 hover:bg-[#9D4EDD]/20"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Downloaded Files Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Download className="h-4 w-4 text-[#9D4EDD]" />
                      <h4 className="text-sm font-medium text-[#9D4EDD]">Downloaded Files</h4>
                    </div>
                    <Badge variant="outline" className="border-[#9D4EDD]/30 text-[#9D4EDD] text-xs">
                      {sharedFiles.filter(f => f.owner !== "You").length} files
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    {/* Download New File Card - Always First */}
                    <div
                      className={`flex flex-col p-2 sm:p-3 rounded-lg border border-[#9D4EDD]/30 ${
                        showMagnetInput 
                          ? "bg-secondary/30" 
                          : "bg-secondary/10 hover:bg-secondary/30 cursor-pointer"
                      } transition-all duration-200`}
                      onClick={() => !showMagnetInput && setShowMagnetInput(true)}
                    >
                      {!showMagnetInput ? (
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div className="bg-[#9D4EDD]/10 p-1.5 sm:p-2 rounded-full">
                            <Download className="h-4 w-4 sm:h-5 sm:w-5 text-[#9D4EDD]" />
                          </div>
                          <div className="flex flex-col flex-1">
                            <span className="font-medium text-[#9D4EDD]/80 text-sm sm:text-base">Download New File</span>
                            <span className="text-xs text-gray-400">Click to add magnet link</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="opacity-50 hover:opacity-100 hover:bg-[#9D4EDD]/20"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div className="bg-[#9D4EDD]/10 p-1.5 sm:p-2 rounded-full">
                              <Link className="h-4 w-4 sm:h-5 sm:w-5 text-[#9D4EDD]" />
                            </div>
                            <div className="flex flex-col flex-1">
                              <span className="font-medium text-[#9D4EDD]/80 text-sm sm:text-base">Add Magnet Link</span>
                              <span className="text-xs text-gray-400">Paste a magnet URI to download</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowMagnetInput(false);
                                setDownloadMagnetLink("");
                              }}
                              className="opacity-50 hover:opacity-100 hover:bg-[#9D4EDD]/20"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                          
                          <div className="flex gap-2">
                            <Input
                              ref={magnetInputRef}
                              placeholder="magnet:?xt=urn:btih:..."
                              value={downloadMagnetLink}
                              onChange={(e) => setDownloadMagnetLink(e.target.value)}
                              className="bg-secondary/50 border-[#9D4EDD]/30"
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            />
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (downloadMagnetLink.trim() && downloadMagnetLink.startsWith('magnet:')) {
                                  onFileDownload(downloadMagnetLink);
                                  setDownloadMagnetLink("");
                                  setShowMagnetInput(false);
                                }
                              }}
                              disabled={!downloadMagnetLink.trim() || !downloadMagnetLink.startsWith('magnet:')}
                              className="bg-[#9D4EDD] hover:bg-[#7B2CBF] whitespace-nowrap"
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Download
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Only show downloaded files if they exist */}
                    {sharedFiles
                      .filter(file => file.owner !== "You")
                      .map((file) => (
                        <div
                          key={file.id}
                          className="flex flex-col p-2 sm:p-3 rounded-lg border border-[#9D4EDD]/30 bg-secondary/30 hover:bg-secondary/50 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 sm:gap-3">
                              <div className="bg-[#9D4EDD]/10 p-1.5 sm:p-2 rounded-full">
                                <FileIcon className="h-4 w-4 sm:h-5 sm:w-5 text-[#9D4EDD]" />
                              </div>
                              <div className="flex flex-col">
                                <span className="font-medium text-sm sm:text-base truncate max-w-[200px] sm:max-w-none">{file.name}</span>
                                <div className="flex items-center gap-2 text-xs text-gray-400">
                                  <span>{file.size}</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              {/* Preview button for downloaded files */}
                              {onPreviewFile && file.progress === 100 && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={(e: React.MouseEvent) => {
                                          e.stopPropagation();
                                          onPreviewFile(file);
                                        }}
                                        className="h-8 w-8 hover:bg-[#9D4EDD]/20"
                                      >
                                        <Eye className="h-4 w-4 text-[#9D4EDD]" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Preview file</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={(e: React.MouseEvent) => {
                                        e.stopPropagation();
                                        if (file.magnetURI) {
                                          navigator.clipboard.writeText(file.magnetURI);
                                          const toast = document.getElementById('toast');
                                          if (toast) {
                                            toast.classList.remove('hidden');
                                            setTimeout(() => toast.classList.add('hidden'), 2000);
                                          }
                                        }
                                      }}
                                      className="h-8 w-8 hover:bg-[#9D4EDD]/20"
                                    >
                                      <Copy className="h-4 w-4 text-[#9D4EDD]" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Copy magnet link</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={(e: React.MouseEvent) => {
                                        e.stopPropagation();
                                        onFileDelete(file.id);
                                      }}
                                      className="h-8 w-8 hover:bg-[#9D4EDD]/20"
                                    >
                                      <X className="h-4 w-4 text-[#9D4EDD]" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{file.downloading ? 'Cancel download' : 'Remove file'}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </div>
                          
                          {/* Progress bar for downloading files */}
                          {(file.downloading || file.connecting) && (
                            <div className="mt-2 space-y-2">
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-[#9D4EDD]">
                                  {file.connecting ? "Connecting to file..." : "Downloading"}
                                </span>
                                <span className="text-[#9D4EDD]">
                                  {file.connecting ? (
                                    <div className="flex items-center gap-2">
                                      <div className="w-3 h-3 border-2 border-[#9D4EDD] border-t-transparent rounded-full animate-spin" />
                                    </div>
                                  ) : (
                                    `${normalizeProgress(file?.progress)}%`
                                  )}
                                </span>
                              </div>
                              {!file.connecting && (
                                <>
                                  <Progress 
                                    value={normalizeProgress(file?.progress)} 
                                    className="h-2"
                                    indicatorClassName="bg-[#9D4EDD]"
                                  />
                                  {/* Download stats */}
                                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
                                    <div className="flex items-center gap-2">
                                      <svg
                                        width="12"
                                        height="12"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        className="text-[#9D4EDD]"
                                      >
                                        <path
                                          d="M2 12L12 22L22 12"
                                          stroke="currentColor"
                                          strokeWidth="2"
                                          strokeLinecap="round"
                                        />
                                        <path
                                          d="M12 2L12 22"
                                          stroke="currentColor"
                                          strokeWidth="2"
                                          strokeLinecap="round"
                                        />
                                      </svg>
                                      <span>
                                        {file.downloadSpeed ? 
                                          `${(file.downloadSpeed / (1024 * 1024)).toFixed(2)} MB/s` : 
                                          'Connecting...'}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2 justify-end">
                                      <svg
                                        width="12"
                                        height="12"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        className="text-[#9D4EDD]"
                                      >
                                        <circle
                                          cx="12"
                                          cy="12"
                                          r="10"
                                          stroke="currentColor"
                                          strokeWidth="2"
                                        />
                                        <path
                                          d="M12 6L12 12L16 14"
                                          stroke="currentColor"
                                          strokeWidth="2"
                                          strokeLinecap="round"
                                        />
                                      </svg>
                                      <span>
                                        {file.downloadSpeed && file.size ? 
                                          `${formatETA(file.size * (1 - (file.progress ?? 0) / 100) / file.downloadSpeed)}` :
                                          'Calculating...'}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2 col-span-2">
                                      <svg
                                        width="12"
                                        height="12"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        className="text-[#9D4EDD]"
                                      >
                                        <rect
                                          x="4"
                                          y="4"
                                          width="16"
                                          height="16"
                                          rx="2"
                                          stroke="currentColor"
                                          strokeWidth="2"
                                        />
                                        <path
                                          d="M16 4V20"
                                          stroke="currentColor"
                                          strokeWidth="2"
                                          strokeLinecap="round"
                                        />
                                      </svg>
                                      <span>
                                        {formatDownloadProgress(file.downloadedSize, file.size)}
                                      </span>
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Toast notification for copied links */}
        <div 
          id="toast" 
          className="hidden fixed bottom-4 right-4 bg-[#9D4EDD] text-white px-4 py-2 rounded-md shadow-lg"
        >
          Magnet link copied to clipboard
        </div>
        
        {/* LAN Users Panel - only show if discovery is active */}
        
      </div>
    );
  };

  return renderContent();
}

// Add these utility functions at the top of the file, after imports
function formatETA(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return 'Calculating...';
  if (seconds === 0) return 'Complete';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

function formatSize(bytes: number): string {
  if (!bytes) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDownloadProgress(downloaded?: number, total?: number): string {
  if (!downloaded || !total) return 'Waiting for data...';
  return `${formatSize(downloaded)} of ${formatSize(total)}`;
}

// Helper function to ensure progress is limited to 100%
function normalizeProgress(progress: number | undefined): number {
  if (!progress) return 0;
  return Math.min(Math.round(progress), 100);
}

