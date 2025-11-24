"use client";

import { memo, useCallback } from '@/lib/performance';
import { TorrentFile } from '@/hooks/use-webtorrent';
import FileTypeIcon from '@/components/file-icon';
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { 
  Copy, 
  X, 
  Eye, 
  UploadCloud, 
  Download 
} from "lucide-react";
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface FileItemProps {
  file: TorrentFile;
  onPreview?: (file: TorrentFile) => void;
  onDelete: (fileId: string) => void;
  onCopyLink: (magnetURI: string) => void;
}

// Individual file item component (memoized)
const FileItem = memo(({ file, onPreview, onDelete, onCopyLink }: FileItemProps) => {
  const { id, name, size, progress, magnetURI, owner, downloading, uploading, connecting } = file;
  
  // Helper function to normalize progress
  const normalizeProgress = (prog?: number): number => {
    if (!prog) return 0;
    return Math.min(Math.round(prog), 100);
  };
  
  // Get file type from name
  const getFileType = (fileName: string): string => {
    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(extension)) {
      return 'image';
    }
    
    if (['mp4', 'webm', 'ogg', 'mov', 'avi'].includes(extension)) {
      return 'video';
    }
    
    if (['mp3', 'wav', 'ogg', 'aac', 'm4a'].includes(extension)) {
      return 'audio';
    }
    
    if (['txt', 'md', 'json', 'csv', 'js', 'jsx', 'ts', 'tsx', 'html', 'css'].includes(extension)) {
      return 'text';
    }
    
    if (extension === 'pdf') {
      return 'pdf';
    }
    
    return 'other';
  };
  
  // Format size for display
  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };
  
  // Format ETA for download
  const formatETA = (seconds: number): string => {
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
  };
  
  // Format download progress
  const formatDownloadProgress = (downloaded?: number, total?: number): string => {
    if (!downloaded || !total) return 'Waiting for data...';
    return `${formatSize(downloaded)} of ${formatSize(total)}`;
  };
  
  const fileType = getFileType(name);
  
  return (
    <div
      className="flex flex-col p-2 sm:p-3 rounded-lg border border-[#9D4EDD]/30 bg-secondary/30 hover:bg-secondary/50 transition-colors"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="bg-[#9D4EDD]/10 p-1.5 sm:p-2 rounded-full">
            <FileTypeIcon type={fileType} size={owner === "You" ? 4 : 5} />
          </div>
          <div className="flex flex-col">
            <span className="font-medium text-sm sm:text-base truncate max-w-[200px] sm:max-w-none">{name}</span>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>{typeof size === 'number' ? formatSize(size) : size}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* Preview button */}
          {onPreview && progress === 100 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      onPreview(file);
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
          
          {/* Copy link button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    if (magnetURI) {
                      onCopyLink(magnetURI);
                    }
                  }}
                  className="h-8 w-8 hover:bg-[#9D4EDD]/20"
                >
                  <Copy className="h-4 w-4 text-[#9D4EDD]" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Copy Iroh ticket</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {/* Delete button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    onDelete(id);
                  }}
                  className="h-8 w-8 hover:bg-[#9D4EDD]/20"
                >
                  <X className="h-4 w-4 text-[#9D4EDD]" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{downloading ? 'Cancel download' : 'Remove file'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
      
      {/* Progress bar for uploading files */}
      {uploading && typeof progress === 'number' && (
        <div className="mt-2">
          <div className="flex justify-between text-xs mb-1">
            <span>Uploading</span>
            <span>{normalizeProgress(progress)}%</span>
          </div>
          <Progress 
            value={normalizeProgress(progress)} 
            className="h-2"
            indicatorClassName="bg-[#9D4EDD]"
          />
        </div>
      )}
      
      {/* Progress bar for downloading files */}
      {(downloading || connecting) && (
        <div className="mt-2 space-y-2">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-[#9D4EDD]">
              {connecting ? "Connecting to file..." : "Downloading"}
            </span>
            <span className="text-[#9D4EDD]">
              {connecting ? (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 border-2 border-[#9D4EDD] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                `${normalizeProgress(progress)}%`
              )}
            </span>
          </div>
          {!connecting && (
            <>
              <Progress 
                value={normalizeProgress(progress)} 
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
                      formatETA(file.size * (1 - (file.progress ?? 0) / 100) / file.downloadSpeed) :
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
  );
});

// Memoized file list section
const FileListSection = memo(({ 
  title, 
  icon: Icon, 
  files, 
  emptyText, 
  onPreview, 
  onDelete, 
  onCopyLink 
}: { 
  title: string; 
  icon: React.ElementType; 
  files: TorrentFile[];
  emptyText: string;
  onPreview?: (file: TorrentFile) => void;
  onDelete: (fileId: string) => void;
  onCopyLink: (magnetURI: string) => void;
}) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-[#9D4EDD]" />
          <h4 className="text-sm font-medium text-[#9D4EDD]">{title}</h4>
        </div>
        <Badge variant="outline" className="border-[#9D4EDD]/30 text-[#9D4EDD] text-xs">
          {files.length} files
        </Badge>
      </div>
      
      <div className="space-y-2">
        {files.length > 0 ? (
          files.map(file => (
            <FileItem 
              key={file.id} 
              file={file} 
              onPreview={onPreview} 
              onDelete={onDelete}
              onCopyLink={onCopyLink}
            />
          ))
        ) : (
          <div className="flex items-center justify-center p-4 bg-secondary/10 rounded-lg">
            <p className="text-sm text-muted-foreground">{emptyText}</p>
          </div>
        )}
      </div>
    </div>
  );
});

interface FileListProps {
  files: TorrentFile[];
  onPreviewFile?: (file: TorrentFile) => void;
  onFileDelete: (fileId: string) => void;
  onCopyMagnetLink: (magnetURI: string) => void;
}

// Main exported component (memoized)
export default memo(function FileList({ 
  files, 
  onPreviewFile, 
  onFileDelete, 
  onCopyMagnetLink 
}: FileListProps) {
  // Split files into shared and downloaded
  const sharedFiles = files.filter(file => file.owner === "You");
  const downloadedFiles = files.filter(file => file.owner !== "You");
  
  // Keep callback references stable
  const handleCopyLink = useCallback((magnetURI: string) => {
    navigator.clipboard.writeText(magnetURI);
    onCopyMagnetLink(magnetURI);
  }, [onCopyMagnetLink]);
  
  const handleDelete = useCallback((fileId: string) => {
    onFileDelete(fileId);
  }, [onFileDelete]);
  
  return (
    <div className="space-y-6">
      <FileListSection
        title="Your Shared Files"
        icon={UploadCloud}
        files={sharedFiles}
        emptyText="You haven't shared any files yet"
        onPreview={onPreviewFile}
        onDelete={handleDelete}
        onCopyLink={handleCopyLink}
      />
      
      <FileListSection
        title="Downloaded Files"
        icon={Download}
        files={downloadedFiles}
        emptyText="No files have been downloaded yet"
        onPreview={onPreviewFile}
        onDelete={handleDelete}
        onCopyLink={handleCopyLink}
      />
    </div>
  );
}); 
