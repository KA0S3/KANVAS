import React from "react";
import { X, FileText, Image, Film, Music, Code, File, Move, Maximize2, Edit, Trash2 } from "lucide-react";
import { AssetContextMenu } from '@/components/AssetContextMenu';
import { useTagStore } from '@/stores/tagStore';
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
    isClear?: boolean;
    color?: string;
    image?: string;
    position?: { x: number; y: number };
    scale?: number;
    gridSize?: number;
    imageSize?: { width: number; height: number };
    edgeOpacity?: number;
    useParchment?: boolean;
  };
  viewportDisplaySettings?: ViewportDisplaySettings;
  createdAt?: number;
  updatedAt?: number;
  isExpanded?: boolean;
  isLocked?: boolean;
  borderShape?: 'square' | 'circle';
  showTagBorder?: boolean;
}

interface AssetItemProps {
  asset: Asset;
  onDelete: (id: string) => void;
  onMouseDown: (e: React.MouseEvent, asset: Asset) => void;
  onTouchStart?: (e: React.TouchEvent, asset: Asset) => void;
  onDoubleClick?: (asset: Asset) => void;
  isSelected: boolean;
  onResize?: (assetId: string, width: number, height: number) => void;
  onEdit?: (asset: Asset) => void;
  onSelectAndFocus?: (asset: Asset) => void;
  isEditingBackground?: boolean;
  onCreateAsset?: (options: { name: string; parentId?: string }) => void;
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

export function AssetItem({ asset, onDelete, onMouseDown, onTouchStart, onDoubleClick, isSelected, onResize, onEdit, onSelectAndFocus, isEditingBackground = false, onCreateAsset }: AssetItemProps) {
  const Icon = iconMap[asset.type];
  const colorClass = colorMap[asset.type];
  const { getAssetTags } = useTagStore();

  // Get tags for this asset with their colors
  const assetTags = getAssetTags(asset.id);

  // Simple border logic - show if asset has tags
  const hasTags = assetTags && assetTags.length > 0;
  const firstTagColor = hasTags ? assetTags[0]?.color : null;

  // Helper function to convert color to rgba format for opacity support
  const getColorWithOpacity = (color: string, opacity: number): string => {
    if (color.startsWith('#')) {
      // Convert hex to rgba
      const hex = color.slice(1);
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    } else if (color.startsWith('hsl')) {
      // Convert hsl to hsla
      return color.replace('hsl(', 'hsla(').replace(')', `, ${opacity})`);
    } else if (color.startsWith('rgba')) {
      // Update existing rgba opacity
      return color.replace(/[\d.]+\)$/, `${opacity})`);
    } else if (color.startsWith('hsla')) {
      // Update existing hsla opacity
      return color.replace(/[\d.]+\)$/, `${opacity})`);
    }
    // Fallback to the original color
    return color;
  };

  // Calculate z-index based on asset size (smaller = higher z-index)
  const calculateZIndex = React.useCallback(() => {
    const area = (asset.width || 200) * (asset.height || 150);
    // Map area to z-index: smaller assets get higher z-index
    // Range: 1000 (smallest) to 100 (largest)
    const maxArea = 500 * 400; // Maximum expected area
    const minArea = 50 * 50;   // Minimum expected area
    const normalizedArea = Math.max(minArea, Math.min(maxArea, area));
    const zIndexRange = 900;
    const zIndex = 1000 - Math.floor(((normalizedArea - minArea) / (maxArea - minArea)) * zIndexRange);
    return zIndex;
  }, [asset.width, asset.height]);

  const dynamicZIndex = calculateZIndex();

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
  const [showExternalText, setShowExternalText] = React.useState(false);

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
    if (isEditingBackground) return;
    
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
    
    const newWidth = Math.max(25, resizeStart.width + deltaX);
    const newHeight = Math.max(25, resizeStart.height + deltaY);
    
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
      onMouseDown={!isEditingBackground ? (e) => onMouseDown(e, asset) : undefined}
      onTouchStart={!isEditingBackground ? (e) => onTouchStart?.(e, asset) : undefined}
      onDoubleClick={!isEditingBackground ? () => onDoubleClick?.(asset) : undefined}
      onContextMenu={!isEditingBackground ? handleContextMenu : undefined}
      style={{
        position: "absolute",
        left: asset.x,
        top: asset.y,
        width: asset.width || 200,
        height: asset.height || 150,
        transform: isSelected ? "scale(1.05)" : "scale(1)",
        overflow: 'visible',
        zIndex: isSelected ? dynamicZIndex + 100 : dynamicZIndex,
        ...(hasTags && firstTagColor && asset.showTagBorder && {
          boxShadow: `
            inset 0 0 12px ${getColorWithOpacity(firstTagColor, 0.38)},
            inset 0 0 20px ${getColorWithOpacity(firstTagColor, 0.31)},
            inset 0 0 28px ${getColorWithOpacity(firstTagColor, 0.25)},
            inset 0 0 36px ${getColorWithOpacity(firstTagColor, 0.19)},
            inset 0 1px 0 hsl(var(--glass-border) / 0.3)
          `.trim()
        })
      }}
      className={`asset-item group select-none transition-transform duration-100 relative ${
        isSelected ? "cosmic-glow border-primary/60" : ""
      } ${
        isEditingBackground ? "pointer-events-none opacity-50 cursor-not-allowed" : "cursor-grab active:cursor-grabbing"
      } ${
        asset.borderShape === 'circle' ? 'rounded-full' : ''
      } ${showExternalText ? 'z-50' : ''}`}
    >
      {asset.borderShape === 'circle' ? (
        /* Circular Asset Layout */
        <>
          {/* Name and description above the circle */}
          {(displaySettings.name || (displaySettings.description && asset.description)) && (
            <div className="absolute bottom-full left-0 right-0 mb-2 text-center z-10">
              {displaySettings.name && (
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Move className="w-3 h-3 text-foreground/70" />
                  <span className="text-sm font-medium text-foreground truncate">{asset.name}</span>
                </div>
              )}
              {displaySettings.description && asset.description && (
                <div className="text-xs text-foreground/80 line-clamp-2 max-w-[200px] mx-auto">
                  {asset.description}
                </div>
              )}
            </div>
          )}

          {/* Main circular container */}
          <div className="glass cosmic-glow border border-glass-border/40 rounded-full w-full h-full overflow-hidden relative">
            {/* Thumbnail or icon */}
            {portraitImage ? (
              <img
                src={portraitImage}
                alt={`${asset.name} portrait`}
                className="w-full h-full object-cover"
                style={{
                  filter: `blur(${displaySettings.portraitBlur * 8}px)`,
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Icon className={`w-12 h-12 ${colorClass}`} />
              </div>
            )}
          </div>

          {/* Edit and resize buttons outside the circle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit?.(asset);
            }}
            className="absolute top-0 right-0 -translate-y-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-blue-500/20 rounded flex-shrink-0 bg-blue-500/10 border border-glass-border/40 z-20"
            title="Edit asset"
          >
            <Edit className="w-3 h-3 text-blue-400" />
          </button>

          {isSelected && !isEditingBackground && (
            <div
              className="absolute bottom-0 right-0 translate-y-2 cursor-se-resize opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-primary/20 rounded flex-shrink-0 bg-primary/10 border border-glass-border/40 z-20"
              onMouseDown={handleResizeStart}
            >
              <Maximize2 className="w-3 h-3 text-primary" />
            </div>
          )}

          {/* Backstory/custom fields below the circle */}
          {displayedCustomFields.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 text-center z-10">
              <div className="space-y-1 max-h-16 overflow-y-auto">
                {displayedCustomFields.slice(0, 3).map((field, index) => (
                  <div key={index} className="text-xs">
                    <div className="font-medium text-foreground/90">{field.label}:</div>
                    {field.type === 'image' && field.value ? (
                      <img
                        src={field.value}
                        alt={field.label}
                        className="w-12 h-12 object-cover rounded border border-glass-border/30 mx-auto mt-0.5"
                      />
                    ) : (
                      <div className="text-foreground/80 truncate max-w-[200px] mx-auto">{field.value}</div>
                    )}
                  </div>
                ))}
                {displayedCustomFields.length > 3 && (
                  <div className="text-xs text-foreground/70 italic">+{displayedCustomFields.length - 3} more...</div>
                )}
              </div>
            </div>
          )}

          {/* Tags */}
          {assetTags.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 flex flex-wrap gap-1 justify-center z-10">
              {assetTags.slice(0, 6).map((tag, index) => (
                <div
                  key={tag.id}
                  className="w-2 h-2 rounded-full border border-foreground/30"
                  style={{ backgroundColor: tag.color }}
                  title={tag.name}
                />
              ))}
              {assetTags.length > 6 && (
                <div className="text-xs text-foreground/80">
                  +{assetTags.length - 6}
                </div>
              )}
            </div>
          )}

          {/* Toggle detailed view button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowExternalText(!showExternalText);
            }}
            className="absolute top-0 left-0 -translate-y-2 opacity-70 hover:opacity-100 transition-opacity p-1.5 hover:bg-green-500/20 rounded flex-shrink-0 bg-green-500/10 border border-glass-border/40 z-20"
            title={showExternalText ? "Hide detailed view" : "Show detailed view"}
          >
            <FileText className="w-3 h-3 text-green-400" />
          </button>
          
          {/* External detailed text panel */}
          {showExternalText && (
          <div className="absolute top-full left-0 right-0 mt-2 p-3 glass cosmic-glow border border-glass-border/40 rounded-lg relative z-30 min-w-[200px]">
            {/* Close button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowExternalText(false);
              }}
              className="absolute top-1 right-1 opacity-70 hover:opacity-100 transition-opacity p-1 hover:bg-red-500/20 rounded flex-shrink-0"
              title="Hide text"
            >
              <Trash2 className="w-3 h-3 text-red-400" />
            </button>
            
            {/* Detailed information */}
            <div className="space-y-2">
              {/* Name */}
              {displaySettings.name && (
                <div className="flex items-center gap-2">
                  <Move className="w-4 h-4 text-foreground opacity-70" />
                  <span className="text-sm font-medium text-foreground">{asset.name}</span>
                </div>
              )}
              
              {/* Description */}
              {displaySettings.description && asset.description && (
                <div className="text-xs text-foreground/90">
                  {asset.description}
                </div>
              )}
              
              {/* All Custom Fields */}
              {displayedCustomFields.length > 0 && (
                <div className="space-y-2">
                  {displayedCustomFields.map((field, index) => (
                    <div key={index} className="text-xs">
                      <div className="font-medium text-foreground/90">{field.label}:</div>
                      {field.type === 'image' && field.value ? (
                        <img
                          src={field.value}
                          alt={field.label}
                          className="w-full h-16 object-cover rounded border border-glass-border/30 mt-1"
                        />
                      ) : (
                        <div className="text-foreground/80">{field.value}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              
              {/* All Tags with names */}
              {assetTags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {assetTags.map((tag, index) => (
                    <div
                      key={tag.id}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-glass-border/30"
                      style={{ backgroundColor: getColorWithOpacity(tag.color, 0.12) }}
                      title={tag.name}
                    >
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="text-xs text-foreground/80">{tag.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        </>
      ) : (
        /* Square Asset Layout (original) */
        <div className={`glass cosmic-glow border border-glass-border/40 h-full overflow-hidden ${
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
                      onEdit?.(asset);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-blue-500/20 rounded flex-shrink-0"
                    title="Edit asset"
                  >
                    <Edit className="w-4 h-4 text-blue-400" />
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
                  {assetTags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {assetTags.slice(0, 3).map((tag, index) => (
                        <div
                          key={tag.id}
                          className="w-2 h-2 rounded-full border border-white/30"
                          style={{ backgroundColor: tag.color }}
                          title={tag.name}
                        />
                      ))}
                      {assetTags.length > 3 && (
                        <div className="text-xs text-white/80">
                          +{assetTags.length - 3}
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
                    onEdit?.(asset);
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-blue-500/20 rounded"
                  title="Edit asset"
                >
                  <Edit className="w-4 h-4 text-blue-400" />
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
              {assetTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2 flex-shrink-0">
                  {assetTags.slice(0, 3).map((tag, index) => (
                    <div
                      key={tag.id}
                      className="w-2 h-2 rounded-full border border-border/50"
                      style={{ backgroundColor: tag.color }}
                      title={tag.name}
                    />
                  ))}
                  {assetTags.length > 3 && (
                    <div className="text-xs text-muted-foreground">
                      +{assetTags.length - 3}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
      
      {/* Resize Handle for Square Assets Only */}
      {asset.borderShape !== 'circle' && isSelected && !isEditingBackground && (
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
          isViewportAsset={true}
          onCreateAsset={onCreateAsset}
        />
      )}
    </div>
  );
}