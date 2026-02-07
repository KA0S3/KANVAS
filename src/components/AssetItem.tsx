 import React from "react";
import { X, FileText, Image, Film, Music, Code, File, Move, Maximize2 } from "lucide-react";
import { AssetContextMenu } from '@/components/AssetContextMenu';
import type { CustomField, CustomFieldValue, ViewportDisplaySettings } from "@/types/extendedAsset";

export interface Asset {
  id: string;
  name: string;
  type: "image" | "document" | "video" | "audio" | "code" | "other";
  x: number;
  y: number;
  width: number;
  height: number;
  parentId?: string; // undefined for root-level assets
  children: string[]; // array of child asset IDs
  description?: string;
  customFields: CustomField[];
  customFieldValues: CustomFieldValue[];
  thumbnail?: string; // Base64 encoded image
  background?: string; // Base64 encoded image
  tags?: string[];
  viewportConfig?: {
    zoom: number;
    panX: number;
    panY: number;
  };
  backgroundConfig?: {
    color?: string;
    image?: string;
    gridSize?: number;
  };
  viewportDisplaySettings?: ViewportDisplaySettings;
  createdAt?: number;
  updatedAt?: number;
  isExpanded?: boolean;
  isLocked?: boolean;
  borderShape?: 'square' | 'round';
}

interface AssetItemProps {
  asset: Asset;
  onDelete: (id: string) => void;
  onMouseDown: (e: React.MouseEvent, asset: Asset) => void;
  onDoubleClick?: (asset: Asset) => void;
  isSelected: boolean;
  onResize?: (assetId: string, width: number, height: number) => void;
  onEdit?: (asset: Asset) => void;
  onSelectAndFocus?: (asset: Asset) => void;
}

const iconMap = {
  image: Image,
  document: FileText,
  video: Film,
  audio: Music,
  code: Code,
  other: File,
};

const colorMap = {
  image: "text-primary",
  document: "text-accent",
  video: "text-secondary",
  audio: "text-glow-primary",
  code: "text-primary",
  other: "text-muted-foreground",
};

 export function AssetItem({ asset, onDelete, onMouseDown, onDoubleClick, isSelected, onResize, onEdit, onSelectAndFocus }: AssetItemProps) {
  const Icon = iconMap[asset.type];
  const colorClass = colorMap[asset.type];

  const [contextMenu, setContextMenu] = React.useState<{
    visible: boolean;
    x: number;
    y: number;
  }>({ visible: false, x: 0, y: 0 });

  // Get viewport display settings
  const displaySettings = asset.viewportDisplaySettings || {
    name: true,
    description: false,
    thumbnail: true,
    portraitBlur: 0,
  };

  // Get portrait image from either thumbnail or custom fields
  const portraitImage = asset.thumbnail || 
    asset.customFieldValues?.find(v => {
      const field = asset.customFields?.find(f => f.id === v.fieldId);
      return field?.label?.toLowerCase() === 'portrait' && field.type === 'image' && v.value;
    })?.value;
  const displayedCustomFields = (asset.customFields || [])
    .filter(field => field.displayInViewport && field.label?.toLowerCase() !== 'portrait')
    .map(field => {
      const value = asset.customFieldValues?.find(v => v.fieldId === field.id);
      return {
        label: field.label,
        value: value?.value || '',
        type: field.type,
      };
    });

  const [isResizing, setIsResizing] = React.useState(false);
  const [resizeStart, setResizeStart] = React.useState({ x: 0, y: 0, width: 0, height: 0 });

  const handleContextMenu = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
    });
  }, []);

  const closeContextMenu = React.useCallback(() => {
    setContextMenu({ visible: false, x: 0, y: 0 });
  }, []);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    setIsResizing(true);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: asset.width || 200,
      height: asset.height || 150,
    });
  };

  const handleMouseMove = React.useCallback((e: MouseEvent) => {
    if (!isResizing || !onResize) return;
    
    const deltaX = e.clientX - resizeStart.x;
    const deltaY = e.clientY - resizeStart.y;
    
    const newWidth = Math.max(100, resizeStart.width + deltaX);
    const newHeight = Math.max(80, resizeStart.height + deltaY);
    
    onResize(asset.id, newWidth, newHeight);
  }, [isResizing, resizeStart, asset.id, onResize]);

  const handleMouseUp = React.useCallback(() => {
    setIsResizing(false);
  }, []);

  React.useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  return (
    <div
      onMouseDown={(e) => onMouseDown(e, asset)}
      onDoubleClick={() => onDoubleClick?.(asset)}
      onContextMenu={handleContextMenu}
      style={{
        position: "absolute",
        left: asset.x,
        top: asset.y,
        width: asset.width || 200,
        height: asset.height || 150,
        transform: isSelected ? "scale(1.05)" : "scale(1)",
      }}
      className={`asset-item group select-none cursor-grab active:cursor-grabbing transition-transform duration-100 relative ${
        isSelected ? "cosmic-glow z-20 border-primary/60" : "z-10"
      }`}
    >
      <div className={`glass cosmic-glow border border-glass-border/40 rounded-lg h-full overflow-hidden ${
        portraitImage ? 'relative' : 'flex flex-col'
      }`}>
        {/* Thumbnail with overlay content */}
        {portraitImage ? (
          <>
            {/* Full-size background image */}
            <div className="absolute inset-0 w-full h-full">
              <img
                src={portraitImage}
                alt={`${asset.name} portrait`}
                className="w-full h-full object-cover"
                style={{
                  filter: `blur(${displaySettings.portraitBlur * 8}px)`,
                }}
              />
              {/* Dark gradient overlay for text legibility */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
            </div>
            
            {/* Content overlay positioned at bottom */}
            <div className="relative z-10 h-full flex flex-col justify-between p-3">
              {/* Top section with name tab and controls */}
              <div className="flex items-start justify-between gap-2">
                {/* Name with tab styling */}
                {displaySettings.name && (
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Move className="w-4 h-4 text-white/80 opacity-70 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                    <Icon className={`w-5 h-5 ${colorClass} flex-shrink-0`} />
                    <div className="fantasy-tab flex-1 min-w-0">
                      <span className="text-sm font-medium text-white truncate drop-shadow-lg">{asset.name}</span>
                    </div>
                  </div>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(asset.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-white/20 rounded flex-shrink-0"
                >
                  <X className="w-4 h-4 text-white/90" />
                </button>
              </div>

              {/* Middle section with description */}
              {displaySettings.description && asset.description && (
                <div className="flex-1 flex items-center">
                  <div className="text-xs text-white/90 line-clamp-3 drop-shadow-md">
                    {asset.description}
                  </div>
                </div>
              )}

              {/* Bottom section with custom fields and tags */}
              <div className="space-y-2">
                {/* Custom Fields */}
                {displayedCustomFields.length > 0 && (
                  <div className="space-y-1 max-h-20 overflow-y-auto">
                    {displayedCustomFields.map((field, index) => (
                      <div key={index} className="text-xs">
                        <div className="font-medium text-white/90 drop-shadow-md">{field.label}:</div>
                        {field.type === 'image' && field.value ? (
                          <img
                            src={field.value}
                            alt={field.label}
                            className="w-full h-12 object-cover rounded border border-white/20 mt-1"
                          />
                        ) : (
                          <div className="text-white/80 truncate drop-shadow-md">{field.value}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Tags */}
                {asset.tags && asset.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {asset.tags.slice(0, 3).map((tag, index) => (
                      <div
                        key={tag}
                        className="w-2 h-2 rounded-full bg-white/60"
                        title={tag}
                      />
                    ))}
                    {asset.tags.length > 3 && (
                      <div className="text-xs text-white/80">
                        +{asset.tags.length - 3}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          /* Original layout for assets without thumbnails */
          <>
            {/* Asset header */}
            <div className="flex items-center gap-2 mb-2 flex-shrink-0">
              <Move className="w-4 h-4 text-muted-foreground opacity-50 group-hover:opacity-100 transition-opacity" />
              <Icon className={`w-5 h-5 ${colorClass}`} />
              {displaySettings.name && (
                <span className="flex-1 text-sm font-medium text-foreground truncate">{asset.name}</span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(asset.id);
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-destructive/20 rounded"
              >
                <X className="w-4 h-4 text-destructive" />
              </button>
            </div>

            {/* Description */}
            {displaySettings.description && asset.description && (
              <div className="text-xs text-muted-foreground mb-2 line-clamp-2 flex-shrink-0">
                {asset.description}
              </div>
            )}

            {/* Custom Fields */}
            {displayedCustomFields.length > 0 && (
              <div className="space-y-1 flex-shrink-0 overflow-y-auto">
                {displayedCustomFields.map((field, index) => (
                  <div key={index} className="text-xs">
                    <div className="font-medium text-foreground/80">{field.label}:</div>
                    {field.type === 'image' && field.value ? (
                      <img
                        src={field.value}
                        alt={field.label}
                        className="w-full h-16 object-cover rounded border border-glass-border/30 mt-1"
                      />
                    ) : (
                      <div className="text-muted-foreground truncate">{field.value}</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Tags */}
            {asset.tags && asset.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2 flex-shrink-0">
                {asset.tags.slice(0, 3).map((tag, index) => (
                  <div
                    key={tag}
                    className="w-2 h-2 rounded-full bg-primary/60"
                    title={tag}
                  />
                ))}
                {asset.tags.length > 3 && (
                  <div className="text-xs text-muted-foreground">
                    +{asset.tags.length - 3}
                  </div>
                )}
              </div>
            )}
          </>
        )}
        </div>
      
      {/* Resize Handle */}
      {isSelected && (
        <div
          className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize opacity-0 group-hover:opacity-100 transition-opacity"
          onMouseDown={handleResizeStart}
        >
          <Maximize2 className="w-4 h-4 text-primary" />
        </div>
      )}
      
      {/* Context Menu */}
      {contextMenu.visible && (
        <AssetContextMenu
          asset={asset}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={closeContextMenu}
          onEdit={onEdit}
          onSelectAndFocus={onSelectAndFocus}
        />
      )}
    </div>
  );
}