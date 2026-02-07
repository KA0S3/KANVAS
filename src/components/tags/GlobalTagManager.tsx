import { useState } from 'react';
import { Tag, Plus, Settings } from 'lucide-react';
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

export function GlobalTagManager() {
  const { tags, createTag, deleteTag, updateTag } = useTagStore();
  const [isOpen, setIsOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingTagName, setEditingTagName] = useState('');

  const handleCreateTag = () => {
    if (!newTagName.trim()) return;
    
    try {
      createTag({
        name: newTagName.trim(),
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
      });
      
      setNewTagName('');
      toast.success('Tag created successfully');
    } catch (error) {
      toast.error('Failed to create tag');
    }
  };

  const handleDeleteTag = (tagId: string, tagName: string) => {
    if (confirm(`Are you sure you want to delete the "${tagName}" tag?`)) {
      deleteTag(tagId);
      toast.success('Tag deleted successfully');
    }
  };

  const handleStartEdit = (tagId: string, tagName: string) => {
    setEditingTagId(tagId);
    setEditingTagName(tagName);
  };

  const handleSaveEdit = () => {
    if (!editingTagId || !editingTagName.trim()) return;
    
    try {
      updateTag(editingTagId, { name: editingTagName.trim() });
      setEditingTagId(null);
      setEditingTagName('');
      toast.success('Tag updated successfully');
    } catch (error) {
      toast.error('Failed to update tag');
    }
  };

  const handleCancelEdit = () => {
    setEditingTagId(null);
    setEditingTagName('');
  };

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
                    <div className="flex-1 flex gap-1">
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
                  ) : (
                    <>
                      <span className="flex-1 text-sm truncate">{tag.name}</span>
                      <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleStartEdit(tag.id, tag.name)}
                          className="h-6 w-6 p-0"
                        >
                          ✏️
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteTag(tag.id, tag.name)}
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
    </Popover>
  );
}
