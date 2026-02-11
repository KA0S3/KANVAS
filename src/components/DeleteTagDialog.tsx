import React from 'react';
import { AlertTriangle, Trash2, Tag } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

interface DeleteTagDialogProps {
  tagName: string;
  tagColor: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const DeleteTagDialog: React.FC<DeleteTagDialogProps> = ({
  tagName,
  tagColor,
  isOpen,
  onClose,
  onConfirm,
}) => {
  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Delete Tag
          </AlertDialogTitle>
          <AlertDialogDescription className="text-left">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4" />
                <span>Are you sure you want to delete this tag?</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
                <div
                  className="w-4 h-4 rounded-full border border-border flex-shrink-0"
                  style={{ backgroundColor: tagColor }}
                />
                <span className="font-medium">{tagName}</span>
              </div>
              <div className="text-sm text-muted-foreground">
                This action cannot be undone. The tag will be removed from all assets that use it.
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="outline">
              Cancel
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button variant="destructive" onClick={onConfirm}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Tag
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
