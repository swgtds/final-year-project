'use client';

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { detectObjects, DetectObjectsInput, DetectObjectsOutput } from '@/ai/flows/detect-objects';
import type { Alert } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Camera, Car, Loader2, AlertTriangle, Info, ShieldAlert, CheckCircle2, Video } from 'lucide-react';

interface ObjectDetectionCardProps {
  addAlert: (alert: Alert) => void;
}

const fileToDataUri = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// tiny helper
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

// naive brightness check (0..255) — uses DOM <img>, not Next.js Image
async function estimateAverageLuma(dataUri: string): Promise<number> {
  return new Promise<number>((resolve) => {
    const imgEl: HTMLImageElement = document.createElement('img');
    imgEl.onload = () => {
      const canvas = document.createElement('canvas');
      const w = Math.max(1, Math.min(320, imgEl.width)); // downscale for speed
      const h = Math.max(1, Math.round((imgEl.height / imgEl.width) * w));
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(255);
      ctx.drawImage(imgEl, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        // Rec. 601 luma
        const y = 0.299 * r + 0.587 * g + 0.114 * b;
        sum += y;
      }
      resolve(sum / (data.length / 4));
    };
    imgEl.onerror = () => resolve(255);
    imgEl.src = dataUri;
  });
}

// keywords that indicate weapons/ordnance
const WEAPON_KEYWORDS = [
  'gun','handgun','pistol','revolver','rifle','shotgun','smg','firearm',
  'knife','blade','dagger','machete','sword',
  'grenade','explosive','bomb','tnt','c4','ied',
  'ammo','ammunition','magazine','cartridge','bullet','shell',
  'baton','brass knuckles','pepper spray','taser','stun gun',
  'weapon'
];

export function ObjectDetectionCard({ addAlert }: ObjectDetectionCardProps) {
  const [vehiclePhoto, setVehiclePhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEnhancingLowLight, setIsEnhancingLowLight] = useState(false);
  const [lowLightDetected, setLowLightDetected] = useState(false);
  const [result, setResult] = useState<DetectObjectsOutput | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Webcam/live detection
  const [isWebcamActive, setIsWebcamActive] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [isLiveDetecting, setIsLiveDetecting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement>(null);
  const liveTimerRef = useRef<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Toggle webcam stream
  useEffect(() => {
    let stream: MediaStream | null = null;
    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (videoRef.current) {
          (videoRef.current as HTMLVideoElement).srcObject = stream;
        }
        setHasCameraPermission(true);
      } catch (e) {
        console.error(e);
        setHasCameraPermission(false);
        setIsWebcamActive(false);
        toast({
          title: 'Camera Access Denied',
          description: 'Enable camera permissions in your browser settings.',
          variant: 'destructive',
        });
      }
    };

    if (isWebcamActive) start();

    return () => {
      // cleanup stream + loop
      if (liveTimerRef.current) {
        window.clearInterval(liveTimerRef.current);
        liveTimerRef.current = null;
      }
      setIsLiveDetecting(false);
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (videoRef.current) (videoRef.current as HTMLVideoElement).srcObject = null;
    };
  }, [isWebcamActive, toast]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setVehiclePhoto(file);
      const dataUri = await fileToDataUri(file);
      setPhotoPreview(dataUri);
      setResult(null);
      setError(null);
      // low-light sniff
      const luma = await estimateAverageLuma(dataUri);
      const isLow = luma < 40; // heuristic threshold
      setLowLightDetected(isLow);
    }
  };

  // Normalize threat level to at least "High" when weapons are detected
  const normalizeThreatWithWeapons = (output: DetectObjectsOutput): DetectObjectsOutput => {
    const objects = output.objectsDetected || [];
    const hasWeapon = objects.some(obj =>
      WEAPON_KEYWORDS.some(k => obj.toLowerCase().includes(k))
    );

    if (!hasWeapon) return output;

    const current = output.threatLevel?.toLowerCase?.() || 'low';
    // bump to High if not already High/Critical
    const bumped = ['high', 'critical'].includes(current) ? output.threatLevel : 'High';

    return { ...output, threatLevel: bumped as DetectObjectsOutput['threatLevel'] };
  };

  const runDetect = async (dataUri: string) => {
    // Always send environmentalConditions: 'auto'
    const input: DetectObjectsInput = { vehiclePhotoDataUri: dataUri, environmentalConditions: 'auto' };
    const raw = await detectObjects(input);

    // post-process for weapons -> bump threat
    const output = normalizeThreatWithWeapons(raw);
    setResult(output);

    toast({
      title: 'Object Detection',
      description: `${output.objectsDetected.length > 0 ? output.objectsDetected.join(', ') : 'No objects'} detected.`,
    });

    let severity: Alert['severity'] = 'Low';
    const lvl = output.threatLevel.toLowerCase();
    if (lvl === 'high') severity = 'High';
    else if (lvl === 'medium') severity = 'Medium';
    else if (lvl === 'critical') severity = 'Critical';

    addAlert({
      id: `od-${new Date().toISOString()}`,
      timestamp: new Date().toISOString(),
      type: 'Object Detection',
      severity,
      title: `Vehicle Scan: ${output.threatLevel} Threat`,
      description: `Detected: ${output.objectsDetected.join(', ') || 'None'}. Confidence: ${(output.confidenceScore * 100).toFixed(0)}%`,
      data: output,
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!vehiclePhoto || !photoPreview) {
      setError('Please upload a vehicle photo.');
      toast({ title: 'Error', description: 'Please upload a vehicle photo.', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      // If low light, show enhancement animation first (purely UI)
      if (lowLightDetected) {
        setIsEnhancingLowLight(true);
        // staged “processing” so it feels active
        await delay(500);
        await delay(800);
        setIsEnhancingLowLight(false);
      }
      await runDetect(photoPreview);
    } catch (e: any) {
      setError(e.message || 'An error occurred during object detection.');
      toast({ title: 'Object Detection Failed', description: e.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setIsLoading(false);
      setIsEnhancingLowLight(false);
    }
  };

  // Continuous live detection from webcam (no capture button)
  const startLiveDetection = () => {
    if (!videoRef.current || !liveCanvasRef.current) return;
    if (isLiveDetecting) return;
    setIsLiveDetecting(true);

    const canvas = liveCanvasRef.current;
    const ctx = canvas.getContext('2d');

    const tick = async () => {
      const video = videoRef.current!;
      if (!ctx || video.readyState < 2) return;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 360;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUri = canvas.toDataURL('image/jpeg');

      // quick low-light check per frame (optional)
      const luma = await estimateAverageLuma(dataUri);
      setLowLightDetected(luma < 40);

      try {
        setIsLoading(true);
        await runDetect(dataUri);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };

    // run every ~1.8s to avoid hammering
    liveTimerRef.current = window.setInterval(tick, 1800);
  };

  const stopLiveDetection = () => {
    if (liveTimerRef.current) {
      window.clearInterval(liveTimerRef.current);
      liveTimerRef.current = null;
    }
    setIsLiveDetecting(false);
  };

  const getThreatIcon = (level: string | undefined) => {
    if (!level) return <Info className="h-5 w-5 text-blue-500" />;
    switch (level?.toLowerCase()) {
      case 'high':
      case 'critical':
        return <ShieldAlert className="h-5 w-5 text-destructive" />;
      case 'medium':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'low':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      default:
        return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Car className="h-6 w-6 text-primary" />
            <CardTitle className="font-headline">AI Object Detection</CardTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setIsWebcamActive(v => !v);
              setResult(null);
              setError(null);
              setIsLiveDetecting(false);
            }}
          >
            <Video className="mr-2 h-4 w-4" />
            {isWebcamActive ? 'Use Image Upload' : 'Use Webcam'}
          </Button>
        </div>
        <CardDescription>Scan vehicle interiors for weapons or contraband. Conditions auto-detected.</CardDescription>
      </CardHeader>

      {!isWebcamActive && (
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="vehicle-photo">Vehicle Photo</Label>
              <Input
                id="vehicle-photo"
                type="file"
                accept="image/*"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
              />
            </div>

            {photoPreview && (
              <div className="mt-4 relative w-full h-48 rounded-md overflow-hidden border border-border">
                <Image src={photoPreview} alt="Vehicle preview" fill style={{ objectFit: 'cover' }} data-ai-hint="vehicle interior" />
              </div>
            )}

            {/* Low-light banner + faux enhancement progress */}
            {lowLightDetected && (
              <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm">
                <div className="font-medium mb-2">Very low light detected — enhancing image…</div>
                {isEnhancingLowLight ? (
                  <div className="w-full h-2 rounded bg-muted overflow-hidden">
                    <div className="h-full w-1/3 animate-[progress_1.2s_ease-in-out_infinite] bg-yellow-500/70" />
                  </div>
                ) : (
                  <div className="text-muted-foreground">Enhancement complete. Running detection…</div>
                )}
              </div>
            )}
          </CardContent>

          <CardFooter className="flex flex-col items-stretch space-y-4">
            <Button type="submit" disabled={isLoading || !vehiclePhoto} className="w-full">
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
              {isLoading ? 'Scanning...' : 'Detect Objects'}
            </Button>

            {error && <p className="text-sm text-destructive text-center">{error}</p>}

            {result && (
              <div className="mt-4 p-4 border border-border rounded-md bg-background/50 space-y-3">
                <h4 className="font-semibold text-lg text-foreground flex items-center">
                  {getThreatIcon(result.threatLevel)}
                  <span className="ml-2">Detection Result: {result.threatLevel} Threat</span>
                </h4>
                <p className="text-sm">
                  <strong className="text-foreground">Objects Detected:</strong>{' '}
                  {result.objectsDetected.length > 0 ? result.objectsDetected.join(', ') : 'None'}
                </p>
                <p className="text-sm">
                  <strong className="text-foreground">Confidence Score:</strong> {(result.confidenceScore * 100).toFixed(0)}%
                </p>
              </div>
            )}
          </CardFooter>
        </form>
      )}

      {isWebcamActive && (
        <>
          <CardContent className="space-y-4">
            <div className="relative w-full aspect-video bg-muted rounded-md overflow-hidden border border-border">
              <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline muted />
              <canvas ref={liveCanvasRef} className="hidden" />
              {hasCameraPermission === null && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <Loader2 className="h-8 w-8 text-white animate-spin" />
                  <p className="text-white ml-2">Requesting camera…</p>
                </div>
              )}
            </div>

            {lowLightDetected && (
              <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm">
                <div className="font-medium">Very low light stream — enhancing automatically…</div>
              </div>
            )}

            <div className="flex gap-2">
              {!isLiveDetecting ? (
                <Button type="button" onClick={startLiveDetection} disabled={!hasCameraPermission} className="w-full">
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Video className="mr-2 h-4 w-4" />}
                  {isLoading ? 'Preparing…' : 'Start Live Detection'}
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={stopLiveDetection} className="w-full">
                  Stop Live Detection
                </Button>
              )}
            </div>
          </CardContent>

          <CardFooter className="flex flex-col items-stretch space-y-4">
            {result && (
              <div className="mt-2 p-4 border border-border rounded-md bg-background/50 space-y-3">
                <h4 className="font-semibold text-lg text-foreground flex items-center">
                  {getThreatIcon(result.threatLevel)}
                  <span className="ml-2">Live Detection: {result.threatLevel} Threat</span>
                </h4>
                <p className="text-sm">
                  <strong className="text-foreground">Objects Detected:</strong>{' '}
                  {result.objectsDetected.length > 0 ? result.objectsDetected.join(', ') : 'None'}
                </p>
                <p className="text-sm">
                  <strong className="text-foreground">Confidence Score:</strong> {(result.confidenceScore * 100).toFixed(0)}%
                </p>
              </div>
            )}
          </CardFooter>
        </>
      )}

      {/* keyframe for faux progress */}
      <style jsx>{`
        @keyframes progress {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(10%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </Card>
  );
}