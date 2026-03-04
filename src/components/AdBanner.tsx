import React from 'react';

const AdBanner = () => {
  return (
    <div className="w-full h-[250px] bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center text-gray-500 dark:text-gray-400 text-sm">
      <div className="text-center">
        <div className="text-xs mb-1">Advertisement</div>
        <div className="text-lg font-semibold">AdSense Banner</div>
        <div className="text-xs mt-1">728x90</div>
      </div>
    </div>
  );
};

export default AdBanner;
