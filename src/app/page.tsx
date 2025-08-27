'use client';

import React, { useState, useEffect } from 'react';
import type { Alert } from '@/types';
import { AppHeader } from '@/components/layout/app-header';
import { ObjectDetectionCard } from '@/components/dashboard/object-detection-card';
import { ThreatIdentificationCard } from '@/components/dashboard/threat-identification-card';
import { LicensePlateRecognitionCard } from '@/components/dashboard/license-plate-recognition-card';
import { AlertsPanel } from '@/components/dashboard/alerts-panel';

export default function DashboardPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const addAlert = (newAlert: Alert) => {
    setAlerts((prevAlerts) => [newAlert, ...prevAlerts].slice(0, 50)); // Keep last 50 alerts
  };

  if (!isClient) {
    // Render nothing or a loading indicator on the server to avoid hydration mismatch
    return null; 
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <AppHeader />
      <main className="flex-grow container mx-auto p-4 sm:p-6 lg:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Feature Cards Section */}
          <div className="lg:col-span-8 xl:col-span-9 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              <ObjectDetectionCard addAlert={addAlert} />
              <ThreatIdentificationCard addAlert={addAlert} />
              <LicensePlateRecognitionCard addAlert={addAlert} />
            </div>
            {/* Add more feature sections or components here if needed */}
          </div>
          
          {/* Alerts Panel Section */}
          <div className="lg:col-span-4 xl:col-span-3">
             <AlertsPanel alerts={alerts} />
          </div>
        </div>
      </main>
      <footer className="text-center p-4 text-xs text-muted-foreground border-t border-border">
        BorderWatch AI &copy; {new Date().getFullYear()} - National Security Systems
      </footer>
    </div>
  );
}
