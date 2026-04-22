/**
 * Save Button Component - Phase 3 Frontend Integration
 * 
 * Manual save button with unsaved changes indicator.
 * Checks both changedAssets and changedPositions for unsaved state.
 */

import { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { hasUnsavedChanges, manualSave } from '@/services/changeTrackingService';
import { Button } from '@/components/ui/button';

export function SaveButton() {
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const checkUnsaved = () => {
      // CRITICAL FIX: Check both changedAssets AND changedPositions
      // Position-only changes should also trigger unsaved indicator
      setHasUnsaved(hasUnsavedChanges());
    };

    const interval = setInterval(checkUnsaved, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleManualSave = async () => {
    setIsSaving(true);
    try {
      await manualSave();
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
