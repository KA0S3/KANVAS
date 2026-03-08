import React from 'react';

export const EnvTest = () => {
  // Only show in development
  if (import.meta.env.PROD) return null;

  const envVars = {
    VITE_OWNER_EMAIL: import.meta.env?.VITE_OWNER_EMAIL,
    MODE: import.meta.env.MODE,
    DEV: import.meta.env.DEV,
    PROD: import.meta.env.PROD,
  };

  return (
    <div className="fixed top-4 left-4 bg-yellow-900 text-white p-4 rounded-lg text-xs font-mono max-w-sm z-50 border border-yellow-500">
      <h3 className="text-yellow-300 font-bold mb-2">🔧 Environment Variables</h3>
      <div className="space-y-1">
        {Object.entries(envVars).map(([key, value]) => (
          <div key={key}>
            <span className="text-yellow-400">{key}:</span>{' '}
            <span className={value ? 'text-green-400' : 'text-red-400'}>
              {value || 'NOT_SET'}
            </span>
          </div>
        ))}
      </div>
      {!import.meta.env?.VITE_OWNER_EMAIL && (
        <div className="mt-3 text-red-400 font-bold">
          ⚠️ VITE_OWNER_EMAIL is not set!
        </div>
      )}
    </div>
  );
};
