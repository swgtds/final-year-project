import React from "react";

export default function PlateItem({ plate, onDelete }) {
  return (
    <div className="flex items-center gap-4 py-4">
      <div className="w-20 h-14 bg-bw-card flex items-center justify-center rounded-md text-sm">
        <span className="text-xs">Plate Img</span>
      </div>
      <div className="flex-1">
        <div className="text-lg font-medium">{plate}</div>
        <div className="text-sm text-gray-600">
          (generate from number plate image)
        </div>
      </div>
      <div>
        <button
          onClick={() => onDelete(plate)}
          className="bg-white p-3 rounded-md card-shadow"
        >
          🗑️
        </button>
      </div>
    </div>
  );
}
