import { useEffect } from 'react';
import { undoService } from '@/services/UndoService';
import { useBookStore } from '@/stores/bookStoreSimple';

export function useUndoKeyboard() {
  const { currentBookId } = useBookStore();

  useEffect(() => {
    // Set current project for undo service
    if (currentBookId) {
      undoService.setCurrentProject(currentBookId);
    }

    const handleKeyDown = async (event: KeyboardEvent) => {
      // Check for Ctrl+Z (undo) or Ctrl+Y (redo)
      if (event.ctrlKey || event.metaKey) {
        if (event.key === 'z' && !event.shiftKey) {
          // Ctrl+Z = Undo
          event.preventDefault();
          
          if (undoService.canUndo()) {
            const description = undoService.getNextUndoDescription();
            console.log(`[UndoKeyboard] Undoing: ${description}`);
            
            const success = await undoService.undo();
            if (!success) {
              console.error('[UndoKeyboard] Failed to undo action');
            }
          } else {
            console.log('[UndoKeyboard] Nothing to undo');
          }
        } else if ((event.key === 'y') || (event.key === 'z' && event.shiftKey)) {
          // Ctrl+Y or Ctrl+Shift+Z = Redo
          event.preventDefault();
          
          if (undoService.canRedo()) {
            const description = undoService.getNextRedoDescription();
            console.log(`[UndoKeyboard] Redoing: ${description}`);
            
            const success = await undoService.redo();
            if (!success) {
              console.error('[UndoKeyboard] Failed to redo action');
            }
          } else {
            console.log('[UndoKeyboard] Nothing to redo');
          }
        }
      }
    };

    // Add event listener
    document.addEventListener('keydown', handleKeyDown);

    // Cleanup
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [currentBookId]);

  // Return undo/redo status for UI components
  return {
    canUndo: undoService.canUndo(),
    canRedo: undoService.canRedo(),
    nextUndoDescription: undoService.getNextUndoDescription(),
    nextRedoDescription: undoService.getNextRedoDescription(),
    undo: () => undoService.undo(),
    redo: () => undoService.redo(),
    clearStack: () => undoService.clearStack()
  };
}
