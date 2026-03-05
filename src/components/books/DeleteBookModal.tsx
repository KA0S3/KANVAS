import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { AlertTriangle, BookOpen, Trash2 } from 'lucide-react';
import type { Book } from '@/types/book';

interface DeleteBookModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  book: Book | null;
}

export function DeleteBookModal({ isOpen, onClose, onConfirm, book }: DeleteBookModalProps) {
  const [unlockDelete, setUnlockDelete] = useState(false);

  if (!book) return null;

  // Check if book has assets
  const hasAssets = book.worldData && 
    book.worldData.assets && 
    Object.keys(book.worldData.assets).length > 0;

  const assetCount = hasAssets ? Object.keys(book.worldData.assets).length : 0;

  const handleConfirm = () => {
    onConfirm();
    setUnlockDelete(false);
    onClose();
  };

  const handleClose = () => {
    setUnlockDelete(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md z-50">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <Trash2 className="w-5 h-5" />
            Delete Book
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Book info */}
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
            <BookOpen className="w-8 h-8 text-muted-foreground" />
            <div>
              <p className="font-medium">{book.title}</p>
              {book.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {book.description}
                </p>
              )}
            </div>
          </div>

          {/* Warning for books with assets */}
          {hasAssets ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Warning:</strong> This book contains {assetCount} asset{assetCount !== 1 ? 's' : ''}. 
                Deleting this book will permanently remove all assets and cannot be undone.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This will permanently delete the book "{book.title}". This action cannot be undone.
              </AlertDescription>
            </Alert>
          )}

          {/* Unlock switch for books with assets */}
          {hasAssets && (
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="space-y-1">
                <p className="font-medium">Enable deletion</p>
                <p className="text-sm text-muted-foreground">
                  Toggle to unlock the delete button for books with assets
                </p>
              </div>
              <Switch
                checked={unlockDelete}
                onCheckedChange={setUnlockDelete}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={hasAssets && !unlockDelete}
          >
            Delete Book
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
