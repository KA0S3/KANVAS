import { useState } from 'react';
import { Tag, Plus, Settings, Palette } from 'lucide-react';
import { useTagStore } from '@/stores/tagStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { DeleteTagDialog } from '@/components/DeleteTagDialog';

export function GlobalTagManager() {
  const { tags, createTag, deleteTag, updateTag } = useTagStore();
  const [isOpen, setIsOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(`hsl(${Math.random() * 360}, 70%, 50%)`);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingTagName, setEditingTagName] = useState('');
  const [editingTagColor, setEditingTagColor] = useState('');
  const [showColorPicker, setShowColorPicker] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tagToDelete, setTagToDelete] = useState<{ id: string; name: string; color: string } | null>(null);

  const handleCreateTag = () => {
    if (!newTagName.trim()) return;
    
    try {
      createTag({
        name: newTagName.trim(),
        color: newTagColor,
      });
      
      setNewTagName('');
      setNewTagColor(`hsl(${Math.random() * 360}, 70%, 50%)`);
      toast.success('Tag created successfully');
    } catch (error) {
      toast.error('Failed to create tag');
    }
  };

  const handleDeleteTag = (tagId: string, tagName: string, tagColor: string) => {
    setTagToDelete({ id: tagId, name: tagName, color: tagColor });
    setDeleteDialogOpen(true);
  };

  const confirmDeleteTag = () => {
    if (tagToDelete) {
      deleteTag(tagToDelete.id);
      toast.success('Tag deleted successfully');
      setDeleteDialogOpen(false);
      setTagToDelete(null);
    }
  };

  const cancelDeleteTag = () => {
    setDeleteDialogOpen(false);
    setTagToDelete(null);
  };

  const handleStartEdit = (tagId: string, tagName: string, tagColor: string) => {
    setEditingTagId(tagId);
    setEditingTagName(tagName);
    setEditingTagColor(tagColor);
  };

  const handleSaveEdit = () => {
    if (!editingTagId || !editingTagName.trim()) return;
    
    try {
      updateTag(editingTagId, { 
        name: editingTagName.trim(),
        color: editingTagColor 
      });
      setEditingTagId(null);
      setEditingTagName('');
      setEditingTagColor('');
      toast.success('Tag updated successfully');
    } catch (error) {
      toast.error('Failed to update tag');
    }
  };

  const handleCancelEdit = () => {
    setEditingTagId(null);
    setEditingTagName('');
    setEditingTagColor('');
  };

  const predefinedColors = [
    '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
    '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
    '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
    '#ec4899', '#f43f5e', '#64748b', '#000000'
  ];

  const ColorPicker = ({ currentColor, onColorChange, onClose }: {
    currentColor: string;
    onColorChange: (color: string) => void;
    onClose: () => void;
  }) => (
    <div className="absolute top-full right-0 mt-1 z-50 bg-background border border-border rounded-md shadow-lg p-3 w-48">
      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">Choose Color</div>
        <div className="grid grid-cols-6 gap-1">
          {predefinedColors.map((color) => (
            <button
              key={color}
              className={cn(
                "w-6 h-6 rounded border-2 transition-all hover:scale-110",
                currentColor === color ? 'border-primary' : 'border-border'
              )}
              style={{ backgroundColor: color }}
              onClick={() => {
                onColorChange(color);
                onClose();
              }}
            />
          ))}
        </div>
        <div className="flex gap-1 pt-1 border-t border-border">
          <Input
            type="color"
            value={currentColor.startsWith('#') ? currentColor : '#000000'}
            onChange={(e) => onColorChange(e.target.value)}
            className="w-8 h-6 p-0 border-0"
          />
          <Input
            value={currentColor}
            onChange={(e) => onColorChange(e.target.value)}
            className="flex-1 h-6 text-xs"
            placeholder="#000000"
          />
        </div>
      </div>
    </div>
  );

  const tagList = Object.values(tags);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          title="Manage Tags"
        >
          <Tag className="w-3.5 h-3.5" />
        </Button>
      </PopoverTrigger>
      
      <PopoverContent 
        className="w-80 p-0 glass cosmic-glow border-glass-border/40" 
        align="end"
        side="bottom"
      >
        <div className="p-3 border-b border-glass-border/20">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-sm flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Tag Manager
            </h3>
            <div className="text-xs text-muted-foreground">
              {tagList.length} tags
            </div>
          </div>
          
          {/* Create new tag */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                placeholder="New tag name..."
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                className="flex-1 h-8 text-xs bg-glass/50 border-glass-border/40"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateTag();
                  }
                }}
              />
              <div className="relative">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowColorPicker(showColorPicker === 'new' ? null : 'new')}
                  className="h-8 w-8 p-0"
                >
                  <div 
                    className="w-3 h-3 rounded-full border border-border" 
                    style={{ backgroundColor: newTagColor }}
                  />
                </Button>
                {showColorPicker === 'new' && (
                  <ColorPicker
                    currentColor={newTagColor}
                    onColorChange={setNewTagColor}
                    onClose={() => setShowColorPicker(null)}
                  />
                )}
              </div>
              <Button
                size="sm"
                onClick={handleCreateTag}
                disabled={!newTagName.trim()}
                className="h-8 px-2"
              >
                <Plus className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>
        
        {/* Tag list */}
        <div className="max-h-64 overflow-y-auto p-2">
          {tagList.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Tag className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No tags yet</p>
              <p className="text-xs">Create your first tag to get started</p>
            </div>
          ) : (
            <div className="space-y-1">
              {tagList.map((tag) => (
                <div
                  key={tag.id}
                  className="flex items-center gap-2 p-2 rounded hover:bg-accent/20 group"
                >
                  <div
                    className="w-3 h-3 rounded-full border border-border flex-shrink-0"
                    style={{ backgroundColor: tag.color }}
                  />
                  
                  {editingTagId === tag.id ? (
                    <div className="flex-1 space-y-2">
                      <div className="flex gap-1">
                        <Input
                          value={editingTagName}
                          onChange={(e) => setEditingTagName(e.target.value)}
                          className="flex-1 h-6 text-xs bg-glass/50 border-glass-border/40"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleSaveEdit();
                            } else if (e.key === 'Escape') {
                              handleCancelEdit();
                            }
                          }}
                          autoFocus
                        />
                        <div className="relative">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setShowColorPicker(showColorPicker === tag.id ? null : tag.id)}
                            className="h-6 w-6 p-0"
                          >
                            <div 
                              className="w-2 h-2 rounded-full border border-border" 
                              style={{ backgroundColor: editingTagColor }}
                            />
                          </Button>
                          {showColorPicker === tag.id && (
                            <ColorPicker
                              currentColor={editingTagColor}
                              onColorChange={setEditingTagColor}
                              onClose={() => setShowColorPicker(null)}
                            />
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          onClick={handleSaveEdit}
                          className="h-6 px-1"
                        >
                          ✓
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleCancelEdit}
                          className="h-6 px-1"
                        >
                          ✕
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <span className="flex-1 text-sm truncate">{tag.name}</span>
                      <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleStartEdit(tag.id, tag.name, tag.color)}
                          className="h-6 w-6 p-0"
                        >
                          ✏️
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteTag(tag.id, tag.name, tag.color)}
                          className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                        >
                          🗑️
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
      
      <DeleteTagDialog
        tagName={tagToDelete?.name || ''}
        tagColor={tagToDelete?.color || ''}
        isOpen={deleteDialogOpen}
        onClose={cancelDeleteTag}
        onConfirm={confirmDeleteTag}
      />
    </Popover>
  );
}
