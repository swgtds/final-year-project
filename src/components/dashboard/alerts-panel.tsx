'use client';

import React from 'react';
import type { Alert as AlertType } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert as ShadcnAlert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BellRing, ShieldAlert, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface AlertsPanelProps {
  alerts: AlertType[];
}

export function AlertsPanel({ alerts }: AlertsPanelProps) {
  const getSeverityIcon = (severity: AlertType['severity']) => {
    switch (severity) {
      case 'Critical':
        return <ShieldAlert className="h-5 w-5 text-destructive" />;
      case 'High':
        return <AlertTriangle className="h-5 w-5 text-orange-500" />;
      case 'Medium':
        return <Info className="h-5 w-5 text-yellow-500" />;
      case 'Low':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      default:
        return <Info className="h-5 w-5" />;
    }
  };

  const getSeverityClass = (severity: AlertType['severity']) => {
    switch (severity) {
      case 'Critical':
        return 'border-destructive bg-destructive/10 text-destructive-foreground';
      case 'High':
        return 'border-orange-500 bg-orange-500/10 text-orange-foreground';
      case 'Medium':
        return 'border-yellow-500 bg-yellow-500/10 text-yellow-foreground';
      case 'Low':
        return 'border-green-500 bg-green-500/10 text-green-foreground';
      default:
        return 'border-border';
    }
  };


  return (
    <Card className="shadow-lg col-span-1 lg:col-span-2 xl:col-span-1 row-span-2 flex flex-col">
      <CardHeader>
        <div className="flex items-center space-x-2">
          <BellRing className="h-6 w-6 text-accent" />
          <CardTitle className="font-headline text-accent">Real-Time Alerts</CardTitle>
        </div>
        <CardDescription>Critical notifications and operational updates.</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow overflow-hidden">
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <BellRing className="h-12 w-12 mb-4" />
            <p>No alerts at the moment.</p>
          </div>
        ) : (
          <ScrollArea className="h-full pr-4">
            <div className="space-y-4">
              {alerts.slice().reverse().map((alert) => ( // Show newest first
                <ShadcnAlert key={alert.id} className={`${getSeverityClass(alert.severity)} transition-all animate-in fade-in-50 slide-in-from-bottom-5`}>
                  <div className="flex items-start space-x-3">
                    <div className="mt-1">{getSeverityIcon(alert.severity)}</div>
                    <div>
                      <AlertTitle className="font-semibold">{alert.title}</AlertTitle>
                      <AlertDescription className="text-sm">
                        {alert.description}
                      </AlertDescription>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(alert.timestamp), { addSuffix: true })} - {alert.type}
                      </p>
                    </div>
                  </div>
                </ShadcnAlert>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
