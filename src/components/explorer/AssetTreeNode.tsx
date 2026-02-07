import { useState } from 'react';
import { ChevronRight, ChevronDown, File, Folder, FolderOpen } from 'lucide-react';
import { useAssetStore } from '@/stores/assetStore';
import { AssetContextMenu } from '@/components/AssetContextMenu';
import type { Asset } from '@/components/AssetItem';
import { cn } from '@/lib/utils';

interface AssetTreeNodeProps {
  asset: Asset;
  depth: number;
  searchQuery?: string;
  level?: number;
  onEdit?: (asset: Asset) => void;
  onSelectAndFocus?: (asset: Asset) => void;
}

export function AssetTreeNode({ asset, depth, searchQuery = '', level = 0, onEdit, onSelectAndFocus }: AssetTreeNodeProps) {
  const { assets, setActiveAsset, currentActiveId } = useAssetStore();
  const [isExpanded, setIsExpanded] = useState(asset.isExpanded || false);
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
  }>({ visible: false, x: 0, y: 0 });
  
  const hasChildren = asset.children && asset.children.length > 0;
  const childAssets = asset.children?.map(childId => assets[childId]).filter(Boolean) || [];
  const isActive = currentActiveId === asset.id;
  
  // Filter children based on search query
  const filteredChildren = childAssets.filter(child => 
    child.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    child.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleToggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  const handleSelect = () => {
    setActiveAsset(asset.id);
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
        className={cn(
          "flex items-center gap-1 py-1 px-2 rounded cursor-pointer hover:bg-accent/50 transition-all duration-300",
          isActive && "border-l-2 border-cyan-400/60 bg-cyan-500/5 text-cyan-300 font-medium",
          `pl-${Math.min(depth * 4 + 2, 12)}`
        )}
        style={{ 
          paddingLeft: `${Math.min(depth * 16 + 8, 48)}px`,
          ...(isActive && {
            marginLeft: '2px',
            transform: 'translateX(2px)'
          })
        }} 
        onClick={handleSelect}
        onContextMenu={handleContextMenu}
      >
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
        </div>
        
        {asset.tags && asset.tags.length > 0 && (
          <div className="flex gap-1">
            {asset.tags.slice(0, 3).map((tag, index) => (
              <div
                key={tag}
                className="w-2 h-2 rounded-full bg-primary/60"
                title={tag}
              />
            ))}
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
        />
      )}
    </div>
  );
}
