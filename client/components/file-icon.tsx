import { 
  FileText, 
  File as FileIcon, 
  Image as FileImage, 
  FileVideo, 
  FileAudio
} from "lucide-react";
import { memo } from '@/lib/performance';

interface FileTypeIconProps {
  type: string;
  size?: number;
  className?: string;
}

/**
 * A component that displays an appropriate icon based on file type
 * Memoized to prevent re-renders when parent components change
 */
const FileTypeIcon = ({ type, size = 5, className = "" }: FileTypeIconProps) => {
  const iconClass = `h-${size} w-${size} ${className || "text-[#9D4EDD]"}`;

  switch (type) {
    case 'image':
      return <FileImage className={iconClass} />;
    case 'video':
      return <FileVideo className={iconClass} />;
    case 'audio':
      return <FileAudio className={iconClass} />;
    case 'text':
      return <FileText className={iconClass} />;
    case 'pdf':
      return <FileText className={iconClass} />;
    default:
      return <FileIcon className={iconClass} />;
  }
};

export default memo(FileTypeIcon); 