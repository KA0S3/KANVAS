import React from 'react';
import { Undo, Redo } from 'lucide-react';
import { useUndoKeyboard } from '@/hooks/useUndoKeyboard';
import { Button } from '@/components/ui/button';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function UndoStatus() {
  const { canUndo, canRedo, nextUndoDescription, nextRedoDescription, undo, redo } = useUndoKeyboard();

  if (!canUndo && !canRedo) {
    return null; // Don't show anything if no undo/redo available
  }

  return (
    <TooltipProvider>
      <div className="fixed bottom-4 right-4 flex gap-2 bg-background border rounded-lg shadow-lg p-2 z-50">
        {canUndo && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => undo()}
                className="flex items-center gap-1"
              >
                <Undo className="h-4 w-4" />
                <span className="hidden sm:inline">Undo</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                {nextUndoDescription || 'Undo last action'}
                <br />
                <span className="text-xs text-muted-foreground">Ctrl+Z</span>
              </p>
            </TooltipContent>
          </Tooltip>
        )}
        
        {canRedo && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => redo()}
                className="flex items-center gap-1"
              >
                <Redo className="h-4 w-4" />
                <span className="hidden sm:inline">Redo</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                {nextRedoDescription || 'Redo last action'}
                <br />
                <span className="text-xs text-muted-foreground">Ctrl+Y</span>
              </p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
