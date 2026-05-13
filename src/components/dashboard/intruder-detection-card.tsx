'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import {
  analyzeIntruderFrame,
  type IntruderDetectionInput,
  type IntruderDetectionOutput,
} from '@/ai/flows/intruder-detection';
import type { Alert } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  ScanFace,
  Loader2,
  Video,
  UploadCloud,
  AlertCircle,
  Square,
  Radar,
  ShieldAlert,
  Activity,
} from 'lucide-react';
import { Alert as ShadcnAlert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const fileToDataUri = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const LIVE_INTERVAL_MS = 2000;

const ZONE_OPTIONS = [
  { value: 'Perimeter North – RESTRICTED (fence line)', label: 'Perimeter North (restricted)' },
  { value: 'Vehicle Gate – Checkpoint Charlie', label: 'Vehicle checkpoint' },
  { value: 'Staging yard – general monitoring', label: 'Staging yard (general)' },
  { value: 'Custom…', label: 'Custom zone (type below)' },
];

function loadImageData(dataUri: string, targetW = 96): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = targetW;
      const h = Math.max(1, Math.round((img.height / img.width) * w));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas unsupported'));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(ctx.getImageData(0, 0, w, h));
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = dataUri;
  });
}

/** Normalized 0–1 mean RGB delta between consecutive downscaled frames */
async function computeFrameDiffScore(prevUri: string | null, currUri: string): Promise<number> {
  if (!prevUri) return 0;
  try {
    const [a, b] = await Promise.all([loadImageData(prevUri), loadImageData(currUri)]);
    if (a.width !== b.width || a.height !== b.height) return 0.35;
    let sum = 0;
    const n = a.data.length / 4;
    for (let i = 0; i < a.data.length; i += 4) {
      sum +=
        Math.abs(a.data[i] - b.data[i]) +
        Math.abs(a.data[i + 1] - b.data[i + 1]) +
        Math.abs(a.data[i + 2] - b.data[i + 2]);
    }
    const meanChannel = sum / n / 3;
    return Math.min(1, meanChannel / 80);
  } catch {
    return 0;
  }
}

function summarizeFlow(diff: number): string {
  if (diff < 0.025) return 'STATIONARY';
  if (diff < 0.09) return 'LOW_MOTION';
  if (diff < 0.18) return 'MODERATE_MOTION';
  if (diff < 0.32) return 'HIGH_MOTION';
  return diff > 0.45 ? 'SUDDEN_ACCEL_OR_LARGE_SHIFT' : 'ERRATIC_OR_FAST';
}

interface TimelineEntry {
  timestampIso: string;
  alertLevel: IntruderDetectionOutput['alertLevel'];
  suspicionScore: number;
  oneLineSummary: string;
}

interface IntruderDetectionCardProps {
  addAlert: (alert: Alert) => void;
}

export function IntruderDetectionCard({ addAlert }: IntruderDetectionCardProps) {
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [scanPreview, setScanPreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<IntruderDetectionOutput | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [zonePreset, setZonePreset] = useState(ZONE_OPTIONS[0].value);
  const [zoneCustom, setZoneCustom] = useState('');
  const effectiveZone =
    zonePreset === 'Custom…' && zoneCustom.trim() ? zoneCustom.trim() : zonePreset;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [isWebcamActive, setIsWebcamActive] = useState(false);

  const [isLiveDetecting, setIsLiveDetecting] = useState(false);
  const [isLiveProcessing, setIsLiveProcessing] = useState(false);
  const liveTimerRef = useRef<number | null>(null);
  const prevFrameUriRef = useRef<string | null>(null);
  const liveStartedAtRef = useRef<number | null>(null);
  const consecutiveElevatedRef = useRef(0);
  const timelineRef = useRef<TimelineEntry[]>([]);
  const lastElevatedRef = useRef(false);

  const { toast } = useToast();

  useEffect(() => {
    let streamInstance: MediaStream | null = null;
    const startWebcam = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        streamInstance = stream;
        setHasCameraPermission(true);
        if (videoRef.current) (videoRef.current as HTMLVideoElement).srcObject = stream;
      } catch (err) {
        console.error(err);
        setHasCameraPermission(false);
        setIsWebcamActive(false);
        toast({
          variant: 'destructive',
          title: 'Camera Access Denied',
          description: 'Enable camera permissions to use live intruder surveillance.',
        });
      }
    };
    if (isWebcamActive) startWebcam();
    return () => {
      if (liveTimerRef.current) {
        window.clearInterval(liveTimerRef.current);
        liveTimerRef.current = null;
      }
      setIsLiveDetecting(false);
      setIsLiveProcessing(false);
      if (streamInstance) streamInstance.getTracks().forEach((t) => t.stop());
      if (videoRef.current) (videoRef.current as HTMLVideoElement).srcObject = null;
    };
  }, [isWebcamActive, toast]);

  const pushTimeline = useCallback((out: IntruderDetectionOutput) => {
    const entry: TimelineEntry = {
      timestampIso: new Date().toISOString(),
      alertLevel: out.alertLevel,
      suspicionScore: out.suspicionScore,
      oneLineSummary: (out.reasoning || out.classification).slice(0, 160),
    };
    const next = [...timelineRef.current, entry].slice(-8);
    timelineRef.current = next;
    if (out.alertLevel === 'ELEVATED' || out.alertLevel === 'HIGH_ALERT') {
      consecutiveElevatedRef.current += 1;
    } else {
      consecutiveElevatedRef.current = 0;
    }
  }, []);

  const runAnalyze = useCallback(
    async (surveillanceFrameDataUri: string, source: 'upload' | 'live') => {
      const diff =
        source === 'live'
          ? await computeFrameDiffScore(prevFrameUriRef.current, surveillanceFrameDataUri)
          : 0;
      if (source === 'live') prevFrameUriRef.current = surveillanceFrameDataUri;

      const dwellHintSeconds =
        source === 'live' && liveStartedAtRef.current
          ? Math.floor((Date.now() - liveStartedAtRef.current) / 1000)
          : undefined;

      const input: IntruderDetectionInput = {
        surveillanceFrameDataUri,
        zoneLabel: effectiveZone,
        sessionTimelineJson: JSON.stringify(timelineRef.current),
        motionMetrics: {
          frameDiffScore: diff,
          dwellHintSeconds,
          consecutiveElevatedFrames: consecutiveElevatedRef.current,
        },
        opticalFlowSummary: source === 'live' ? summarizeFlow(diff) : undefined,
      };

      const output = await analyzeIntruderFrame(input);
      setResult(output);
      pushTimeline(output);

      const isHigh = output.alertLevel === 'HIGH_ALERT';
      const sustainedElevated = lastElevatedRef.current && output.alertLevel === 'ELEVATED';
      lastElevatedRef.current =
        output.alertLevel === 'ELEVATED' || output.alertLevel === 'HIGH_ALERT';

      const shouldRaiseDashboardAlert =
        isHigh ||
        (output.alertLevel === 'ELEVATED' &&
          (output.suspicionScore >= 72 || sustainedElevated));

      toast({
        title: source === 'live' ? 'Live surveillance tick' : 'Intruder analysis complete',
        description: `${output.classification} • ${output.alertLevel} • suspicion ${output.suspicionScore}/100`,
        variant: isHigh ? 'destructive' : output.alertLevel === 'ELEVATED' ? 'default' : 'default',
      });

      if (shouldRaiseDashboardAlert) {
        addAlert({
          id: `intruder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: new Date().toISOString(),
          type: 'Intruder Surveillance',
          severity: isHigh ? 'Critical' : 'High',
          title: output.classification,
          description: `${output.alertLevel}. Uniform: ${output.uniformStatus.replace(/_/g, ' ')}. ${output.recommendedAction}`,
          data: output,
        });
      }
    },
    [addAlert, effectiveZone, pushTimeline, toast]
  );

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setScanFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setScanPreview(reader.result as string);
      reader.readAsDataURL(file);
      setResult(null);
      setError(null);
    }
  };

  const handleUploadSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!scanFile) {
      setError('Upload a surveillance frame.');
      toast({ title: 'Missing image', variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    setError(null);
    setResult(null);
    lastElevatedRef.current = false;
    try {
      const uri = await fileToDataUri(scanFile);
      await runAnalyze(uri, 'upload');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Analysis failed';
      setError(msg);
      toast({ title: 'Intruder analysis failed', description: msg, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const startLiveDetection = () => {
    if (!videoRef.current || !canvasRef.current) return;
    if (isLiveDetecting) return;
    setIsLiveDetecting(true);
    liveStartedAtRef.current = Date.now();
    prevFrameUriRef.current = null;
    timelineRef.current = [];
    consecutiveElevatedRef.current = 0;
    lastElevatedRef.current = false;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    const tick = async () => {
      if (isLiveProcessing) return;
      const video = videoRef.current!;
      if (!ctx || video.readyState < 2) return;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 360;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUri = canvas.toDataURL('image/jpeg', 0.72);
      try {
        setIsLiveProcessing(true);
        await runAnalyze(dataUri, 'live');
      } catch (e) {
        console.error(e);
      } finally {
        setIsLiveProcessing(false);
      }
    };

    liveTimerRef.current = window.setInterval(tick, LIVE_INTERVAL_MS);
    void tick();
  };

  const stopLiveDetection = () => {
    if (liveTimerRef.current) {
      window.clearInterval(liveTimerRef.current);
      liveTimerRef.current = null;
    }
    setIsLiveDetecting(false);
    liveStartedAtRef.current = null;
    lastElevatedRef.current = false;
  };

  const toggleWebcamMode = () => {
    setIsWebcamActive((v) => !v);
    setResult(null);
    setError(null);
    stopLiveDetection();
    prevFrameUriRef.current = null;
    lastElevatedRef.current = false;
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300 border-orange-500/20">
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center space-x-2">
            <Radar className="h-6 w-6 text-orange-500" />
            <CardTitle className="font-headline">AI Intruder Detection</CardTitle>
          </div>
          <Button variant="outline" size="sm" onClick={toggleWebcamMode}>
            {isWebcamActive ? <UploadCloud className="mr-2 h-4 w-4" /> : <Video className="mr-2 h-4 w-4" />}
            {isWebcamActive ? 'Upload frame' : 'Live CCTV'}
          </Button>
        </div>
        <CardDescription>
          Behavioral threat fusion: uniform classification, motion cues, zone policy, and session timeline (simulated
          tracking stack).
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Surveillance zone</Label>
          <Select value={zonePreset} onValueChange={setZonePreset}>
            <SelectTrigger>
              <SelectValue placeholder="Select zone" />
            </SelectTrigger>
            <SelectContent>
              {ZONE_OPTIONS.map((z) => (
                <SelectItem key={z.value} value={z.value}>
                  {z.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {zonePreset === 'Custom…' && (
            <Input
              placeholder="Describe sector (include RESTRICTED if applicable)"
              value={zoneCustom}
              onChange={(e) => setZoneCustom(e.target.value)}
            />
          )}
        </div>

        {!isWebcamActive && (
          <form onSubmit={handleUploadSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="intruder-frame">Surveillance frame</Label>
              <Input
                id="intruder-frame"
                type="file"
                accept="image/*"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
              />
            </div>
            {scanPreview && (
              <div className="relative w-full h-48 rounded-md overflow-hidden border border-border">
                <Image src={scanPreview} alt="Frame preview" fill style={{ objectFit: 'cover' }} />
              </div>
            )}
            <Button type="submit" disabled={isLoading || !scanFile} className="w-full">
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanFace className="mr-2 h-4 w-4" />}
              {isLoading ? 'Fusing CV signals…' : 'Analyze single frame'}
            </Button>
          </form>
        )}

        {isWebcamActive && (
          <div className="space-y-4">
            <div className="relative w-full aspect-video bg-muted rounded-md overflow-hidden border border-border">
              <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline muted />
              <canvas ref={canvasRef} className="hidden" />
              {hasCameraPermission === null && !videoRef.current?.srcObject && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white gap-2">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <span>Requesting camera…</span>
                </div>
              )}
            </div>

            {hasCameraPermission === false && (
              <ShadcnAlert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Camera required</AlertTitle>
                <AlertDescription>Allow camera access for continuous monitoring.</AlertDescription>
              </ShadcnAlert>
            )}

            <div className="flex gap-2">
              {!isLiveDetecting ? (
                <Button type="button" onClick={startLiveDetection} disabled={!hasCameraPermission} className="w-full">
                  {isLiveProcessing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Activity className="mr-2 h-4 w-4" />
                  )}
                  Start continuous analysis
                </Button>
              ) : (
                <Button type="button" variant="destructive" onClick={stopLiveDetection} className="w-full">
                  <Square className="mr-2 h-4 w-4" />
                  Stop monitoring
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Every {LIVE_INTERVAL_MS / 1000}s a JPEG frame is sampled; pixel-difference vs previous frame feeds motion
              metrics. The vision model simulates uniform + pose/behavior fusion with false-positive controls.
            </p>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex flex-col items-stretch space-y-4 pt-0">
        {error && <p className="text-sm text-destructive text-center">{error}</p>}
        {result && (
          <div
            className={`mt-2 p-4 border rounded-md space-y-2 ${
              result.alertLevel === 'HIGH_ALERT'
                ? 'border-destructive bg-destructive/15 ring-2 ring-destructive/40'
                : result.alertLevel === 'ELEVATED'
                  ? 'border-amber-500 bg-amber-500/10'
                  : 'border-green-600/40 bg-green-500/5'
            }`}
          >
            <div className="flex items-center gap-2 flex-wrap">
              {result.alertLevel === 'HIGH_ALERT' ? (
                <ShieldAlert className="h-6 w-6 text-destructive shrink-0" />
              ) : (
                <Activity className="h-6 w-6 text-muted-foreground shrink-0" />
              )}
              <h4 className="font-semibold text-lg">{result.classification}</h4>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-muted">{result.alertLevel}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <p>
                <strong>Suspicion</strong>
                <br />
                <span className="text-2xl font-bold tabular-nums">{result.suspicionScore}</span>
                <span className="text-muted-foreground">/100</span>
              </p>
              <p>
                <strong>Uniform</strong>
                <br />
                <span className="leading-tight">{result.uniformStatus.replace(/_/g, ' ')}</span>
              </p>
            </div>
            {result.observedBehaviors.length > 0 && (
              <div>
                <strong className="text-sm">Behaviors</strong>
                <ul className="list-disc list-inside text-sm text-muted-foreground mt-1">
                  {result.observedBehaviors.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.objectFindings.length > 0 && (
              <p className="text-sm">
                <strong>Objects:</strong> {result.objectFindings.join(', ')}
              </p>
            )}
            <p className="text-sm">
              <strong>Motion</strong> {result.motionNarrative}
            </p>
            <p className="text-sm text-muted-foreground">
              <strong>Tracking</strong> {result.trackingAssessment}
            </p>
            <p className="text-sm">
              <strong>Action:</strong> {result.recommendedAction}
            </p>
            <p className="text-xs text-muted-foreground border-t pt-2">{result.reasoning}</p>
            <p className="text-sm">
              <strong>Confidence</strong> {(result.confidenceScore * 100).toFixed(0)}%
            </p>
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
