'use client';

import React, { useMemo, useState } from 'react';
import type { Alert as AlertType } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert as ShadcnAlert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BellRing, ShieldAlert, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface AlertsPanelProps {
  alerts: AlertType[];
}

type Severity = AlertType['severity'];
const SEVERITIES: Severity[] = ['Critical', 'High', 'Medium', 'Low'];

const severityIcon: Record<Severity, JSX.Element> = {
  Critical: <ShieldAlert className="h-4 w-4 text-destructive" />,
  High:     <AlertTriangle className="h-4 w-4 text-orange-500" />,
  Medium:   <Info className="h-4 w-4 text-yellow-500" />,
  Low:      <CheckCircle2 className="h-4 w-4 text-green-500" />,
};

const severityAlertClasses: Record<Severity, string> = {
  Critical: 'border-destructive bg-destructive/10 text-destructive-foreground',
  High:     'border-orange-500 bg-orange-500/10 text-orange-foreground',
  Medium:   'border-yellow-500 bg-yellow-500/10 text-yellow-foreground',
  Low:      'border-green-500 bg-green-500/10 text-green-foreground',
};

export function AlertsPanel({ alerts }: AlertsPanelProps) {
  const [activeTab, setActiveTab] = useState<Severity>('Critical');

  const { counts, filtered, hasAnyThreat } = useMemo(() => {
    const countsMap: Record<Severity, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    for (const a of alerts) {
      countsMap[a.severity as Severity] = (countsMap[a.severity as Severity] || 0) + 1;
    }

    const filteredList = alerts
      .filter(a => a.severity === activeTab)
      .sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp));

    const hasThreat = (countsMap.Critical + countsMap.High + countsMap.Medium) > 0;

    return { counts: countsMap, filtered: filteredList, hasAnyThreat: hasThreat };
  }, [alerts, activeTab]);

  const renderAlert = (alert: AlertType) => (
    <ShadcnAlert
      key={alert.id}
      className={`${severityAlertClasses[alert.severity]} transition-all animate-in fade-in-50 slide-in-from-bottom-5`}
    >
      <div className="flex items-start space-x-3">
        <div className="mt-1">{severityIcon[alert.severity]}</div>
        <div>
          <AlertTitle className="font-semibold">{alert.title}</AlertTitle>
          <AlertDescription className="text-sm">{alert.description}</AlertDescription>
          <p className="text-xs text-muted-foreground mt-1">
            {formatDistanceToNow(new Date(alert.timestamp), { addSuffix: true })} — {alert.type}
          </p>
        </div>
      </div>
    </ShadcnAlert>
  );

  // Small helper to render a counter tile
  const CounterTile = ({
    bg,
    border,
    label,
    emoji,
    count,
    countColor,
  }: {
    bg: string;
    border: string;
    label: string;
    emoji: string;
    count: number;
    countColor: string;
  }) => (
    <div className={`w-full min-w-0 rounded-lg ${bg} ${border} px-3 py-2`}>
      <div className="flex flex-col items-start justify-between gap-1">
        <span className="font-medium text-sm flex items-center gap-2">
          <span aria-hidden>{emoji}</span>
          {label}
        </span>
        <span className={`font-bold ${countColor} text-lg`}>{count}</span>
      </div>
    </div>
  );

  return (
    <Card className="shadow-lg flex flex-col">
      <CardHeader>
        <div className="flex items-center space-x-2">
          <BellRing className="h-6 w-6 text-accent" />
          <CardTitle className="font-headline text-accent">Real-Time Alerts</CardTitle>
        </div>
        <CardDescription>Counts above; use the navbar to switch severity.</CardDescription>
      </CardHeader>

      {/* Counters in 2 columns always */}
      <div className="px-4 pb-3">
        <div className="grid grid-cols-2 gap-3">
          <CounterTile
            bg="bg-red-500/10"
            border="border border-red-500/30"
            label="Critical"
            emoji="🛑"
            count={counts.Critical}
            countColor="text-red-600"
          />
          <CounterTile
            bg="bg-orange-500/10"
            border="border border-orange-500/30"
            label="High"
            emoji="⚠️"
            count={counts.High}
            countColor="text-orange-600"
          />
          <CounterTile
            bg="bg-yellow-500/10"
            border="border border-yellow-500/30"
            label="Medium"
            emoji="🟡"
            count={counts.Medium}
            countColor="text-yellow-600"
          />
          <CounterTile
            bg="bg-green-500/10"
            border="border border-green-500/30"
            label="Low"
            emoji="🟢"
            count={counts.Low}
            countColor="text-green-600"
          />
        </div>
      </div>

      {/* Gradient indicator ONLY when there is any threat */}
      {hasAnyThreat && (
        <div className="h-1 bg-gradient-to-r from-red-500/70 via-orange-400/70 to-yellow-400/70" />
      )}

      {/* Navbar */}
      <div className="flex border-b">
        {SEVERITIES.map((sev) => {
          const isActive = activeTab === sev;
          return (
            <button
              key={sev}
              onClick={() => setActiveTab(sev)}
              className={`flex-1 py-2 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors
                ${isActive ? 'border-primary bg-muted text-foreground rounded-t-md shadow-sm'
                           : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              {severityIcon[sev]}
              <span className="capitalize">{sev.toLowerCase()}</span>
            </button>
          );
        })}
      </div>

      <CardContent className="flex-grow overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <BellRing className="h-12 w-12 mb-4" />
            <p>No {activeTab.toLowerCase()} alerts at the moment.</p>
          </div>
        ) : (
          <ScrollArea className="h-full pr-4">
            <div className="space-y-4">{filtered.map(renderAlert)}</div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
