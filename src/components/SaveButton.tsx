/**
 * Save Button Component - Phase 3 Frontend Integration
 * 
 * Manual save button with unsaved changes indicator.
 * Checks both changedAssets and changedPositions for unsaved state.
 */

import { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { documentMutationService } from '@/services/DocumentMutationService';
import { autosaveService } from '@/services/autosaveService';
import { Button } from '@/components/ui/button';

export function SaveButton() {
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // Subscribe to autosave service for reactive updates instead of polling
    const unsubscribe = autosaveService.subscribe((state) => {
      setHasUnsaved(state.pendingChanges);
    });

    // Initial check
    setHasUnsaved(documentMutationService.hasUnsavedChanges());

    return () => unsubscribe();
  }, []);

  const handleManualSave = async () => {
    setIsSaving(true);
    try {
      await documentMutationService.manualSave();
    } catch (error) {
      console.error('Manual save failed:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Button
      onClick={handleManualSave}
      disabled={isSaving || !hasUnsaved}
      variant={hasUnsaved ? 'default' : 'outline'}
      size="sm"
      className={hasUnsaved ? 'bg-primary hover:bg-primary/90' : ''}
    >
      <Save className="w-4 h-4 mr-2" />
      {isSaving ? 'Saving...' : hasUnsaved ? 'Save Now' : 'Saved'}
    </Button>
  );
}
