import { useState, useRef } from 'react';
import { X, Upload, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useBookStore } from '@/stores/bookStoreSimple';
import type { Book } from '@/types/book';

interface BookEditorProps {
  isOpen: boolean;
  onClose: () => void;
  book?: Book | null;
}

export function BookEditor({ isOpen, onClose, book }: BookEditorProps) {
  const { createBook, updateBook, coverPresets } = useBookStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    title: book?.title || '',
    description: book?.description || '',
    color: book?.color || '#3b82f6',
    gradient: book?.gradient || '',
    coverImage: book?.coverImage || '',
  });

  const [selectedPreset, setSelectedPreset] = useState(
    book ? coverPresets.find(p => p.color === book.color) : coverPresets[0]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const bookData = {
      title: formData.title.trim(),
      description: formData.description.trim() || undefined,
      color: formData.color,
      gradient: formData.gradient || undefined,
      coverImage: formData.coverImage || undefined,
      worldData: book?.worldData,
    };

    if (book) {
      updateBook(book.id, bookData);
    } else {
      createBook(bookData);
    }

    onClose();
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        setFormData(prev => ({ ...prev, coverImage: dataUrl }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePresetSelect = (preset: typeof coverPresets[0]) => {
    setSelectedPreset(preset);
    setFormData(prev => ({
      ...prev,
      color: preset.color,
      gradient: preset.gradient || '',
      coverImage: '', // Clear custom image when using preset
    }));
  };

  const handleRemoveImage = () => {
    setFormData(prev => ({ ...prev, coverImage: '' }));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl glass cosmic-glow border-glass-border/40">
        <DialogHeader>
          <DialogTitle>
            {book ? 'Edit Book' : 'Create New Book'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Book Preview */}
          <div className="flex justify-center">
            <div className="relative">
              <div
                className="w-24 h-36 rounded-sm shadow-xl flex items-center justify-center text-white font-bold text-center p-2"
                style={{
                  background: formData.coverImage 
                    ? `url(${formData.coverImage}) center/cover` 
                    : formData.gradient || formData.color,
                }}
              >
                {!formData.coverImage && (
                  <span className="text-xs line-clamp-3">
                    {formData.title || 'New Book'}
                  </span>
                )}
              </div>
              {formData.coverImage && (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="absolute -top-2 -right-2 w-6 h-6 p-0 rounded-full"
                  onClick={handleRemoveImage}
                >
                  <X className="w-3 h-3" />
                </Button>
              )}
            </div>
          </div>

          {/* Basic Info */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Enter book title..."
                required
                className="bg-glass/50 border-glass-border/40"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Enter book description..."
                rows={3}
                className="bg-glass/50 border-glass-border/40"
              />
            </div>
          </div>

          {/* Cover Options */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4" />
              <Label>Cover Design</Label>
            </div>

            {/* Preset Colors */}
            <div className="space-y-2">
              <Label className="text-sm">Choose a preset:</Label>
              <div className="grid grid-cols-3 gap-2">
                {coverPresets.map((preset) => (
                  <Button
                    key={preset.id}
                    type="button"
                    variant={selectedPreset?.id === preset.id ? "default" : "outline"}
                    className="h-12 p-0"
                    style={{
                      background: preset.gradient || preset.color,
                    }}
                    onClick={() => handlePresetSelect(preset)}
                  >
                    <span className="text-white text-xs drop-shadow">
                      {preset.name}
                    </span>
                  </Button>
                ))}
              </div>
            </div>

            {/* Custom Image Upload */}
            <div className="space-y-2">
              <Label className="text-sm">Or upload custom cover:</Label>
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                  id="cover-upload"
                />
                <Label htmlFor="cover-upload" className="flex-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Image
                  </Button>
                </Label>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4">
            <Button type="submit" className="flex-1">
              {book ? 'Update Book' : 'Create Book'}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
