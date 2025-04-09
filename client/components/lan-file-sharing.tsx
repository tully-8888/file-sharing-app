"use client";

import { useState, useRef, useEffect } from "react";
import { useLANDiscovery } from "../hooks/use-lan-discovery";
import { useWebTorrent } from "../hooks/use-webtorrent";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Badge } from "./ui/badge";
import { 
  DownloadCloud, 
  UploadCloud, 
  FileText, 
  Check, 
  X, 
  Users, 
  Image as ImageIcon, 
  FileVideo, 
  FileAudio, 
  File as FileIcon,
  Eye,
  Play,
  Loader
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";

interface SharedFileInfo {
  id: string;
  name: string;
  size: number;
  magnetURI: string;
  sender: {
    id: string;
    name: string;
    avatar?: string;
  };
  timestamp: number;
  type?: string;
  previewUrl?: string;
  previewContent?: string;
  isGeneratingPreview?: boolean;
}

// Custom type for the message event
interface LanMessageEvent extends CustomEvent {
  detail: {
    type: string;
    data: SharedFileInfo;
  };
}

// Maximum file size for auto preview in bytes (10MB)
const MAX_PREVIEW_SIZE = 10 * 1024 * 1024; 
// Size of partial download for preview (1MB)
const PREVIEW_CHUNK_SIZE = 1 * 1024 * 1024;
// Maximum text length for clipboard sharing
const MAX_CLIPBOARD_TEXT_LENGTH = 10000;

// Helper function to ensure progress is limited to 100%
function normalizeProgress(progress: number | undefined): number {
  if (progress === undefined || progress === null) return 0;
  return Math.min(Math.round(progress), 100);
}

// Function to get error message safely
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error occurred';
}

export function LANFileSharing() {
  const { 
    localUsers, 
    currentUser, 
    isDiscoveryActive, 
    sendMessage, 
    createRoom, 
    joinRoom, 
    currentRoomId, 
    leaveRoom 
  } = useLANDiscovery();
  const { 
    createTorrent,
    downloadTorrent,
    sharedFiles,
    downloadingFiles,
    isClientReady
  } = useWebTorrent();
  const { toast } = useToast();
  
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [selectedPeers, setSelectedPeers] = useState<string[]>([]);
  const [isSharing, setIsSharing] = useState(false);
  const [clipboardText, setClipboardText] = useState<string>("");
  const [isSharingText, setIsSharingText] = useState(false);
  const [isTextTabActive, setIsTextTabActive] = useState(false);
  const [showRoomInput, setShowRoomInput] = useState(false);
  const [roomInputValue, setRoomInputValue] = useState("");
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [availableFiles, setAvailableFiles] = useState<SharedFileInfo[]>([]);
  const [fileNotifications, setFileNotifications] = useState<SharedFileInfo[]>([]);
  const [previewFile, setPreviewFile] = useState<SharedFileInfo | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewTorrents, setPreviewTorrents] = useState<Record<string, {destroy?: () => void}>>({});
  const [isDragging, setIsDragging] = useState(false);

  // Log key information for debugging
  useEffect(() => {
    console.log("[LANFileSharing] Current user info:", currentUser);
    console.log("[LANFileSharing] Local users:", localUsers);
    console.log("[LANFileSharing] Current room ID:", currentRoomId);
  }, [currentUser, localUsers, currentRoomId]);

  // Handle received file share messages
  useEffect(() => {
    // Setup message listener for file shares
    const handleMessageReceived = (e: Event) => {
      console.log("[LANFileSharing] Received event:", e);
      
      const event = e as LanMessageEvent;
      console.log("[LANFileSharing] Received lan-message event:", event.detail);
      
      if (event.detail?.type === 'FILE_SHARE') {
        console.log("[LANFileSharing] Processing FILE_SHARE message:", event.detail.data);
        
        const fileInfo = event.detail.data;
        
        // Add to available files
        setAvailableFiles(prev => {
          if (prev.find(f => f.id === fileInfo.id)) return prev;
          return [fileInfo, ...prev];
        });
        
        // Add to notifications
        setFileNotifications(prev => [fileInfo, ...prev]);
        
        // Show toast notification
        toast({
          title: "New file shared",
          description: `${fileInfo.sender.name} shared "${fileInfo.name}"`,
        });
      }
    };
    
    // Register the message handler with the LAN discovery hook
    if (typeof window !== 'undefined') {
      console.log("[LANFileSharing] Adding lan-message event listener");
      window.addEventListener('lan-message', handleMessageReceived);
    }
    
    return () => {
      if (typeof window !== 'undefined') {
        console.log("[LANFileSharing] Removing lan-message event listener");
        window.removeEventListener('lan-message', handleMessageReceived);
      }
    };
  }, [toast]);

  // Auto dismiss notifications after 5 seconds
  useEffect(() => {
    if (fileNotifications.length > 0) {
      const timer = setTimeout(() => {
        setFileNotifications(prev => prev.slice(0, prev.length - 1));
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [fileNotifications]);

  // Handle room creation
  const handleCreateRoom = async () => {
    setIsCreatingRoom(true);
    try {
      const roomId = await createRoom();
      toast({
        title: "Room Created",
        description: `Created and joined room: ${roomId}`,
      });
      // Reset UI state
      setShowRoomInput(false);
      setRoomInputValue('');
    } catch (error) {
      toast({
        title: "Room Creation Failed",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsCreatingRoom(false);
    }
  };

  // Handle room joining
  const handleJoinRoom = () => {
    if (!roomInputValue.trim()) {
      toast({
        title: "Room ID Required",
        description: "Please enter a room ID to join",
        variant: "destructive",
      });
      return;
    }
    
    try {
      joinRoom(roomInputValue.trim());
      // Reset UI state
      setShowRoomInput(false);
      setRoomInputValue('');
    } catch (error) {
      toast({
        title: "Join Room Failed",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  // Handle room leaving
  const handleLeaveRoom = () => {
    if (currentRoomId) {
      leaveRoom();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFiles(e.target.files);
    }
  };

  const togglePeerSelection = (peerId: string) => {
    // Prevent selecting yourself
    if (peerId === currentUser.peerId) return;
    
    setSelectedPeers(prev => 
      prev.includes(peerId) 
        ? prev.filter(id => id !== peerId)
        : [...prev, peerId]
    );
  };

  const handleClipboardPaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setClipboardText(text.slice(0, MAX_CLIPBOARD_TEXT_LENGTH));
    } catch (err) {
      console.error("Failed to read clipboard:", err);
      toast({
        title: "Clipboard access denied",
        description: "Please grant clipboard permission or paste text manually",
        variant: "destructive"
      });
    }
  };

  const shareClipboardText = async () => {
    if (!clipboardText.trim() || selectedPeers.length === 0) return;
    
    setIsSharingText(true);
    
    try {
      // Create a text file with clipboard content
      const textBlob = new Blob([clipboardText], { type: 'text/plain' });
      const textFile = new File([textBlob], `clipboard-${Date.now()}.txt`, { type: 'text/plain' });
      
      // Create torrent from this text file
      const torrent = await createTorrent(textFile, currentUser.name);
      
      console.log(`[LANFileSharing] Created text torrent:`, torrent);
      
      // Create file info to share with peers
      const fileInfo: SharedFileInfo = {
        id: torrent.id,
        name: "Clipboard Text",
        size: textBlob.size,
        magnetURI: torrent.magnetURI,
        sender: {
          id: currentUser.id,
          name: currentUser.name,
          avatar: currentUser.avatar
        },
        timestamp: Date.now(),
        type: 'text',
        previewContent: clipboardText.slice(0, 1000) // Add preview content directly
      };
      
      // Share with selected peers
      for (const peerId of selectedPeers) {
        const messageData = {
          type: 'FILE_SHARE',
          data: fileInfo as unknown as Record<string, unknown>,
          recipient: peerId
        };
        
        console.log("[LANFileSharing] Sending clipboard text message:", messageData);
        sendMessage(messageData);
      }
      
      toast({
        title: "Text shared",
        description: `Successfully shared clipboard text with ${selectedPeers.length} recipient(s)`,
      });
      
      // Reset
      setClipboardText("");
      setSelectedPeers([]);
    } catch (error) {
      console.error("[LANFileSharing] Error sharing clipboard text:", error);
      toast({
        title: "Error sharing text",
        description: "An error occurred while sharing clipboard text",
        variant: "destructive"
      });
    } finally {
      setIsSharingText(false);
    }
  };

  const shareFiles = async () => {
    if (!selectedFiles || selectedFiles.length === 0 || selectedPeers.length === 0) return;
    
    setIsSharing(true);
    
    try {
      // Create a torrent from the selected files
      const file = selectedFiles[0]; // For simplicity, just use the first file
      const torrent = await createTorrent(file, currentUser.name);
      
      console.log(`[LANFileSharing] Created torrent:`, torrent);
      
      // Create file info to share with peers
      const fileInfo: SharedFileInfo = {
        id: torrent.id,
        name: file.name,
        size: file.size,
        magnetURI: torrent.magnetURI,
        sender: {
          id: currentUser.id,
          name: currentUser.name,
          avatar: currentUser.avatar
        },
        timestamp: Date.now()
      };
      
      // Share the torrent info with selected peers
      console.log(`[LANFileSharing] Sharing torrent ${torrent.id} with peers:`, selectedPeers);
      
      // Send file info to each selected peer
      for (const peerId of selectedPeers) {
        console.log(`[LANFileSharing] Sending FILE_SHARE message to peer ${peerId}`);
        
        const messageData = {
          type: 'FILE_SHARE',
          data: fileInfo as unknown as Record<string, unknown>,
          recipient: peerId
        };
        
        console.log("[LANFileSharing] Sending message:", messageData);
        sendMessage(messageData);
      }
      
      // We no longer add the file to our own availableFiles list
      // as the user doesn't want to see their own shared files in the "Files Shared with You" list
      
      // Show toast notification
      toast({
        title: "File shared",
        description: `Successfully shared "${file.name}" with ${selectedPeers.length} recipient(s)`,
      });
      
      // Reset the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setSelectedFiles(null);
      setSelectedPeers([]);
    } catch (error) {
      console.error("[LANFileSharing] Error sharing files:", error);
      toast({
        title: "Error sharing file",
        description: "An error occurred while sharing the file",
        variant: "destructive"
      });
    } finally {
      setIsSharing(false);
    }
  };

  // Function to determine file type from name
  const getFileType = (fileName: string): string => {
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
  };

  // Function to get file icon based on type
  const getFileIcon = (type: string) => {
    switch (type) {
      case 'image':
        return <ImageIcon className="h-5 w-5 text-[#9D4EDD]" />;
      case 'video':
        return <FileVideo className="h-5 w-5 text-[#9D4EDD]" />;
      case 'audio':
        return <FileAudio className="h-5 w-5 text-[#9D4EDD]" />;
      case 'text':
        return <FileText className="h-5 w-5 text-[#9D4EDD]" />;
      default:
        return <FileIcon className="h-5 w-5 text-[#9D4EDD]" />;
    }
  };
  
  // Helper to get MIME type from filename
  const getMimeType = (filename: string): string => {
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
  };

  // Function to preview a file before downloading
  const previewBeforeDownload = async (file: SharedFileInfo) => {
    // Don't regenerate if already previewing or has preview
    if (file.isGeneratingPreview || file.previewUrl || file.previewContent) return;
    
    const fileType = getFileType(file.name);
    // Only try to preview supported formats
    if (!['image', 'video', 'audio', 'text', 'pdf'].includes(fileType)) return;
    
    // Check if file is too large for preview
    if (file.size > MAX_PREVIEW_SIZE) {
      toast({
        title: "File too large for preview",
        description: "Only files under 10MB can be previewed without downloading",
      });
      return;
    }
    
    try {
      // Mark file as generating preview
      setAvailableFiles(prev => 
        prev.map(f => {
          if (f.id === file.id) {
            return { ...f, isGeneratingPreview: true };
          }
          return f;
        })
      );
      
      console.log(`[LANFileSharing] Generating preview for ${file.name}`);
      
      // Create a temporary client instance to download just enough for preview
      const tempClient = await window.webTorrentClient?.add(file.magnetURI);
      
      if (!tempClient) {
        throw new Error("Failed to create preview download");
      }
      
      // Store reference to be able to destroy it later
      setPreviewTorrents(prev => ({ ...prev, [file.id]: tempClient }));
      
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
        
        // Create buffer for partial content
        let partialContent: Uint8Array | null = null;
        
        // Create a promise to wait for enough data for preview
        const previewPromise = new Promise<string>((resolve, reject) => {
          let downloadedEnough = false;
          
          const checkDownload = () => {
            // Only proceed if we downloaded at least 50KB or 10% of file
            const minBytes = Math.min(50 * 1024, file.size * 0.1);
            
            if (tempClient.downloaded >= minBytes && !downloadedEnough) {
              downloadedEnough = true;
              
              try {
                // Get partial content as stream or buffer
                const stream = torrentFile.createReadStream({ 
                  start: 0,
                  end: Math.min(previewLength - 1, torrentFile.length - 1)
                });
                
                const chunks: Uint8Array[] = [];
                
                stream.on('data', (chunk: Uint8Array) => {
                  chunks.push(chunk);
                });
                
                stream.on('end', () => {
                  partialContent = new Uint8Array(Buffer.concat(chunks));
                  
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
        setAvailableFiles(prev => 
          prev.map(f => {
            if (f.id === file.id) {
              return { 
                ...f, 
                previewUrl,
                type: fileType,
                isGeneratingPreview: false 
              };
            }
            return f;
          })
        );
      } else if (fileType === 'text') {
        // For text files, get a small preview of the content
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
        setAvailableFiles(prev => 
          prev.map(f => {
            if (f.id === file.id) {
              return { 
                ...f, 
                previewContent,
                type: fileType,
                isGeneratingPreview: false 
              };
            }
            return f;
          })
        );
      }
    } catch (error) {
      console.error(`[LANFileSharing] Error generating preview:`, error);
      
      // Reset generating state
      setAvailableFiles(prev => 
        prev.map(f => {
          if (f.id === file.id) {
            return { ...f, isGeneratingPreview: false };
          }
          return f;
        })
      );
      
      toast({
        title: "Preview generation failed",
        description: "Could not generate preview for this file",
        variant: "destructive"
      });
    }
  };

  // Function to open preview dialog
  const openPreview = (file: SharedFileInfo) => {
    setPreviewFile(file);
    setIsPreviewOpen(true);
    
    // For text files that have been downloaded, get the full content
    if (file.type === 'text') {
      const downloadedFile = downloadingFiles.find(df => df.magnetURI === file.magnetURI);
      
      if (downloadedFile?.torrent && downloadedFile.progress === 100) {
        const torrentFile = downloadedFile.torrent.files[0];
        
        if (torrentFile) {
          torrentFile.getBuffer((err, buffer) => {
            if (err || !buffer) return;
            
            try {
              const textContent = new TextDecoder().decode(buffer);
              setPreviewContent(textContent);
            } catch (error) {
              console.error("Error decoding text file:", error);
              setPreviewContent("Error loading file content");
            }
          });
        }
      }
    }
  };
  
  // Clean up preview torrents when component unmounts
  useEffect(() => {
    return () => {
      // Destroy all preview torrents
      Object.values(previewTorrents).forEach(torrent => {
        try {
          if (torrent && typeof torrent.destroy === 'function') {
            torrent.destroy();
          }
        } catch (e) {
          console.error("[LANFileSharing] Error destroying preview torrent:", e);
        }
      });
    };
  }, [previewTorrents]);

  // Track when downloading is complete to possibly show preview
  useEffect(() => {
    downloadingFiles.forEach(file => {
      // Find matching file in availableFiles
      const availableFile = availableFiles.find(af => af.magnetURI === file.magnetURI);
      
      if (availableFile && file.progress === 100 && file.torrent) {
        // File is completely downloaded, we can create preview
        const fileType = getFileType(file.name);
        
        // Only create previews for supported formats and small enough files
        if (['image', 'text', 'video', 'audio'].includes(fileType) && file.size < MAX_PREVIEW_SIZE) {
          const torrentFile = file.torrent.files[0];
          
          if (torrentFile) {
            if (fileType === 'text') {
              // For text files, get the content
              torrentFile.getBuffer((err, buffer) => {
                if (err || !buffer) return;
                
                try {
                  const textContent = new TextDecoder().decode(buffer);
                  
                  // Update availableFiles with the text content
                  setAvailableFiles(prev => 
                    prev.map(f => {
                      if (f.id === availableFile.id) {
                        return {
                          ...f,
                          type: fileType,
                          previewContent: textContent.slice(0, 1000) // Limit preview to first 1000 chars
                        };
                      }
                      return f;
                    })
                  );
                } catch (error) {
                  console.error("Error decoding text file:", error);
                }
              });
            } else {
              // For other file types, get blob URL
              torrentFile.getBlobURL((err, url) => {
                if (err || !url) return;
                
                // Update availableFiles with the preview URL
                setAvailableFiles(prev => 
                  prev.map(f => {
                    if (f.id === availableFile.id) {
                      return {
                        ...f,
                        type: fileType,
                        previewUrl: url
                      };
                    }
                    return f;
                  })
                );
              });
            }
          }
        }
      }
    });
  }, [downloadingFiles, availableFiles]);

  const downloadSharedFile = async (magnetURI: string) => {
    if (!magnetURI.trim()) return;
    
    try {
      await downloadTorrent(magnetURI);
      
      // Remove the file from notifications if it exists there
      setFileNotifications(prev => 
        prev.filter(file => file.magnetURI !== magnetURI)
      );
    } catch (error) {
      console.error("Error downloading file:", error);
    }
  };

  const dismissNotification = (fileId: string) => {
    setFileNotifications(prev => 
      prev.filter(file => file.id !== fileId)
    );
  };

  // Calculate total upload/download speeds
  const uploadSpeed = [...sharedFiles, ...downloadingFiles].reduce(
    (total, file) => total + (file.torrent?.uploadSpeed || 0), 
    0
  );
  
  const downloadSpeed = downloadingFiles.reduce(
    (total, file) => total + (file.downloadSpeed || 0), 
    0
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setSelectedFiles(e.dataTransfer.files);
    }
  };

  // Render the room controls UI
  const renderRoomControls = () => {
    return (
      <Card className="w-full border border-[#9D4EDD]/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-md gradient-text flex items-center gap-2">
            <Users size={16} />
            Room Management
          </CardTitle>
          <CardDescription>
            {currentRoomId 
              ? `Currently in room: ${currentRoomId}` 
              : "Create or join a room to share files across networks"}
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <div className="flex flex-col gap-4">
            {currentRoomId ? (
              <div className="flex items-center gap-2">
                <Badge className="bg-[#9D4EDD]">{currentRoomId}</Badge>
                <Button 
                  size="sm" 
                  onClick={() => {
                    navigator.clipboard.writeText(currentRoomId);
                    toast({
                      title: "Room ID Copied",
                      description: "Room ID copied to clipboard",
                    });
                  }}
                >
                  Copy ID
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={handleLeaveRoom}
                >
                  Leave Room
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {showRoomInput ? (
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Enter Room ID"
                        value={roomInputValue}
                        onChange={(e) => setRoomInputValue(e.target.value)}
                      />
                      <Button onClick={handleJoinRoom}>Join</Button>
                      <Button 
                        variant="outline" 
                        onClick={() => setShowRoomInput(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                    <div className="text-center">
                      <span className="text-sm text-muted-foreground">Or</span>
                    </div>
                    <Button 
                      className="w-full"
                      onClick={handleCreateRoom}
                      disabled={isCreatingRoom}
                    >
                      {isCreatingRoom ? (
                        <>
                          <Loader className="mr-2 h-4 w-4 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        'Create New Room'
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button 
                      onClick={() => setShowRoomInput(true)}
                      className="w-full"
                    >
                      Create/Join Room
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="lan-sharing w-full space-y-6">
      {/* Room Management Section */}
      {renderRoomControls()}
      
      {/* Status Card */}
      <Card className="w-full bg-card/50 backdrop-blur-sm border-[#9D4EDD]/20 overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${isDiscoveryActive ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="font-medium text-sm">Local Network</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-[#9D4EDD]/10 text-[#9D4EDD] border-[#9D4EDD]/30">
                <Users className="h-3 w-3 mr-1" />
                {localUsers.length} Online
              </Badge>
              <Badge variant="outline" className="bg-[#9D4EDD]/10 text-[#9D4EDD] border-[#9D4EDD]/30">
                <UploadCloud className="h-3 w-3 mr-1" />
                {(uploadSpeed / 1024).toFixed(1)} KB/s
              </Badge>
              <Badge variant="outline" className="bg-[#9D4EDD]/10 text-[#9D4EDD] border-[#9D4EDD]/30">
                <DownloadCloud className="h-3 w-3 mr-1" />
                {(downloadSpeed / 1024).toFixed(1)} KB/s
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* File share notifications */}
      {fileNotifications.length > 0 && (
        <div className="fixed top-4 right-4 z-50 space-y-2 max-w-[90%] sm:max-w-md">
          {fileNotifications.map(file => (
            <div key={file.id} className="bg-black/80 backdrop-blur-md border border-[#9D4EDD]/30 rounded-lg p-3 shadow-lg flex items-center justify-between animate-in slide-in-from-right">
              <div className="flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarFallback style={{ backgroundColor: file.sender.avatar || '#9D4EDD' }}>
                    {file.sender.name.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium text-white">{file.sender.name} shared a file</p>
                  <p className="text-xs text-white/70 truncate max-w-full">{file.name}</p>
                </div>
              </div>
              <div className="flex gap-1">
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="h-7 w-7 text-white/70 hover:text-white hover:bg-[#9D4EDD]/20"
                  onClick={() => downloadSharedFile(file.magnetURI)}
                >
                  <DownloadCloud className="h-4 w-4" />
                </Button>
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="h-7 w-7 text-white/70 hover:text-white hover:bg-[#9D4EDD]/20"
                  onClick={() => dismissNotification(file.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="sm:max-w-[90vw] max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{previewFile?.name}</DialogTitle>
          </DialogHeader>
          
          <div className="mt-4">
            {previewFile?.type === 'image' && previewFile.previewUrl && (
              <img 
                src={previewFile.previewUrl} 
                alt={previewFile.name} 
                className="max-w-full h-auto rounded-md"
              />
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
                {previewContent || previewFile.previewContent || "Loading content..."}
              </pre>
            )}
            
            {(!previewFile?.type || previewFile.type === 'other') && (
              <div className="text-center p-6 bg-secondary/20 rounded-md">
                <FileIcon className="h-16 w-16 text-[#9D4EDD]/50 mx-auto mb-4" />
                <p>Preview not available for this file type</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Users and Sharing Column */}
        <div className="md:col-span-1 space-y-6">
          {/* Available Users Card */}
          <Card className="w-full bg-card/50 backdrop-blur-sm border-[#9D4EDD]/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-medium flex items-center gap-2">
                <Users className="h-5 w-5 text-[#9D4EDD]" />
                <span className="gradient-text">Available Devices</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {localUsers.length > 0 ? (
                  localUsers.map(user => (
                    <div 
                      key={user.id}
                      className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all ${
                        selectedPeers.includes(user.peerId) 
                          ? 'bg-[#9D4EDD]/20 border border-[#9D4EDD]/50' 
                          : 'bg-secondary/30 border border-[#9D4EDD]/20 hover:bg-[#9D4EDD]/10'
                      }`}
                      onClick={() => togglePeerSelection(user.peerId)}
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarFallback style={{ backgroundColor: user.avatar || '#9D4EDD' }}>
                          {user.name.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium truncate">{user.name}</span>
                          {selectedPeers.includes(user.peerId) && (
                            <Check className="h-4 w-4 text-[#9D4EDD]" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {"Unknown"}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex items-center justify-center w-full p-8 bg-secondary/10 rounded-lg">
                    <div className="text-center">
                      <Users className="h-10 w-10 text-[#9D4EDD]/30 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Waiting for others to join</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Share Tabs Card */}
          <Card className="w-full bg-card/50 backdrop-blur-sm border-[#9D4EDD]/20">
            <div className="border-b border-[#9D4EDD]/20">
              <div className="flex">
                <button
                  onClick={() => setIsTextTabActive(false)}
                  className={`flex-1 px-4 py-3 font-medium text-sm ${!isTextTabActive ? 'text-[#9D4EDD] border-b-2 border-[#9D4EDD]' : 'text-muted-foreground hover:text-[#9D4EDD]/70'}`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <FileIcon className="h-4 w-4" />
                    Share Files
                  </div>
                </button>
                <button
                  onClick={() => setIsTextTabActive(true)}
                  className={`flex-1 px-4 py-3 font-medium text-sm ${isTextTabActive ? 'text-[#9D4EDD] border-b-2 border-[#9D4EDD]' : 'text-muted-foreground hover:text-[#9D4EDD]/70'}`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <FileText className="h-4 w-4" />
                    Share Text
                  </div>
                </button>
              </div>
            </div>
            <CardContent className="pt-4">
              {!isTextTabActive ? (
                <div className="space-y-4">
                  <div
                    className={`border-2 border-dashed rounded-lg p-4 text-center transition-all ${
                      isDragging
                        ? "border-[#9D4EDD] bg-[#9D4EDD]/10"
                        : "border-[#9D4EDD]/30 hover:border-[#9D4EDD]/60 bg-secondary/5"
                    }`}
                    onDragOver={handleDragOver}
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    <div className="flex flex-col items-center justify-center py-4">
                      <div className="bg-[#9D4EDD]/10 p-3 rounded-full mb-3">
                        <UploadCloud className="h-6 w-6 text-[#9D4EDD]" />
                      </div>
                      <p className="text-sm mb-1">Drag files here or</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        className="border-[#9D4EDD]/30 hover:bg-[#9D4EDD]/10"
                      >
                        Browse Files
                      </Button>
                      <input 
                        type="file" 
                        ref={fileInputRef}
                        onChange={handleFileChange} 
                        multiple 
                        className="hidden"
                      />
                    </div>
                  </div>
                  
                  {selectedFiles && selectedFiles.length > 0 && (
                    <div>
                      <div className="space-y-2 mb-3">
                        {Array.from(selectedFiles).slice(0, 3).map((file, index) => (
                          <div key={index} className="flex items-center gap-2 p-2 bg-secondary/20 rounded-md">
                            <div className="bg-[#9D4EDD]/10 p-1.5 rounded-full">
                              {getFileIcon(getFileType(file.name))}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{file.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {(file.size / 1024 / 1024).toFixed(2)} MB
                              </p>
                            </div>
                          </div>
                        ))}
                        {selectedFiles.length > 3 && (
                          <p className="text-xs text-center text-muted-foreground">
                            +{selectedFiles.length - 3} more files
                          </p>
                        )}
                      </div>
                      
                      <Button 
                        onClick={shareFiles} 
                        disabled={selectedPeers.length === 0 || isSharing || !isClientReady}
                        className="w-full bg-[#9D4EDD] hover:bg-[#7B2CBF]"
                      >
                        {isSharing ? (
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Sharing...</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <UploadCloud className="h-4 w-4" />
                            {selectedPeers.length > 0 
                              ? `Share with ${selectedPeers.length} ${selectedPeers.length === 1 ? 'device' : 'devices'}` 
                              : 'Select devices first'}
                          </div>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-secondary/10 rounded-lg p-4">
                    <textarea 
                      value={clipboardText}
                      onChange={(e) => setClipboardText(e.target.value.slice(0, MAX_CLIPBOARD_TEXT_LENGTH))}
                      placeholder="Type or paste text to share with others..."
                      className="w-full h-24 p-2 text-sm rounded-md border border-[#9D4EDD]/30 bg-background focus:border-[#9D4EDD] focus:ring-1 focus:ring-[#9D4EDD] focus:outline-none"
                    />
                    <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                      <span>{clipboardText.length}/{MAX_CLIPBOARD_TEXT_LENGTH}</span>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={handleClipboardPaste}
                        className="h-7 text-xs border-[#9D4EDD]/30 hover:bg-[#9D4EDD]/10"
                      >
                        Paste from Clipboard
                      </Button>
                    </div>
                  </div>
                  
                  <Button 
                    onClick={shareClipboardText} 
                    disabled={!clipboardText.trim() || selectedPeers.length === 0 || isSharingText || !isClientReady}
                    className="w-full bg-[#9D4EDD] hover:bg-[#7B2CBF]"
                  >
                    {isSharingText ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Sharing...</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        {selectedPeers.length > 0 
                          ? `Share text with ${selectedPeers.length} ${selectedPeers.length === 1 ? 'device' : 'devices'}` 
                          : 'Select devices first'}
                      </div>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        
        {/* Files Shared With You Column */}
        <div className="md:col-span-2">
          <Card className="w-full bg-card/50 backdrop-blur-sm border-[#9D4EDD]/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-medium flex items-center gap-2">
                <DownloadCloud className="h-5 w-5 text-[#9D4EDD]" />
                <span className="gradient-text">Files Shared with You</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {availableFiles.filter(file => file.sender.id !== currentUser.id).length > 0 ? (
                <div className="space-y-4">
                  {availableFiles
                    .filter(file => file.sender.id !== currentUser.id)
                    .map(file => {
                    // Check if this file is currently downloading
                    const isDownloading = downloadingFiles.some(df => 
                      df.magnetURI === file.magnetURI
                    );
                    
                    // Find download progress if available
                    const downloadInfo = downloadingFiles.find(df => 
                      df.magnetURI === file.magnetURI
                    );

                    // Determine if file is previewable
                    const fileType = getFileType(file.name);
                    const isPreviewable = ['image', 'video', 'audio', 'text', 'pdf'].includes(fileType);
                    const isFullyDownloaded = downloadInfo?.progress === 100;
                    const isSmallEnough = file.size < MAX_PREVIEW_SIZE;
                    const hasPreview = file.previewUrl || file.previewContent;
                    const canShowPreview = isPreviewable && (isFullyDownloaded || hasPreview) && isSmallEnough;
                    
                    return (
                      <div key={file.id} className="bg-secondary/30 border border-[#9D4EDD]/20 rounded-lg p-4 hover:bg-secondary/40 transition-colors">
                        <div className="flex items-start">
                          <div className="flex-shrink-0 mr-4">
                            <Avatar className="h-10 w-10">
                              <AvatarFallback style={{ backgroundColor: file.sender.avatar || '#9D4EDD' }}>
                                {file.sender.name.substring(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <h3 className="text-sm font-medium truncate mr-2">{file.name}</h3>
                              {isFullyDownloaded && <Check className="h-4 w-4 text-green-500" />}
                            </div>
                            
                            <div className="flex items-center gap-2 mt-1">
                              <p className="text-xs text-muted-foreground">
                                From: {file.sender.name}
                              </p>
                              <span className="text-muted-foreground">•</span>
                              <p className="text-xs text-muted-foreground">
                                {(file.size / 1024 / 1024).toFixed(2)} MB
                              </p>
                              <span className="text-muted-foreground">•</span>
                              <p className="text-xs text-muted-foreground">
                                {new Date(file.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                              </p>
                            </div>
                            
                            {/* Preview thumbnails */}
                            {canShowPreview && (
                              <div className="mt-3" onClick={() => openPreview(file)}>
                                {fileType === 'image' && file.previewUrl && (
                                  <div className="relative group cursor-pointer rounded-md overflow-hidden">
                                    <img 
                                      src={file.previewUrl} 
                                      alt={file.name}
                                      className="h-24 w-auto max-w-[300px] object-cover" 
                                    />
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                                      <Eye className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                  </div>
                                )}
                                
                                {fileType === 'video' && file.previewUrl && (
                                  <div className="relative group cursor-pointer rounded-md overflow-hidden">
                                    <video 
                                      src={file.previewUrl}
                                      className="h-24 w-auto max-w-[300px] object-cover"
                                    />
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                      <Play className="h-8 w-8 text-white" />
                                    </div>
                                  </div>
                                )}
                                
                                {fileType === 'text' && file.previewContent && (
                                  <div className="mt-2 bg-secondary/30 p-3 rounded-md text-xs cursor-pointer group">
                                    <div className="max-h-16 overflow-hidden relative">
                                      <pre className="font-mono text-xs leading-tight opacity-80">
                                        {file.previewContent}
                                      </pre>
                                      <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-secondary/80 to-transparent"></div>
                                    </div>
                                    <div className="text-center text-xs text-[#9D4EDD] mt-1 opacity-70 group-hover:opacity-100">
                                      Click to expand
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                            
                            {/* Download progress */}
                            {isDownloading && downloadInfo && (
                              <div className="mt-3">
                                <div className="flex justify-between text-xs mb-1">
                                  <span className="text-[#9D4EDD]">
                                    Downloading
                                  </span>
                                  <span className="text-[#9D4EDD]">
                                    {normalizeProgress(downloadInfo.progress)} %
                                  </span>
                                </div>
                                <Progress 
                                  value={normalizeProgress(downloadInfo.progress)} 
                                  className="h-2"
                                  indicatorClassName="bg-[#9D4EDD]"
                                />
                                <div className="flex justify-between text-xs mt-1 text-muted-foreground">
                                  <span>
                                    {((downloadInfo.downloadSpeed || 0) / 1024 / 1024).toFixed(2)} MB/s
                                  </span>
                                  <span>
                                    {downloadInfo.downloadedSize && downloadInfo.size 
                                      ? `${(downloadInfo.downloadedSize / 1024 / 1024).toFixed(1)} of ${(downloadInfo.size / 1024 / 1024).toFixed(1)} MB` 
                                      : "Calculating..."}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                          
                          <div className="flex-shrink-0 ml-4 flex flex-col gap-2">
                            {canShowPreview && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openPreview(file)}
                                className="bg-[#9D4EDD]/5 border-[#9D4EDD]/30 hover:bg-[#9D4EDD]/10"
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                Preview
                              </Button>
                            )}
                            
                            {isPreviewable && !hasPreview && !file.isGeneratingPreview && file.size < MAX_PREVIEW_SIZE && !isDownloading && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => previewBeforeDownload(file)}
                                disabled={!isClientReady}
                                className="border-[#9D4EDD]/30 hover:bg-[#9D4EDD]/10"
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                Generate Preview
                              </Button>
                            )}
                            
                            {file.isGeneratingPreview && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled
                                className="border-[#9D4EDD]/30"
                              >
                                <div className="w-4 h-4 border-2 border-[#9D4EDD] border-t-transparent rounded-full animate-spin mr-2" />
                                Previewing...
                              </Button>
                            )}
                            
                            {!isDownloading && (
                              <Button 
                                size="sm"
                                onClick={() => downloadSharedFile(file.magnetURI)}
                                disabled={!isClientReady}
                                className="bg-[#9D4EDD] hover:bg-[#7B2CBF]"
                              >
                                <DownloadCloud className="h-4 w-4 mr-2" />
                                Download
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-64 bg-secondary/10 rounded-lg">
                  <FileText className="h-12 w-12 text-[#9D4EDD]/30 mb-4" />
                  <p className="text-muted-foreground">No files have been shared with you yet</p>
                  <p className="text-xs text-muted-foreground mt-2">Files shared by others on your network will appear here</p>
                </div>
              )}
            </CardContent>
            
            {downloadingFiles.length > 0 && (
              <CardFooter className="border-t border-[#9D4EDD]/20 pt-4">
                <div className="w-full">
                  <h4 className="text-sm font-medium text-[#9D4EDD] mb-2">Active Downloads</h4>
                  <div className="space-y-2">
                    {downloadingFiles.map(file => (
                      <div key={file.id} className="bg-secondary/20 rounded-md p-2">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="truncate max-w-[70%] font-medium">
                            {file.name}
                          </span>
                          <span className="text-[#9D4EDD]">{normalizeProgress(file.progress)}%</span>
                        </div>
                        <Progress 
                          value={normalizeProgress(file.progress)} 
                          className="h-1.5"
                          indicatorClassName="bg-[#9D4EDD]"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </CardFooter>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
} 