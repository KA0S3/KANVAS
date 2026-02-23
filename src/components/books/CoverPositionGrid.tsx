import React from 'react';

interface CoverPositionGridProps {
  selectedPosition?: number;
  onPositionSelect: (position: number) => void;
  disabled?: boolean;
}

const CoverPositionGrid: React.FC<CoverPositionGridProps> = ({
  selectedPosition,
  onPositionSelect,
  disabled = false
}) => {
  const gridPositions = [
    { id: 1, label: '1', className: 'col-start-1 row-start-1' },
    { id: 2, label: '2', className: 'col-start-2 row-start-1' },
    { id: 3, label: '3', className: 'col-start-3 row-start-1' },
    { id: 4, label: '4', className: 'col-start-4 row-start-1' },
    { id: 5, label: '5', className: 'col-start-1 row-start-2' },
    { id: 6, label: '6', className: 'col-start-2 row-start-2' },
    { id: 7, label: '7', className: 'col-start-3 row-start-2' },
    { id: 8, label: '8', className: 'col-start-4 row-start-2' },
    { id: 9, label: '9', className: 'col-start-1 row-start-3' },
    { id: 10, label: '10', className: 'col-start-2 row-start-3' },
    { id: 11, label: '11', className: 'col-start-3 row-start-3' },
    { id: 12, label: '12', className: 'col-start-4 row-start-3' },
  ];

  return (
    <div className="space-y-2">
      <div className="text-sm text-gray-300">Text Position (12-Point Grid)</div>
      <div className="grid grid-cols-4 grid-rows-3 gap-1 w-32 h-24 bg-gray-800 p-1 rounded border border-gray-600">
        {gridPositions.map((position) => (
          <button
            key={position.id}
            type="button"
            disabled={disabled}
            onClick={() => onPositionSelect(position.id)}
            className={`
              ${position.className}
              w-full h-full 
              flex items-center justify-center 
              text-xs font-mono
              rounded transition-all duration-200
              ${selectedPosition === position.id
                ? 'bg-blue-600 text-white border border-blue-500'
                : 'bg-gray-700 text-gray-300 border border-gray-600 hover:bg-gray-600 hover:text-white'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
            title={`Position ${position.id}`}
          >
            {position.label}
          </button>
        ))}
      </div>
      <div className="text-xs text-gray-400">
        Grid: [1] [2] [3] [4] / [5] [6] [7] [8] / [9] [10][11][12]
      </div>
    </div>
  );
};

export default CoverPositionGrid;
