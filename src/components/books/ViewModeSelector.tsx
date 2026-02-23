import React from 'react';
import { Book, Layout, Edit } from 'lucide-react';

interface ViewModeSelectorProps {
  currentMode: 'single' | 'spine';
  onModeChange: (mode: 'single' | 'spine') => void;
  bookCount?: number;
  className?: string;
  onEditBook?: () => void;
  enableEditing?: boolean;
}

const ViewModeSelector: React.FC<ViewModeSelectorProps> = ({
  currentMode,
  onModeChange,
  bookCount = 0,
  className = '',
  onEditBook,
  enableEditing = false
}) => {
  const modes = [
    {
      id: 'single' as const,
      name: 'Single Book',
      icon: Book,
      description: 'Focus on one book at a time',
      disabled: bookCount === 0
    },
    {
      id: 'spine' as const,
      name: 'Library',
      icon: Layout,
      description: 'Books on a shelf',
      disabled: bookCount === 0
    }
  ];

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex bg-gray-700/50 rounded-lg p-1">
        {modes.map((mode) => {
          const Icon = mode.icon;
          const isActive = currentMode === mode.id;
          
          return (
            <button
              key={mode.id}
              onClick={() => !mode.disabled && onModeChange(mode.id)}
              disabled={mode.disabled}
              className={`
                relative flex items-center gap-2 px-3 py-2 rounded-md
                transition-all duration-200 ease-in-out
                ${isActive 
                  ? 'bg-blue-600 text-white shadow-lg' 
                  : 'text-gray-300 hover:text-white hover:bg-gray-600'
                }
                ${mode.disabled 
                  ? 'opacity-50 cursor-not-allowed' 
                  : 'cursor-pointer'
                }
              `}
              title={mode.description}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline text-sm font-medium">
                {mode.name}
              </span>
              
              {isActive && (
                <div className="absolute inset-0 bg-blue-500 rounded-md opacity-20 animate-pulse"></div>
              )}
            </button>
          );
        })}
      </div>
      
      {/* Edit Button - replaces description text */}
      {enableEditing && (
        <button
          onClick={onEditBook}
          className="flex items-center gap-2 px-3 py-2 rounded-full bg-blue-600 hover:bg-blue-700 transition-colors"
          title="Edit book"
        >
          <Edit className="w-4 h-4 text-white" />
          <span className="text-white text-sm font-medium">Edit</span>
        </button>
      )}
    </div>
  );
};

export default ViewModeSelector;
