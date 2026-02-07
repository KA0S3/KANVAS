import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  Edit, 
  Trash2, 
  Copy, 
  Move, 
  Lock, 
  Unlock, 
  Eye, 
  Plus,
  FileText,
  Image,
  Film,
  Music,
  Code,
  File
} from 'lucide-react';
import { useAssetStore } from '@/stores/assetStore';
import type { Asset } from '@/components/AssetItem';

interface AssetContextMenuProps {
  asset: Asset;
  position: { x: number; y: number };
  onClose: () => void;
  onEdit?: (asset: Asset) => void;
  onSelectAndFocus?: (asset: Asset) => void;
}

export const AssetContextMenu: React.FC<AssetContextMenuProps> = ({
  asset,
  position,
  onClose,
  onEdit,
  onSelectAndFocus,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const {
    deleteAsset,
    updateAsset,
    setActiveAsset,
    createAsset,
    getAssetChildren,
  } = useAssetStore();

  // Calculate adjusted position to keep menu on screen
  const getAdjustedPosition = () => {
    const menuWidth = 240; // Approximate menu width
    const menuHeight = 320; // Approximate menu height
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    
    let adjustedX = position.x;
    let adjustedY = position.y;
    
    // Prevent menu from going off right edge
    if (position.x + menuWidth > screenWidth) {
      adjustedX = screenWidth - menuWidth - 10; // 10px padding from edge
    }
    
    // Prevent menu from going off left edge
    if (position.x < 10) {
      adjustedX = 10;
    }
    
    // Prevent menu from going off bottom edge
    if (position.y + menuHeight > screenHeight) {
      adjustedY = screenHeight - menuHeight - 10; // 10px padding from edge
    }
    
    // Prevent menu from going off top edge
    if (position.y < 10) {
      adjustedY = 10;
    }
    
    return { x: adjustedX, y: adjustedY };
  };

  const adjustedPosition = getAdjustedPosition();

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const handleDelete = () => {
    if (confirm(`Are you sure you want to delete "${asset.name}"? This will also delete all contained assets.`)) {
      deleteAsset(asset.id);
      onClose();
    }
  };

  const handleEdit = () => {
    onEdit?.(asset);
    onClose();
  };

  const handleDuplicate = () => {
    const newAssetData = {
      ...asset,
      name: `${asset.name} (Copy)`,
      x: asset.x + 20,
      y: asset.y + 20,
    };
    // Remove id, children, parentId, and timestamps from the data
    const { id, children, parentId, createdAt, updatedAt, ...assetDataToCopy } = newAssetData;
    createAsset(assetDataToCopy, asset.parentId);
    onClose();
  };

  const handleToggleLock = () => {
    updateAsset(asset.id, { isLocked: !asset.isLocked });
    onClose();
  };

  
  const handleCreateChild = () => {
    const name = prompt('Enter child asset name:');
    if (name) {
      createAsset({
        name,
        type: 'other',
        x: 10,
        y: 10,
        width: 200,
        height: 150,
        customFields: [],
        customFieldValues: [],
      }, asset.id);
      onClose();
    }
  };

  const handleSelect = () => {
    setActiveAsset(asset.id);
    
    // If this asset has children and we have the callback, trigger viewport navigation
    if (getAssetChildren(asset.id).length > 0 && onSelectAndFocus) {
      onSelectAndFocus(asset);
    }
    
    onClose();
  };

  const getAssetIcon = (type: Asset['type']) => {
    const iconMap = {
      image: Image,
      document: FileText,
      video: Film,
      audio: Music,
      code: Code,
      other: File,
    };
    return iconMap[type];
  };

  const AssetIcon = getAssetIcon(asset.type);
  const hasChildren = getAssetChildren(asset.id).length > 0;

  return createPortal(
    <div
      ref={menuRef}
      className="fixed glass-strong cosmic-glow border border-glass-border/40 rounded-lg shadow-2xl z-[9999] py-2 min-w-[200px]"
      style={{
        left: `${adjustedPosition.x}px`,
        top: `${adjustedPosition.y}px`,
      }}
    >
      {/* Asset Info Header */}
      <div className="px-3 py-2 border-b border-glass-border/20">
        <div className="flex items-center gap-2">
          <AssetIcon className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground truncate">{asset.name}</span>
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          Type: {asset.type} {hasChildren && `• ${getAssetChildren(asset.id).length} children`}
        </div>
      </div>

      {/* Menu Items */}
      <div className="py-1">
        {/* Edit */}
        <button
          onClick={handleEdit}
          className="w-full px-3 py-2 flex items-center gap-2 text-sm text-foreground hover:bg-glass-border/20 transition-colors"
        >
          <Edit className="w-4 h-4" />
          Edit Asset
        </button>

        {/* Select */}
        <button
          onClick={handleSelect}
          className="w-full px-3 py-2 flex items-center gap-2 text-sm text-foreground hover:bg-glass-border/20 transition-colors"
        >
          <Eye className="w-4 h-4" />
          Select & Focus
        </button>

        {/* Duplicate */}
        <button
          onClick={handleDuplicate}
          className="w-full px-3 py-2 flex items-center gap-2 text-sm text-foreground hover:bg-glass-border/20 transition-colors"
        >
          <Copy className="w-4 h-4" />
          Duplicate
        </button>

        {/* Create Child */}
        <button
          onClick={handleCreateChild}
          className="w-full px-3 py-2 flex items-center gap-2 text-sm text-foreground hover:bg-glass-border/20 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Child Asset
        </button>

        {/* Toggle Lock */}
        <button
          onClick={handleToggleLock}
          className="w-full px-3 py-2 flex items-center gap-2 text-sm text-foreground hover:bg-glass-border/20 transition-colors"
        >
          {asset.isLocked ? (
            <>
              <Unlock className="w-4 h-4" />
              Unlock Asset
            </>
          ) : (
            <>
              <Lock className="w-4 h-4" />
              Lock Asset
            </>
          )}
        </button>

        {/* Delete */}
        <button
          onClick={handleDelete}
          className="w-full px-3 py-2 flex items-center gap-2 text-sm text-destructive hover:bg-destructive/20 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Delete Asset
        </button>
      </div>
    </div>,
    document.body
  );
};
