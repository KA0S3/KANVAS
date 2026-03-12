import { useState } from 'react';
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, GripVertical } from 'lucide-react';
import { useAssetStore } from '@/stores/assetStore';
import { useTagStore } from '@/stores/tagStore';
import { AssetContextMenu } from '@/components/AssetContextMenu';
import type { Asset } from '@/components/AssetItem';
import { cn } from '@/lib/utils';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

interface AssetTreeNodeProps {
  asset: Asset;
  depth: number;
  searchQuery?: string;
  level?: number;
  onEdit?: (asset: Asset) => void;
  onSelectAndFocus?: (asset: Asset) => void;
  onCreateChildAsset?: (parentId: string) => void;
  isDragActive?: boolean;
}

export function AssetTreeNode({ asset, depth, searchQuery = '', level = 0, onEdit, onSelectAndFocus, onCreateChildAsset, isDragActive = false }: AssetTreeNodeProps) {
  const { assets, setActiveAsset, currentActiveId, toggleAssetExpansion } = useAssetStore();
  const { getAssetTags } = useTagStore();
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
  }>({ visible: false, x: 0, y: 0 });
  
  const hasChildren = asset.children && asset.children.length > 0;
  const childAssets = asset.children?.map(childId => assets[childId]).filter(Boolean) || [];
  const isExpanded = asset.isExpanded || false;
  
  // DnD sortable hook
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    over,
  } = useSortable({ id: asset.id });
  
  // DnD droppable hook for containers
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: asset.id,
    // Allow dropping on all assets, not just folders
  });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  
  const isActive = currentActiveId === asset.id;
  const isDropTarget = isOver && !isDragging;
  
  // Combine refs for drag and drop
  const combinedRefs = (node: HTMLElement | null) => {
    setNodeRef(node);
    setDroppableRef(node);
  };
  
  // Get tags for this asset with their colors
  const assetTags = getAssetTags(asset.id);
  
  // Filter children based on search query
  const filteredChildren = childAssets.filter(child => 
    child.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    child.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleToggleExpand = () => {
    toggleAssetExpansion(asset.id);
  };

  const handleSelect = () => {
    setActiveAsset(asset.id);
  };

  const handleDoubleClick = () => {
    if (onSelectAndFocus) {
      onSelectAndFocus(asset);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
    });
  };

  const closeContextMenu = () => {
    setContextMenu({ visible: false, x: 0, y: 0 });
  };

  const getIcon = () => {
    if (hasChildren) {
      return isExpanded ? (
        <div className="relative">
          <FolderOpen className="w-4 h-4 text-cyan-400" />
          <div className="absolute inset-0 w-4 h-4 bg-cyan-400/20 rounded-full blur-sm animate-pulse" />
        </div>
      ) : (
        <Folder className="w-4 h-4 text-muted-foreground" />
      );
    }
    return <File className="w-4 h-4 text-muted-foreground" />;
  };

  return (
    <div>
      <div
        ref={combinedRefs}
        style={{
          ...style,
          paddingLeft: `${Math.min(depth * 16 + 8, 48)}px`,
          ...(isActive && {
            marginLeft: '2px',
            transform: `translateX(2px) ${style.transform || ''}`
          })
        }}
        className={cn(
          "flex items-center gap-1 py-2 px-2 rounded cursor-pointer hover:bg-accent/50 transition-all duration-300",
          isActive && "border-l-2 border-cyan-400/60 bg-cyan-500/5 text-cyan-300 font-medium",
          isDragActive && !isDragging && "opacity-50",
          isDragging && "opacity-30",
          isDropTarget && "bg-blue-500/20 border-2 border-blue-500/60 shadow-lg shadow-blue-500/20",
          `pl-${Math.min(depth * 4 + 2, 12)}`
        )} 
        onClick={handleSelect}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      >
        {/* Drag Handle */}
        <div
          {...attributes}
          {...listeners}
          className="p-1 hover:bg-muted rounded transition-colors cursor-grab active:cursor-grabbing opacity-60 hover:opacity-100 min-w-[24px] flex items-center justify-center"
          title="Drag to reorder"
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </div>
        
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleToggleExpand();
            }}
            className="p-0.5 hover:bg-muted rounded transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
          </button>
        )}
        
        {!hasChildren && <div className="w-4" />}
        
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {getIcon()}
          <span className="text-sm truncate">{asset.name}</span>
          {isDropTarget && (
            <span className="text-xs text-blue-500 font-medium animate-pulse">
              {hasChildren ? "Drop to nest" : "Drop to make parent"}
            </span>
          )}
        </div>
        
        {assetTags.length > 0 && (
          <div className="flex gap-1">
            {assetTags.slice(0, 3).map((tag) => (
              <div
                key={tag.id}
                className="w-2 h-2 rounded-full border border-border/30"
                style={{ backgroundColor: tag.color }}
                title={tag.name}
              />
            ))}
            {assetTags.length > 3 && (
              <span className="text-xs text-muted-foreground">
                +{assetTags.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
      
      {hasChildren && isExpanded && filteredChildren.length > 0 && (
        <div>
          {filteredChildren.map((child) => (
            <AssetTreeNode
              key={child.id}
              asset={child}
              depth={depth + 1}
              searchQuery={searchQuery}
              level={level + 1}
              onEdit={onEdit}
              onSelectAndFocus={onSelectAndFocus}
              onCreateChildAsset={onCreateChildAsset}
            />
          ))}
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
          onCreateChildAsset={onCreateChildAsset}
        />
      )}
    </div>
  );
}
