import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Trash2, Edit, LogIn } from 'lucide-react';
import type { Book } from '@/types/book';

interface BookContextMenuProps {
  book: Book;
  position: { x: number; y: number };
  onClose: () => void;
  onEnter: (book: Book) => void;
  onEdit: (book: Book) => void;
  onDelete: (book: Book) => void;
}

export function BookContextMenu({ 
  book, 
  position, 
  onClose, 
  onEnter, 
  onEdit, 
  onDelete 
}: BookContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

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

  // Adjust position if menu would go off screen
  const adjustedPosition = { ...position };
  const menuWidth = 200;
  const menuHeight = 120; // Approximate height

  if (position.x + menuWidth > window.innerWidth) {
    adjustedPosition.x = window.innerWidth - menuWidth - 10;
  }
  if (position.y + menuHeight > window.innerHeight) {
    adjustedPosition.y = window.innerHeight - menuHeight - 10;
  }

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-popover border border-border rounded-md shadow-lg p-1 min-w-[160px]"
      style={{
        left: `${adjustedPosition.x}px`,
        top: `${adjustedPosition.y}px`,
      }}
    >
      <div className="px-2 py-1.5 text-sm font-medium text-muted-foreground border-b border-border mb-1">
        {book.title}
      </div>
      
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start h-8 px-2"
        onClick={() => handleAction(() => onEnter(book))}
      >
        <LogIn className="w-4 h-4 mr-2" />
        Enter World
      </Button>
      
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start h-8 px-2"
        onClick={() => handleAction(() => onEdit(book))}
      >
        <Edit className="w-4 h-4 mr-2" />
        Edit
      </Button>
      
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
        onClick={() => handleAction(() => onDelete(book))}
      >
        <Trash2 className="w-4 h-4 mr-2" />
        Delete
      </Button>
    </div>
  );
}
