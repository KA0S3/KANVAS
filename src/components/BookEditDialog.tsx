import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronDown, ChevronUp, Type, Palette } from "lucide-react";
import { useBookStore } from "@/stores/bookStoreSimple";
import { useThemeStore } from "@/stores/themeStore";
import LeatherColorPicker from "./books/LeatherColorPicker";
import type { LeatherColorPreset } from "@/types/book";
import type { Book } from "@/types/book";

interface BookEditDialogProps {
  book: Book | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBookUpdated?: (book: Book) => void;
}

const BookEditDialog = ({ book, open, onOpenChange, onBookUpdated }: BookEditDialogProps) => {
  const { theme } = useThemeStore();
  const [title, setTitle] = useState('');
  const [subheading, setSubheading] = useState('');
  const [description, setDescription] = useState('');
  const [selectedColor, setSelectedColor] = useState('#8B4513');
  const [isLeatherMode, setIsLeatherMode] = useState(true);
  const [selectedLeatherColor, setSelectedLeatherColor] = useState<LeatherColorPreset | null>(null);
  const [customCoverImage, setCustomCoverImage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('cover');
  
  // Typography settings for title
  const [titleTextSettingsOpen, setTitleTextSettingsOpen] = useState(false);
  const [titleFontFamily, setTitleFontFamily] = useState('serif');
  const [titleFontSize, setTitleFontSize] = useState([24]);
  const [titlePosition, setTitlePosition] = useState({ x: 50, y: 40 }); // Default: horizontally centered, slightly above vertical center
  const [titleTextColor, setTitleTextColor] = useState('#ffffff');
  const [titleOutlineColor, setTitleOutlineColor] = useState('#000000');
  const [titleOutlineThickness, setTitleOutlineThickness] = useState([0]);
  const [titleShadowEnabled, setTitleShadowEnabled] = useState(false);
  const [activeTextLayer, setActiveTextLayer] = useState<'title' | 'subheading'>('title');
  
  // Auto-close dropdowns when text settings are opened
  useEffect(() => {
    if (titleTextSettingsOpen) {
      setTitleTextSettingsOpen(false);
      setTimeout(() => setTitleTextSettingsOpen(true), 0);
    }
  }, [titleTextSettingsOpen]);
  
  // Typography settings for subheading
  const [subheadingTextSettingsOpen, setSubheadingTextSettingsOpen] = useState(false);
  const [subheadingFontFamily, setSubheadingFontFamily] = useState('serif');
  const [subheadingFontSize, setSubheadingFontSize] = useState([18]);
  const [subheadingPosition, setSubheadingPosition] = useState({ x: 50, y: 60 }); // Default: horizontally centered, slightly below Title
  const [subheadingTextColor, setSubheadingTextColor] = useState('#ffffff');
  const [subheadingOutlineColor, setSubheadingOutlineColor] = useState('#000000');
  const [subheadingOutlineThickness, setSubheadingOutlineThickness] = useState([0]);
  const [subheadingShadowEnabled, setSubheadingShadowEnabled] = useState(false);
  
  // Auto-close dropdowns when subheading text settings are opened
  useEffect(() => {
    if (subheadingTextSettingsOpen) {
      setSubheadingTextSettingsOpen(false);
      setTimeout(() => setSubheadingTextSettingsOpen(true), 0);
    }
  }, [subheadingTextSettingsOpen]);
  
  const { updateBook, leatherPresets } = useBookStore();

  const colorOptions = [
    { value: '#00D9FF', label: 'Electric Azure', gradient: 'linear-gradient(135deg, rgba(0,217,255,0.6), rgba(0,149,255,0.4)), radial-gradient(circle at 30% 30%, rgba(255,255,255,0.7), transparent 50%)' },
    { value: '#FF006E', label: 'Neon Magenta', gradient: 'linear-gradient(135deg, rgba(255,0,110,0.6), rgba(255,0,150,0.4)), radial-gradient(circle at 70% 70%, rgba(255,255,255,0.8), transparent 50%)' },
    { value: '#FFBE0B', label: 'Solar Flare', gradient: 'linear-gradient(135deg, rgba(255,190,11,0.6), rgba(255,223,0,0.4)), radial-gradient(circle at 40% 60%, rgba(255,255,255,0.7), transparent 50%)' },
    { value: '#8338EC', label: 'Cosmic Purple', gradient: 'linear-gradient(135deg, rgba(131,56,236,0.6), rgba(175,82,222,0.4)), radial-gradient(circle at 60% 40%, rgba(255,255,255,0.8), transparent 50%)' },
    { value: '#06FFB4', label: 'Quantum Teal', gradient: 'linear-gradient(135deg, rgba(6,255,180,0.6), rgba(0,255,195,0.4)), radial-gradient(circle at 30% 70%, rgba(255,255,255,0.7), transparent 50%)' },
    { value: '#FB5607', label: 'Plasma Orange', gradient: 'linear-gradient(135deg, rgba(251,86,7,0.6), rgba(255,119,48,0.4)), radial-gradient(circle at 50% 50%, rgba(255,255,255,0.8), transparent 50%)' },
  ];

  // Reset form when book changes
  useEffect(() => {
    if (book) {
      setTitle(book.title);
      setDescription(book.description || '');
      setSelectedColor(book.color || '#00D9FF');
      setIsLeatherMode(book.isLeatherMode ?? true);
      setCustomCoverImage(book.coverImage || null);
      
      // Initialize subheading from coverPageSettings or empty
      setSubheading(book.coverPageSettings?.description?.text || '');
      
      // Initialize typography settings from coverPageSettings or defaults
      const titleSettings = book.coverPageSettings?.title;
      if (titleSettings) {
        setTitleFontFamily(titleSettings.style.type);
        setTitleFontSize([titleSettings.style.sizePx || parseInt(titleSettings.style.size) || 24]);
        setTitlePosition(titleSettings.position?.x && titleSettings.position?.y 
          ? { x: titleSettings.position.x, y: titleSettings.position.y }
          : { x: 50, y: 40 });
        setTitleTextColor(titleSettings.style.color || '#ffffff');
        setTitleOutlineColor(titleSettings.style.outlineColor || '#000000');
        setTitleOutlineThickness([titleSettings.style.outlineThickness || 0]);
        setTitleShadowEnabled(titleSettings.style.shadowEnabled || false);
      }
      
      const descSettings = book.coverPageSettings?.description;
      if (descSettings) {
        setSubheadingFontFamily(descSettings.style.type);
        setSubheadingFontSize([descSettings.style.sizePx || parseInt(descSettings.style.size) || 18]);
        setSubheadingPosition(descSettings.position?.x && descSettings.position?.y
          ? { x: descSettings.position.x, y: descSettings.position.y }
          : { x: 50, y: 60 });
        setSubheadingTextColor(descSettings.style.color || '#ffffff');
        setSubheadingOutlineColor(descSettings.style.outlineColor || '#000000');
        setSubheadingOutlineThickness([descSettings.style.outlineThickness || 0]);
        setSubheadingShadowEnabled(descSettings.style.shadowEnabled || false);
      }
      
      // Find the matching leather preset or set to null
      const matchingPreset = book.leatherColor 
        ? leatherPresets.find(preset => preset.color === book.leatherColor) || null
        : null;
      setSelectedLeatherColor(matchingPreset);
    }
  }, [book, leatherPresets]);

  const handleUpdateBook = () => {
    if (!book || !title.trim()) return;

    const leatherColorToUse = selectedLeatherColor || (isLeatherMode ? leatherPresets[0] : null);
    
    // Find gradient for selected color, or create fallback gradient if color not found
    const colorOption = colorOptions.find(option => option.value === selectedColor);
    const gradient = colorOption ? colorOption.gradient : `linear-gradient(135deg, ${selectedColor}dd, ${selectedColor}99), radial-gradient(circle at 50% 50%, rgba(255,255,255,0.6), transparent 50%)`;

    const updatedBook: Book = {
      ...book,
      title: title.trim(),
      description: description.trim() || 'A new world',
      color: selectedColor,
      gradient: gradient,
      isLeatherMode: isLeatherMode,
      leatherColor: isLeatherMode ? leatherColorToUse?.color : undefined,
      coverImage: customCoverImage || undefined,
      updatedAt: Date.now(),
      coverPageSettings: {
        showCoverPage: book.coverPageSettings?.showCoverPage ?? true,
        baseStyle: book.coverPageSettings?.baseStyle ?? (isLeatherMode ? 'leather' : 'gradient'),
        title: {
          text: title.trim(),
          position: { x: titlePosition.x, y: titlePosition.y },
          style: {
            type: titleFontFamily as any,
            color: titleTextColor,
            size: titleFontSize[0] <= 12 ? 'small' : titleFontSize[0] <= 18 ? 'medium' : titleFontSize[0] <= 24 ? 'large' : 'extra-large',
            sizePx: titleFontSize[0],
            outlineColor: titleOutlineColor,
            outlineThickness: titleOutlineThickness[0],
            shadowEnabled: titleShadowEnabled
          }
        },
        description: subheading.trim() ? {
          text: subheading.trim(),
          position: { x: subheadingPosition.x, y: subheadingPosition.y },
          style: {
            type: subheadingFontFamily as any,
            color: subheadingTextColor,
            size: subheadingFontSize[0] <= 12 ? 'small' : subheadingFontSize[0] <= 18 ? 'medium' : subheadingFontSize[0] <= 24 ? 'large' : 'extra-large',
            sizePx: subheadingFontSize[0],
            outlineColor: subheadingOutlineColor,
            outlineThickness: subheadingOutlineThickness[0],
            shadowEnabled: subheadingShadowEnabled
          }
        } : undefined
      }
    };

    updateBook(book.id, updatedBook);
    onBookUpdated?.(updatedBook);
    onOpenChange(false);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`max-w-md max-h-[90vh] overflow-y-auto ${
        theme === 'dark' 
          ? 'bg-gray-900 border-gray-700 text-white'
          : 'bg-white border-gray-300 text-black'
      }`}>
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">✨ Edit World</DialogTitle>
        </DialogHeader>
        
        {!book ? (
          <div className="text-center py-8">
            <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>No world selected for editing</p>
          </div>
        ) : (
          <div className="space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className={`grid w-full grid-cols-2 border ${
                theme === 'dark'
                  ? 'bg-gray-800 border-gray-700'
                  : 'bg-gray-100 border-gray-300'
              }`}>
                <TabsTrigger value="cover" className={`flex items-center gap-2 ${
                  theme === 'dark'
                    ? 'data-[state=active]:bg-blue-600 data-[state=active]:text-white'
                    : 'data-[state=active]:bg-blue-500 data-[state=active]:text-white'
                }`}>
                  <Palette className="w-4 h-4" />
                  Cover Settings
                </TabsTrigger>
                <TabsTrigger value="text" className={`flex items-center gap-2 ${
                  theme === 'dark'
                    ? 'data-[state=active]:bg-blue-600 data-[state=active]:text-white'
                    : 'data-[state=active]:bg-blue-500 data-[state=active]:text-white'
                }`}>
                  <Type className="w-4 h-4" />
                  Text Settings
                </TabsTrigger>
              </TabsList>

              {/* COVER SETTINGS TAB */}
              <TabsContent value="cover" className="space-y-4 mt-6">
                <div className="space-y-2">
                  <Label className={`text-sm font-medium ${
                    theme === 'dark' ? 'text-gray-200' : 'text-black'
                  }`}>
                    Cover Style
                  </Label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setIsLeatherMode(true)}
                      className={`p-3 rounded-lg border-2 transition-all ${
                        isLeatherMode
                          ? (theme === 'dark'
                              ? 'border-blue-500 bg-blue-500/20'
                              : 'border-primary bg-primary/10')
                          : (theme === 'dark'
                              ? 'border-gray-600 hover:border-gray-500'
                              : 'border-border hover:border-accent')
                      }`}
                    >
                      <div className={`text-sm font-medium ${
                        theme === 'dark' ? 'text-white' : 'text-black'
                      }`}>Leather Bound</div>
                      <div className={`text-xs ${
                        theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                      }`}>Classic leather look</div>
                    </button>
                    <button
                      onClick={() => setIsLeatherMode(false)}
                      className={`p-3 rounded-lg border-2 transition-all ${
                        !isLeatherMode
                          ? (theme === 'dark'
                              ? 'border-blue-500 bg-blue-500/10'
                              : 'border-primary bg-primary/10')
                          : (theme === 'dark'
                              ? 'border-gray-600 hover:border-gray-500'
                              : 'border-border hover:border-accent')
                      }`}
                    >
                      <div className={`text-sm font-medium ${
                        theme === 'dark' ? 'text-white' : 'text-black'
                      }`}>Color Gradient</div>
                      <div className={`text-xs ${
                        theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                      }`}>Modern gradient style</div>
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
                          id="edit-cover-image-upload"
                        />
                        <label 
                          htmlFor="edit-cover-image-upload"
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
              </TabsContent>

              {/* TEXT SETTINGS TAB */}
              <TabsContent value="text" className="space-y-4 mt-6">
            <div className="space-y-2">
                <Label htmlFor="title" className={`text-sm font-medium ${
                    theme === 'dark' ? 'text-gray-200' : 'text-black'
                  }`}>
                  World Title *
                </Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter world title..."
                  className={`bg-gray-800 border-gray-600 text-white placeholder-gray-400 ${
                    theme === 'dark' ? '' : 'bg-white border-gray-300 text-black placeholder-gray-500'
                  }`}
                  maxLength={50}
                />
                
                {/* Title Text Settings */}
                <Collapsible open={titleTextSettingsOpen} onOpenChange={setTitleTextSettingsOpen}>
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-between bg-gray-800/50 hover:bg-gray-800/70 border border-gray-600/50 text-gray-300 mt-2"
                    >
                      <span className="flex items-center gap-2">
                        <Type className="w-4 h-4" />
                        Text Settings
                      </span>
                      {titleTextSettingsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3 mt-2 p-3 bg-gray-800/30 border border-gray-600/30 rounded-md">
                    <div>
                      <Label className="text-xs text-gray-400">Font Family</Label>
                      <Select value={titleFontFamily} onValueChange={setTitleFontFamily}>
                        <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="serif">Serif</SelectItem>
                          <SelectItem value="sans-serif">Sans-serif</SelectItem>
                          <SelectItem value="monospace">Monospace</SelectItem>
                          <SelectItem value="cursive">Cursive</SelectItem>
                          <SelectItem value="fantasy">Fantasy</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-400">Font Size: {titleFontSize[0]}px</Label>
                      <Slider
                        value={titleFontSize}
                        onValueChange={setTitleFontSize}
                        max={48}
                        min={12}
                        step={1}
                        className="mt-2"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-400">Text Color</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="color"
                          value={titleTextColor}
                          onChange={(e) => setTitleTextColor(e.target.value)}
                          className="w-8 h-8 rounded border border-gray-600 bg-gray-700 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={titleTextColor}
                          onChange={(e) => setTitleTextColor(e.target.value)}
                          className="flex-1 bg-gray-700 border border-gray-600 text-white text-xs px-2 py-1 rounded"
                          placeholder="#ffffff"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-400">Outline Color</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="color"
                          value={titleOutlineColor}
                          onChange={(e) => setTitleOutlineColor(e.target.value)}
                          className="w-8 h-8 rounded border border-gray-600 bg-gray-700 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={titleOutlineColor}
                          onChange={(e) => setTitleOutlineColor(e.target.value)}
                          className="flex-1 bg-gray-700 border border-gray-600 text-white text-xs px-2 py-1 rounded"
                          placeholder="#000000"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-400">Outline Thickness: {titleOutlineThickness[0]}px</Label>
                      <Slider
                        value={titleOutlineThickness}
                        onValueChange={setTitleOutlineThickness}
                        max={10}
                        min={0}
                        step={0.5}
                        className="mt-2"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-400">Text Shadow</Label>
                      <div className="mt-1">
                        <button
                          type="button"
                          onClick={() => setTitleShadowEnabled(!titleShadowEnabled)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            titleShadowEnabled ? 'bg-blue-600' : 'bg-gray-600'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              titleShadowEnabled ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subheading" className="text-sm font-medium text-gray-200">
                  Subheading
                </Label>
                <Input
                  id="subheading"
                  value={subheading}
                  onChange={(e) => setSubheading(e.target.value)}
                  placeholder="Enter subheading..."
                  className="bg-gray-800 border-gray-600 text-white placeholder-gray-400"
                  maxLength={100}
                />
                
                {/* Subheading Text Settings */}
                <Collapsible open={subheadingTextSettingsOpen} onOpenChange={setSubheadingTextSettingsOpen}>
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-between bg-gray-800/50 hover:bg-gray-800/70 border border-gray-600/50 text-gray-300 mt-2"
                    >
                      <span className="flex items-center gap-2">
                        <Type className="w-4 h-4" />
                        Text Settings
                      </span>
                      {subheadingTextSettingsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3 mt-2 p-3 bg-gray-800/30 border border-gray-600/30 rounded-md">
                    <div>
                      <Label className="text-xs text-gray-400">Font Family</Label>
                      <Select value={subheadingFontFamily} onValueChange={setSubheadingFontFamily}>
                        <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="serif">Serif</SelectItem>
                          <SelectItem value="sans-serif">Sans-serif</SelectItem>
                          <SelectItem value="monospace">Monospace</SelectItem>
                          <SelectItem value="cursive">Cursive</SelectItem>
                          <SelectItem value="fantasy">Fantasy</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-400">Font Size: {subheadingFontSize[0]}px</Label>
                      <Slider
                        value={subheadingFontSize}
                        onValueChange={setSubheadingFontSize}
                        max={36}
                        min={10}
                        step={1}
                        className="mt-2"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-400">Text Color</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="color"
                          value={subheadingTextColor}
                          onChange={(e) => setSubheadingTextColor(e.target.value)}
                          className="w-8 h-8 rounded border border-gray-600 bg-gray-700 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={subheadingTextColor}
                          onChange={(e) => setSubheadingTextColor(e.target.value)}
                          className="flex-1 bg-gray-700 border border-gray-600 text-white text-xs px-2 py-1 rounded"
                          placeholder="#ffffff"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-400">Outline Color</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="color"
                          value={subheadingOutlineColor}
                          onChange={(e) => setSubheadingOutlineColor(e.target.value)}
                          className="w-8 h-8 rounded border border-gray-600 bg-gray-700 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={subheadingOutlineColor}
                          onChange={(e) => setSubheadingOutlineColor(e.target.value)}
                          className="flex-1 bg-gray-700 border border-gray-600 text-white text-xs px-2 py-1 rounded"
                          placeholder="#000000"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-400">Outline Thickness: {subheadingOutlineThickness[0]}px</Label>
                      <Slider
                        value={subheadingOutlineThickness}
                        onValueChange={setSubheadingOutlineThickness}
                        max={10}
                        min={0}
                        step={0.5}
                        className="mt-2"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-400">Text Shadow</Label>
                      <div className="mt-1">
                        <button
                          type="button"
                          onClick={() => setSubheadingShadowEnabled(!subheadingShadowEnabled)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            subheadingShadowEnabled ? 'bg-blue-600' : 'bg-gray-600'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              subheadingShadowEnabled ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>

              {/* Shared Position Viewport */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-200">
                  Text Position Editor
                </Label>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setActiveTextLayer('title')}
                      className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                        activeTextLayer === 'title'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      Title
                    </button>
                    <button
                      onClick={() => setActiveTextLayer('subheading')}
                      className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                        activeTextLayer === 'subheading'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      Subheading
                    </button>
                  </div>
                  <div className="relative w-48 h-72 mx-auto bg-gray-700/50 border border-gray-600 rounded-lg overflow-hidden">
                    <div className="absolute inset-0 p-2">
                      {/* Title Text Layer */}
                      <div
                        className={`absolute cursor-move select-none ${activeTextLayer === 'title' ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-gray-800 rounded' : ''}`}
                        style={{
                          left: `${titlePosition.x}%`,
                          top: `${titlePosition.y}%`,
                          transform: 'translate(-50%, -50%)',
                          fontSize: `${Math.min(titleFontSize[0] / 3, 12)}px`,
                          color: titleTextColor,
                          fontFamily: titleFontFamily,
                          WebkitTextStroke: titleOutlineThickness[0] > 0 ? `${titleOutlineThickness[0]}px ${titleOutlineColor}` : 'none',
                          textShadow: titleShadowEnabled ? '2px 2px 4px rgba(0,0,0,0.8)' : 'none'
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setActiveTextLayer('title');
                          const container = e.currentTarget.parentElement;
                          if (!container) return;
                          
                          const rect = container.getBoundingClientRect();
                          const startX = e.clientX;
                          const startY = e.clientY;
                          const startLeft = titlePosition.x;
                          const startTop = titlePosition.y;
                          
                          const handleMouseMove = (moveEvent: MouseEvent) => {
                            const deltaX = ((moveEvent.clientX - startX) / rect.width) * 100;
                            const deltaY = ((moveEvent.clientY - startY) / rect.height) * 100;
                            
                            const newX = Math.max(0, Math.min(100, startLeft + deltaX));
                            const newY = Math.max(0, Math.min(100, startTop + deltaY));
                            
                            setTitlePosition({ x: newX, y: newY });
                          };
                          
                          const handleMouseUp = () => {
                            document.removeEventListener('mousemove', handleMouseMove);
                            document.removeEventListener('mouseup', handleMouseUp);
                          };
                          
                          document.addEventListener('mousemove', handleMouseMove);
                          document.addEventListener('mouseup', handleMouseUp);
                        }}
                        onClick={() => setActiveTextLayer('title')}
                      >
                        {title || 'Title'}
                      </div>

                      {/* Subheading Text Layer */}
                      <div
                        className={`absolute cursor-move select-none ${activeTextLayer === 'subheading' ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-gray-800 rounded' : ''}`}
                        style={{
                          left: `${subheadingPosition.x}%`,
                          top: `${subheadingPosition.y}%`,
                          transform: 'translate(-50%, -50%)',
                          fontSize: `${Math.min(subheadingFontSize[0] / 3, 10)}px`,
                          color: subheadingTextColor,
                          fontFamily: subheadingFontFamily,
                          WebkitTextStroke: subheadingOutlineThickness[0] > 0 ? `${subheadingOutlineThickness[0]}px ${subheadingOutlineColor}` : 'none',
                          textShadow: subheadingShadowEnabled ? '2px 2px 4px rgba(0,0,0,0.8)' : 'none'
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setActiveTextLayer('subheading');
                          const container = e.currentTarget.parentElement;
                          if (!container) return;
                          
                          const rect = container.getBoundingClientRect();
                          const startX = e.clientX;
                          const startY = e.clientY;
                          const startLeft = subheadingPosition.x;
                          const startTop = subheadingPosition.y;
                          
                          const handleMouseMove = (moveEvent: MouseEvent) => {
                            const deltaX = ((moveEvent.clientX - startX) / rect.width) * 100;
                            const deltaY = ((moveEvent.clientY - startY) / rect.height) * 100;
                            
                            const newX = Math.max(0, Math.min(100, startLeft + deltaX));
                            const newY = Math.max(0, Math.min(100, startTop + deltaY));
                            
                            setSubheadingPosition({ x: newX, y: newY });
                          };
                          
                          const handleMouseUp = () => {
                            document.removeEventListener('mousemove', handleMouseMove);
                            document.removeEventListener('mouseup', handleMouseUp);
                          };
                          
                          document.addEventListener('mousemove', handleMouseMove);
                          document.addEventListener('mouseup', handleMouseUp);
                        }}
                        onClick={() => setActiveTextLayer('subheading')}
                      >
                        {subheading || 'Subtitle'}
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 text-center">
                    Click text to select, drag to reposition • Active: {activeTextLayer === 'title' ? 'Title' : 'Subheading'}
                  </p>
                </div>
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
            </TabsContent>
            </Tabs>

            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1 border-gray-600 text-gray-200 hover:bg-gray-800"
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpdateBook}
                disabled={!title.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              >
                Update World
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default BookEditDialog;
