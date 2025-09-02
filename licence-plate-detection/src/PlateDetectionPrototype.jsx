// src/PlateDetectionPrototype.jsx
'use client';

import React, { useRef, useState, useEffect } from 'react';
import Papa from 'papaparse';

// For Gemini API (text extraction from image)
async function extractPlateFromImage(base64Image) {
  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=<GOOGLE_API_KEY>",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: "Extract the license plate number from this image. Only return the plate number as plain text." },
                { inlineData: { mime_type: "image/jpeg", data: base64Image } }
              ]
            }
          ]
        })
      }
    );

    const data = await response.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toUpperCase() || null;
  } catch (err) {
    console.error("Gemini API error:", err);
    return null;
  }
}

export default function PlateDetectionPrototype() {
  const [csvPlates, setCsvPlates] = useState([]);
  const [status, setStatus] = useState("No alerts at the moment.");
  const [lastPlate, setLastPlate] = useState(null); // store last detected plate
  const [isNormal, setIsNormal] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const captureIntervalRef = useRef(null);

  // Normalizer function
  const normalizePlate = (plate) =>
    plate.replace(/\s+/g, "").trim().toUpperCase();

  // Load suspicious plates CSV
  const handleCsvUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      Papa.parse(file, {
        complete: (result) => {
          const plates = result.data
            .map((row) => row[0]) // first column
            .filter(Boolean)
            .map((p) => normalizePlate(p));
          setCsvPlates(plates);
        }
      });
    }
  };

  // Image upload handler
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result.split(",")[1];
        const plate = await extractPlateFromImage(base64);
        checkPlate(plate);
      };
      reader.readAsDataURL(file);
    }
  };

  // Webcam start with auto capture
  const startWebcam = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
    streamRef.current = stream;

    // auto capture every 5 seconds
    captureIntervalRef.current = setInterval(() => {
      captureFrame();
    }, 5000);
  };

  // Stop webcam and auto capture
  const stopWebcam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (captureIntervalRef.current) {
      clearInterval(captureIntervalRef.current);
      captureIntervalRef.current = null;
    }
  };

  // Capture frame from webcam
  const captureFrame = async () => {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const base64 = canvas.toDataURL("image/jpeg").split(",")[1];
    const plate = await extractPlateFromImage(base64);
    checkPlate(plate);
  };

  // Check extracted plate against CSV
  const checkPlate = (plate) => {
    const timestamp = new Date().toLocaleString();
    if (!plate) {
      setStatus(`No plate detected.    [${timestamp}]`);
      setIsNormal(false);
      setLastPlate(null);
      return;
    }
    const normalizedPlate = normalizePlate(plate);
    setLastPlate(normalizedPlate);
    if (csvPlates.includes(normalizedPlate)) {
      setStatus(`🚨 CRITICAL: Plate ${normalizedPlate} found in suspicious list!   [${timestamp}] `);
      setIsNormal(false);
    } else {
      setStatus(`✅ NORMAL: Plate ${normalizedPlate} not in list.    [${timestamp}] `);
      setIsNormal(true);
    }
  };

  // Load suspicious plates CSV (auto from public folder)
  useEffect(() => {
    fetch("/suspicious.csv")
      .then((response) => response.text())
      .then((csvText) => {
        Papa.parse(csvText, {
          complete: (result) => {
            const plates = result.data
              .map((row) => row[0]) // first column
              .filter(Boolean)
              .map((p) => normalizePlate(p));
            setCsvPlates(plates);
          }
        });
      })
      .catch((err) => console.error("Error loading CSV:", err));
  }, []);

  const addPlateToDatabase = async () => {
    if (lastPlate) {
      const res = await fetch("/api/plates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plate: lastPlate }),
      });
      const data = await res.json();
      setCsvPlates(data.plates);
    }
  };

  const removePlateFromDatabase = async () => {
    if (lastPlate) {
      const res = await fetch("/api/plates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plate: lastPlate }),
      });
      const data = await res.json();
      setCsvPlates(data.plates);
    }
  };

  return (
    <div className="bg-[#0B1623] text-white min-h-screen p-6">
      <h1 className="text-2xl font-bold text-blue-200 mb-6">BorderWatch AI</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* AI License Plate Recognition */}
        <div className="bg-[#142233] p-4 rounded shadow">
          <h2 className="text-lg font-semibold mb-4">🚘 AI License Plate Recognition</h2>
          <p className="text-sm text-gray-400 mb-4">
            Scan license plates and check against watchlists.
          </p>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="block w-full mb-3 text-sm text-gray-300"
          />
          <div className="flex gap-2">
            <button
              onClick={startWebcam}
              className="flex-1 px-3 py-2 bg-blue-600 rounded hover:bg-blue-700"
            >
              Start Webcam
            </button>
            <button
              onClick={stopWebcam}
              className="flex-1 px-3 py-2 bg-red-600 rounded hover:bg-red-700"
            >
              Stop Webcam
            </button>
          </div>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="mt-4 border border-gray-600 rounded w-full"
          ></video>
        </div>

        {/* Real-Time Alerts */}
        <div className="bg-[#142233] p-4 rounded shadow">
          <h2 className="text-lg font-semibold mb-4 text-green-400">🔔 Real-Time Alerts</h2>
          <p className="text-sm text-gray-300">{status}</p>

          {/* Show Add button only for NORMAL plates and when a plate exists */}
          {isNormal && lastPlate && (
            <button
              onClick={addPlateToDatabase}
              className="mt-3 px-3 py-2 bg-yellow-500 rounded hover:bg-yellow-600 text-black font-semibold"
            >
              ➕ Mark {lastPlate} as Suspicious
            </button>
          )}

          {/* Show Unsuspicious button only if CRITICAL and plate exists */}
          {!isNormal && lastPlate && (
            <button
              onClick={removePlateFromDatabase}
              className="mt-3 px-3 py-2 bg-red-400 rounded hover:bg-red-500 text-black font-semibold"
            >
              ❌ Mark {lastPlate} as Unsuspicious
            </button>
          )}

        </div>
      </div>
    </div>
  );
}
