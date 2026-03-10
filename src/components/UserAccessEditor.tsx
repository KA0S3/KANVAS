import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, Save, X, AlertTriangle, HardDrive, Crown, Shield, Download } from "lucide-react";
import { format, addDays } from "date-fns";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/utils";

type PlanType = 'guest' | 'free' | 'pro' | 'lifetime' | 'owner';

interface UserData {
  id: string;
  email: string;
  plan_type?: PlanType;
  storage_quota_mb?: number;
  storage_used?: number;
  extra_quota?: number;
  ads_enabled?: boolean;
  import_export_enabled?: boolean;
  created_at: string;
}

interface UserAccessEditorProps {
  user: UserData;
  isOpen: boolean;
  onClose: () => void;
  onSave: (userId: string, updates: Partial<UserData>) => void;
}

interface LicenseData {
  id?: string;
  user_id: string;
  license_type: string;
  status: string;
  starts_at: string;
  expires_at?: string;
  features: Record<string, any>;
}

const PLAN_STORAGE_LIMITS: Record<PlanType, number> = {
  guest: 0, // 0 MB - local only
  free: 100, // 100 MB
  pro: 10240, // 10 GB
  lifetime: 15360, // 15 GB
  owner: -1, // Unlimited
};

const PLAN_FEATURES: Record<PlanType, { ads: boolean; importExport: boolean }> = {
  guest: { ads: true, importExport: false },
  free: { ads: true, importExport: false },
  pro: { ads: false, importExport: true },
  lifetime: { ads: false, importExport: true },
  owner: { ads: false, importExport: true },
};

const UserAccessEditor: React.FC<UserAccessEditorProps> = ({ user, isOpen, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    plan_type: user.plan_type || 'free',
    extra_storage_gb: Math.max(0, ((user.extra_quota || 0) / (1024 * 1024 * 1024))),
    ads_enabled: user.ads_enabled ?? true,
    import_export_enabled: user.import_export_enabled ?? false,
    expires_at: user.plan_type !== 'free' ? addDays(new Date(), 365) : undefined,
  });
  
  const [originalData, setOriginalData] = useState(formData);
  const [loading, setLoading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<typeof formData | null>(null);
  const [licenseData, setLicenseData] = useState<LicenseData | null>(null);

  // Fetch existing license data
  useEffect(() => {
    if (isOpen && user.id) {
      fetchLicenseData();
    }
  }, [isOpen, user.id]);

  const fetchLicenseData = async () => {
    try {
      const { data, error } = await supabase
        .from('licenses')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (data && !error) {
        setLicenseData(data);
        setFormData(prev => ({
          ...prev,
          expires_at: data.expires_at ? new Date(data.expires_at) : undefined,
        }));
        setOriginalData(prev => ({
          ...prev,
          expires_at: data.expires_at ? new Date(data.expires_at) : undefined,
        }));
      }
    } catch (error) {
      console.error('Error fetching license data:', error);
    }
  };


  const calculateEffectiveQuota = () => {
    const baseQuota = PLAN_STORAGE_LIMITS[formData.plan_type as PlanType] * 1024 * 1024; // Convert to bytes
    const extraQuota = formData.extra_storage_gb * 1024 * 1024 * 1024; // Convert GB to bytes
    return baseQuota + extraQuota;
  };

  const hasDestructiveChanges = () => {
    const currentPlan = formData.plan_type as PlanType;
    const originalPlan = originalData.plan_type as PlanType;
    
    // Downgrading plan
    const planDowngrade = PLAN_STORAGE_LIMITS[currentPlan] < PLAN_STORAGE_LIMITS[originalPlan];
    
    // Reducing storage
    const storageReduced = formData.extra_storage_gb < originalData.extra_storage_gb;
    
    // Disabling features
    const adsDisabled = originalData.ads_enabled && !formData.ads_enabled;
    const importExportDisabled = originalData.import_export_enabled && !formData.import_export_enabled;
    
    return planDowngrade || storageReduced || adsDisabled || importExportDisabled;
  };

  const handleSave = async () => {
    if (hasDestructiveChanges()) {
      setPendingChanges(formData);
      setShowConfirmDialog(true);
      return;
    }
    
    await performSave();
  };

  const performSave = async () => {
    setLoading(true);
    setShowConfirmDialog(false);
    
    try {
      // Optimistic UI update
      const optimisticUpdates: Partial<UserData> = {
        plan_type: formData.plan_type,
        extra_quota: formData.extra_storage_gb * 1024 * 1024 * 1024, // Convert GB to bytes
        ads_enabled: formData.ads_enabled,
        import_export_enabled: formData.import_export_enabled,
      };
      
      onSave(user.id, optimisticUpdates);
      
      // Update licenses table
      await updateLicenseTable();
      
      // Update owner_keys scopes if applicable
      await updateOwnerKeysScopes();
      
      setOriginalData(formData);
      onClose();
    } catch (error) {
      console.error('Error saving user access:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateLicenseTable = async () => {
    const licenseUpdates: Partial<LicenseData> = {
      user_id: user.id,
      license_type: formData.plan_type,
      status: 'active',
      starts_at: new Date().toISOString(),
      expires_at: formData.expires_at?.toISOString(),
      features: {
        ads: formData.ads_enabled,
        import_export: formData.import_export_enabled,
        storage_quota_mb: PLAN_STORAGE_LIMITS[formData.plan_type as PlanType],
        extra_storage_gb: formData.extra_storage_gb,
      },
    };

    if (licenseData?.id) {
      // Update existing license
      await supabase
        .from('licenses')
        .update(licenseUpdates)
        .eq('id', licenseData.id);
    } else {
      // Create new license
      await supabase
        .from('licenses')
        .insert(licenseUpdates);
    }
  };

  const updateOwnerKeysScopes = async () => {
    try {
      const { data: ownerKeys } = await supabase
        .from('owner_keys')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_revoked', false);

      if (ownerKeys && ownerKeys.length > 0) {
        const scopes = {
          ads: formData.ads_enabled,
          max_storage_bytes: calculateEffectiveQuota(),
          import_export: formData.import_export_enabled,
        };

        await supabase
          .from('owner_keys')
          .update({ scopes })
          .eq('user_id', user.id)
          .eq('is_revoked', false);
      }
    } catch (error) {
      console.error('Error updating owner keys scopes:', error);
    }
  };

  const handlePlanChange = (planType: PlanType) => {
    const planFeatures = PLAN_FEATURES[planType];
    setFormData(prev => ({
      ...prev,
      plan_type: planType,
      ads_enabled: planFeatures.ads,
      import_export_enabled: planFeatures.importExport,
    }));
  };

  const isFormChanged = () => {
    return JSON.stringify(formData) !== JSON.stringify(originalData);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Edit User Access - {user.email}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Effective Quota Summary */}
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium flex items-center gap-2">
                    <HardDrive className="h-4 w-4" />
                    Effective Storage Quota
                  </h4>
                  <p className="text-2xl font-bold text-primary">
                    {formatBytes(calculateEffectiveQuota())}
                  </p>
                </div>
                <div className="text-right space-y-1">
                  <div className="text-sm">
                    Base: {formatBytes(PLAN_STORAGE_LIMITS[formData.plan_type as PlanType] * 1024 * 1024)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Extra: {formatBytes(formData.extra_storage_gb * 1024 * 1024 * 1024)}
                  </div>
                  <div className="text-sm">
                    Used: {formatBytes(user.storage_used || 0)}
                  </div>
                </div>
              </div>
            </div>

            {/* Plan Override */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Crown className="h-4 w-4" />
                Plan Override
              </Label>
              <Select
                value={formData.plan_type}
                onValueChange={(value: PlanType) => handlePlanChange(value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="guest">Guest (0 MB - Local Only)</SelectItem>
                  <SelectItem value="free">Free (100 MB)</SelectItem>
                  <SelectItem value="pro">Pro (10 GB)</SelectItem>
                  <SelectItem value="lifetime">Lifetime (15 GB)</SelectItem>
                  <SelectItem value="owner">Owner (Unlimited)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Extra Storage Slider */}
            <div className="space-y-4">
              <Label className="flex items-center gap-2">
                <HardDrive className="h-4 w-4" />
                Extra Storage: {formData.extra_storage_gb} GB
              </Label>
              <Slider
                value={[formData.extra_storage_gb]}
                onValueChange={([value]) => setFormData(prev => ({ ...prev, extra_storage_gb: value }))}
                max={1000}
                min={0}
                step={1}
                className="w-full"
              />
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={formData.extra_storage_gb}
                  onChange={(e) => setFormData(prev => ({ ...prev, extra_storage_gb: Math.max(0, parseInt(e.target.value) || 0) }))}
                  className="w-24"
                  min={0}
                  max={1000}
                />
                <span className="text-sm text-muted-foreground">GB</span>
              </div>
            </div>

            {/* Feature Toggles */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Advertisements</Label>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="ads_enabled"
                    checked={formData.ads_enabled}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, ads_enabled: checked }))}
                  />
                  <Label htmlFor="ads_enabled">
                    {formData.ads_enabled ? (
                      <Badge variant="destructive">Enabled</Badge>
                    ) : (
                      <Badge variant="secondary">Disabled</Badge>
                    )}
                  </Label>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  Import/Export
                </Label>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="import_export_enabled"
                    checked={formData.import_export_enabled}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, import_export_enabled: checked }))}
                  />
                  <Label htmlFor="import_export_enabled">
                    {formData.import_export_enabled ? (
                      <Badge variant="default">Enabled</Badge>
                    ) : (
                      <Badge variant="secondary">Disabled</Badge>
                    )}
                  </Label>
                </div>
              </div>
            </div>

            {/* Expiration Date */}
            {formData.plan_type !== 'free' && (
              <div className="space-y-2">
                <Label>Expiration Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !formData.expires_at && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.expires_at ? format(formData.expires_at, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={formData.expires_at}
                      onSelect={(date) => setFormData(prev => ({ ...prev, expires_at: date }))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-between pt-4 border-t">
              <Button variant="outline" onClick={onClose}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={loading || !isFormChanged()}
                className={hasDestructiveChanges() ? "bg-orange-600 hover:bg-orange-700" : ""}
              >
                <Save className="h-4 w-4 mr-2" />
                {loading ? 'Saving...' : hasDestructiveChanges() ? 'Save (Destructive)' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog for Destructive Changes */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              Confirm Destructive Changes
            </AlertDialogTitle>
            <AlertDialogDescription>
              You are about to make changes that may reduce the user's access or storage quota. This action:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>May reduce available storage</li>
                <li>Could disable important features</li>
                <li>Will affect the user's current experience</li>
              </ul>
              Are you sure you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={performSave} className="bg-orange-600 hover:bg-orange-700">
              Confirm Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default UserAccessEditor;
