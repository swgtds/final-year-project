import React from "react";

export default function LandingPage({ onOpenAdmin }) {
  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-12">
      <div className="w-full max-w-4xl">
        <div className="bg-bw-dusty text-center p-6 rounded-md mb-6 text-black font-medium">
          <h1 className="text-2xl">Border Watch</h1>
        </div>
        <div
          className="bg-white rounded-md p-6 card-shadow"
          style={{ minHeight: 300 }}
        >
          <p className="text-gray-700">
            This is the landing page. Use the admin button below to go to admin
            panel.
          </p>
        </div>
      </div>

      {/* bottom button */}
      <div className="fixed bottom-6 left-0 right-0 flex justify-center pointer-events-none">
        <button
          onClick={onOpenAdmin}
          className="pointer-events-auto bg-bw-dusty text-white py-3 px-6 rounded-md shadow-lg"
        >
          Open Admin Panel
        </button>
      </div>
    </div>
  );
}
