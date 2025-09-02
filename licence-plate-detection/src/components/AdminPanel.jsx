// ----------------- frontend/src/components/AdminPanel.jsx -----------------
import React, { useEffect, useState } from "react";
import {
  getMaliciousPlates,
  addMaliciousPlate,
  removeMaliciousPlate,
  getDetections,
  addDetection,
} from "../services/storage";
import PlateItem from "./PlateItem";

export default function AdminPanel({ onBack }) {
  const [plates, setPlates] = useState(getMaliciousPlates());
  const [newPlate, setNewPlate] = useState("");
  const [detectedPlate, setDetectedPlate] = useState("");
  const [detections, setDetections] = useState(getDetections());

  useEffect(() => {
    setPlates(getMaliciousPlates());
    setDetections(getDetections());
  }, []);

  function handleAddPlate() {
    if (!newPlate.trim()) return;
    const updated = addMaliciousPlate(newPlate.trim().toUpperCase());
    setPlates(updated);
    setNewPlate("");
  }

  function handleDelete(plate) {
    const updated = removeMaliciousPlate(plate);
    setPlates(updated);
  }

  function handleMockDetect() {
    const plate = detectedPlate.trim().toUpperCase();
    if (!plate) return;
    const severity = plates.includes(plate) ? "critical" : "normal";
    const item = addDetection({ plate, severity });
    setDetections((prev) => [item, ...prev]);
    setDetectedPlate("");
    if (severity === "critical") {
      // critical alert — you can replace this with toasts or websockets
      alert("CRITICAL ALERT: Malicious plate detected — " + plate);
    }
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-bw-dusty p-6 rounded-md text-center mb-6">
          <h2 className="text-xl text-black">Show All Number Plate</h2>
        </div>

        <div className="bg-bw-pink p-4 rounded-md flex items-center gap-4 mb-6">
          <input
            value={newPlate}
            onChange={(e) => setNewPlate(e.target.value)}
            placeholder="Add Number Plate"
            className="flex-1 bg-transparent outline-none text-black px-2"
          />
          <button onClick={handleAddPlate} className="bg-white p-2 rounded-md">
            ↥
          </button>
        </div>

        <div className="space-y-4">
          {plates.length === 0 && (
            <div className="text-gray-600">No malicious plates added yet.</div>
          )}
          {plates.map((p) => (
            <PlateItem key={p} plate={p} onDelete={handleDelete} />
          ))}
        </div>

        <hr className="my-6" />

        <div className="bg-white p-4 rounded-md mb-6 card-shadow">
          <h3 className="font-semibold mb-2">
            Mock Detection (Image / Live Video)
          </h3>
          <p className="text-sm text-gray-600 mb-2">
            Upload image or start live video — for now use manual detection
            input.
          </p>
          <div className="flex gap-3">
            <input
              value={detectedPlate}
              onChange={(e) => setDetectedPlate(e.target.value)}
              placeholder="Detected plate (mock)"
              className="flex-1 p-2 border rounded"
            />
            <button
              onClick={handleMockDetect}
              className="px-4 py-2 rounded bg-bw-dusty text-white"
            >
              Detect
            </button>
          </div>
        </div>

        <h3 className="mb-3 font-semibold">Real-time Dashboard</h3>
        <div className="space-y-3">
          {detections.length === 0 && (
            <div className="text-gray-600">No detections yet.</div>
          )}
          {detections.map((d, idx) => (
            <div
              key={idx}
              className={`p-4 rounded-md ${
                d.severity === "critical"
                  ? "bg-red-100 border border-red-400"
                  : "bg-green-50 border border-green-200"
              }`}
            >
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-medium">{d.plate}</div>
                  <div className="text-xs text-gray-600">
                    {new Date(d.ts).toLocaleString()}
                  </div>
                </div>
                <div className="text-sm font-semibold">
                  {d.severity === "critical" ? "Critical Alert" : "Normal"}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8">
          <button onClick={onBack} className="text-sm text-gray-700">
            ← Back to Landing
          </button>
        </div>
      </div>
    </div>
  );
}
