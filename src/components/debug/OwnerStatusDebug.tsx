import React from 'react';
import { useAuthStore } from '@/stores/authStore';

export const OwnerStatusDebug = () => {
  const { user, plan, effectiveLimits, ownerKeyInfo, licenseInfo } = useAuthStore();
  const ownerEmail = import.meta.env?.VITE_OWNER_EMAIL;
  const isOwnerByEmail = user?.email === ownerEmail;
  const isOwnerByPlan = plan === 'owner';

  // Only show in development
  if (import.meta.env.PROD) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-black/90 text-white p-4 rounded-lg text-xs font-mono max-w-sm z-50 border border-red-500">
      <h3 className="text-red-400 font-bold mb-2">🚀 Owner Status Debug</h3>
      
      <div className="space-y-1">
        <div>Owner Email Env: {ownerEmail || 'NOT_SET'}</div>
        <div>User Email: {user?.email || 'NOT_SIGNED_IN'}</div>
        <div>Is Owner (Email): {isOwnerByEmail ? '✅ YES' : '❌ NO'}</div>
        <div>Current Plan: {plan}</div>
        <div>Is Owner (Plan): {isOwnerByPlan ? '✅ YES' : '❌ NO'}</div>
        
        <div className="border-t border-gray-600 pt-2 mt-2">
          <div className="text-green-400 font-bold">Effective Limits:</div>
          <div>Ads Enabled: {effectiveLimits?.adsEnabled ? '❌ YES' : '✅ NO'}</div>
          <div>Max Books: {effectiveLimits?.maxBooks}</div>
          <div>Quota Bytes: {effectiveLimits?.quotaBytes}</div>
          <div>Import/Export: {effectiveLimits?.importExportEnabled ? '✅ YES' : '❌ NO'}</div>
          <div>Source Plan: {effectiveLimits?.source?.plan}</div>
        </div>

        {ownerKeyInfo && (
          <div className="border-t border-gray-600 pt-2 mt-2">
            <div className="text-blue-400 font-bold">Owner Key:</div>
            <div>Valid: {ownerKeyInfo.isValid ? '✅' : '❌'}</div>
          </div>
        )}

        {licenseInfo && (
          <div className="border-t border-gray-600 pt-2 mt-2">
            <div className="text-purple-400 font-bold">License:</div>
            <div>Type: {licenseInfo.license_type}</div>
            <div>Status: {licenseInfo.status}</div>
          </div>
        )}
      </div>
      
      <div className="mt-3 text-yellow-400">
        {(isOwnerByEmail || isOwnerByPlan) ? 
          '🎉 OWNER ACCESS CONFIRMED' : 
          '⚠️ Not detected as owner'
        }
      </div>
    </div>
  );
};
