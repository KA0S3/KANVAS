import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBookStore } from "@/stores/bookStoreSimple";
import LeatherColorPicker from "./books/LeatherColorPicker";
import type { LeatherColorPreset } from "@/types/book";

interface WorldCreationDialogProps {
  children: React.ReactNode;
  onWorldCreated?: (worldId: string) => void;
}

const WorldCreationDialog = ({ children, onWorldCreated }: WorldCreationDialogProps) => {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedColor, setSelectedColor] = useState('#3b82f6');
  const [isLeatherMode, setIsLeatherMode] = useState(true);
  const [selectedLeatherColor, setSelectedLeatherColor] = useState<LeatherColorPreset | null>(null);
  const [customCoverImage, setCustomCoverImage] = useState<string | null>(null);
  const { createBook, leatherPresets } = useBookStore();

  const colorOptions = [
    { value: '#3b82f6', label: 'Cosmic Blue', gradient: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' },
    { value: '#10b981', label: 'Emerald Green', gradient: 'linear-gradient(135deg, #10b981, #06b6d4)' },
    { value: '#8b5cf6', label: 'Royal Purple', gradient: 'linear-gradient(135deg, #8b5cf6, #ec4899)' },
    { value: '#f97316', label: 'Sunset Orange', gradient: 'linear-gradient(135deg, #f97316, #ef4444)' },
    { value: '#1f2937', label: 'Midnight Dark', gradient: 'linear-gradient(135deg, #1f2937, #374151)' },
    { value: '#f43f5e', label: 'Rose Pink', gradient: 'linear-gradient(135deg, #f43f5e, #ec4899)' },
  ];

  const handleCreateWorld = () => {
    if (!title.trim()) return;

    const defaultLeatherColor = leatherPresets[0];
    const leatherColorToUse = selectedLeatherColor || defaultLeatherColor;
    
    // Find the gradient for the selected color
    const colorOption = colorOptions.find(option => option.value === selectedColor);
    const gradient = colorOption ? colorOption.gradient : undefined;

    const newBookId = createBook({
      title: title.trim(),
      description: description.trim() || 'A new world',
      color: selectedColor,
      gradient: gradient,
      isLeatherMode: isLeatherMode,
      leatherColor: isLeatherMode ? leatherColorToUse.color : undefined,
      coverImage: customCoverImage || undefined,
      worldData: { 
        assets: {}, 
        tags: {}, 
        globalCustomFields: [], 
        viewportOffset: { x: -45, y: -20 }, 
        viewportScale: 1 
      }
    });

    setTitle('');
    setDescription('');
    setSelectedColor('#3b82f6');
    setIsLeatherMode(true);
    setSelectedLeatherColor(null);
    setCustomCoverImage(null);
    setOpen(false);

    if (onWorldCreated) {
      onWorldCreated(newBookId);
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setCustomCoverImage(result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setCustomCoverImage(null);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">✨ Create New World</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="title" className="text-sm font-medium text-gray-200">
              World Title *
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter world title..."
              className="bg-gray-800 border-gray-600 text-white placeholder-gray-400"
              maxLength={50}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-sm font-medium text-gray-200">
              Description
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your world..."
              className="bg-gray-800 border-gray-600 text-white placeholder-gray-400 resize-none"
              rows={3}
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-200">
              Cover Style
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setIsLeatherMode(true)}
                className={`p-3 rounded-lg border-2 transition-all ${
                  isLeatherMode
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-gray-600 hover:border-gray-500'
                }`}
              >
                <div className="text-sm font-medium text-white">Leather Bound</div>
                <div className="text-xs text-gray-400">Classic leather look</div>
              </button>
              <button
                onClick={() => setIsLeatherMode(false)}
                className={`p-3 rounded-lg border-2 transition-all ${
                  !isLeatherMode
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-gray-600 hover:border-gray-500'
                }`}
              >
                <div className="text-sm font-medium text-white">Color Gradient</div>
                <div className="text-xs text-gray-400">Modern gradient style</div>
              </button>
            </div>
          </div>

          {isLeatherMode ? (
            <div className="space-y-2">
              <LeatherColorPicker
                selectedColor={selectedLeatherColor?.color}
                onColorSelect={setSelectedLeatherColor}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-200">
                World Color
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {colorOptions.map((color) => (
                  <button
                    key={color.value}
                    onClick={() => setSelectedColor(color.value)}
                    className={`p-3 rounded-lg border-2 transition-all ${
                      selectedColor === color.value
                        ? 'border-blue-500 scale-105'
                        : 'border-gray-600 hover:border-gray-500'
                    }`}
                    style={{ background: color.gradient }}
                    title={color.label}
                  >
                    <div className="w-full h-8 rounded" style={{ background: color.gradient }} />
                    <span className="text-xs text-white mt-1 block">{color.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-200">
              Custom Cover Image
            </Label>
            {customCoverImage ? (
              <div className="space-y-2">
                <div className="relative rounded-lg overflow-hidden border-2 border-gray-600">
                  <img 
                    src={customCoverImage} 
                    alt="Cover preview" 
                    className="w-full h-32 object-cover"
                  />
                  <button
                    onClick={handleRemoveImage}
                    className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 text-xs"
                  >
                    ✕
                  </button>
                </div>
                <p className="text-xs text-green-400">✓ Custom image will override leather/gradient</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="border-2 border-dashed border-gray-600 rounded-lg p-4 text-center">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                    id="cover-image-upload"
                  />
                  <label 
                    htmlFor="cover-image-upload"
                    className="cursor-pointer text-gray-400 hover:text-white transition-colors"
                  >
                    <div className="text-2xl mb-1">📷</div>
                    <div className="text-sm">Click to upload image</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Recommended size: 192x288px (2:3 ratio)
                    </div>
                  </label>
                </div>
                <p className="text-xs text-gray-400">
                  If no image is uploaded, leather/gradient will be used
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              className="flex-1 border-gray-600 text-gray-200 hover:bg-gray-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateWorld}
              disabled={!title.trim()}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            >
              Create World
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WorldCreationDialog;
