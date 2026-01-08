'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import {
  identifyThreat,
  ThreatIdentificationInput,
  ThreatIdentificationOutput,
} from '@/ai/flows/identify-threats';
import type { Alert } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  ScanFace,
  UserCheck,
  UserX,
  Loader2,
  Video,
  UploadCloud,
  AlertCircle,
  Square,
} from 'lucide-react';
import { Alert as ShadcnAlert, AlertTitle, AlertDescription } from '@/components/ui/alert';

const fileToDataUri = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export function ThreatIdentificationCard({ addAlert }: { addAlert: (alert: Alert) => void }) {
  const [faceScanFile, setFaceScanFile] = useState<File | null>(null);
  const [scanPreview, setScanPreview] = useState<string | null>(null); // upload preview only
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ThreatIdentificationOutput | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [isWebcamActive, setIsWebcamActive] = useState(false);

  // Live detection state
  const [isLiveDetecting, setIsLiveDetecting] = useState(false);
  const [isLiveProcessing, setIsLiveProcessing] = useState(false);
  const liveTimerRef = useRef<number | null>(null);

  const { toast } = useToast();

  // Start/stop webcam stream on toggle
  useEffect(() => {
    let streamInstance: MediaStream | null = null;

    const startWebcam = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        streamInstance = stream;
        setHasCameraPermission(true);
        if (videoRef.current) {
          (videoRef.current as HTMLVideoElement).srcObject = stream;
        }
      } catch (err) {
        console.error('Error accessing camera:', err);
        setHasCameraPermission(false);
        setIsWebcamActive(false);
        toast({
          variant: 'destructive',
          title: 'Camera Access Denied',
          description: 'Please enable camera permissions in your browser settings to use this feature.',
        });
      }
    };

    if (isWebcamActive) startWebcam();

    return () => {
      // stop live loop
      if (liveTimerRef.current) {
        window.clearInterval(liveTimerRef.current);
        liveTimerRef.current = null;
      }
      setIsLiveDetecting(false);
      setIsLiveProcessing(false);

      // stop stream
      if (streamInstance) {
        streamInstance.getTracks().forEach((track) => track.stop());
      }
      if (videoRef.current) {
        (videoRef.current as HTMLVideoElement).srcObject = null;
      }
    };
  }, [isWebcamActive, toast]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setFaceScanFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setScanPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      setResult(null);
      setError(null);
    }
  };

  // Shared identify + alert logic
  const runIdentify = async (imageDataUri: string, source: 'upload' | 'live') => {
    const input: ThreatIdentificationInput = { photoDataUri: imageDataUri };
    const output = await identifyThreat(input);
    setResult(output);

    toast({
      title: source === 'live' ? 'Live Threat Identification' : 'Threat Identification Complete',
      description: `${output.isThreat ? `Threat: ${output.name || 'Unknown'}` : 'No immediate threat'} • Confidence: ${(
        (output.confidenceScore || 0) * 100
      ).toFixed(0)}%`,
      variant: output.isThreat ? 'destructive' : 'default',
    });

    // Alerts
    addAlert({
      id: `ti-${new Date().toISOString()}`,
      timestamp: new Date().toISOString(),
      type: 'Threat Identification',
      severity: output.isThreat ? 'Critical' : 'Low',
      title: output.isThreat ? `Potential Threat: ${output.name || 'Unknown'}` : `Individual Cleared: ${output.name || 'Unknown'}`,
      description: `${output.reason || (output.isThreat ? 'Matches person of interest criteria.' : 'No threat indicators found.')} Confidence: ${(
        (output.confidenceScore || 0) * 100
      ).toFixed(0)}%`,
      data: output,
    });
  };

  const processImageForAnalysis = async (imageDataUri: string, source: 'upload' | 'live' = 'upload') => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      await runIdentify(imageDataUri, source);
    } catch (e: any) {
      setError(e.message || 'An error occurred during threat identification.');
      toast({ title: 'Threat Identification Failed', description: e.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUploadSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!faceScanFile) {
      setError('Please upload a facial scan.');
      toast({ title: 'Error', description: 'Please upload a facial scan.', variant: 'destructive' });
      return;
    }
    const photoDataUri = await fileToDataUri(faceScanFile);
    await processImageForAnalysis(photoDataUri, 'upload');
  };

  // Live loop (no capture)
  const startLiveDetection = () => {
    if (!videoRef.current || !canvasRef.current) return;
    if (isLiveDetecting) return;
    setIsLiveDetecting(true);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    const tick = async () => {
      if (isLiveProcessing) return; // throttle concurrent calls
      const video = videoRef.current!;
      if (!ctx || video.readyState < 2) return;

      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 360;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUri = canvas.toDataURL('image/jpeg');

      try {
        setIsLiveProcessing(true);
        await runIdentify(dataUri, 'live');
      } catch (e) {
        console.error(e);
      } finally {
        setIsLiveProcessing(false);
      }
    };

    // Run every ~1.8s
    liveTimerRef.current = window.setInterval(tick, 1800);
  };

  const stopLiveDetection = () => {
    if (liveTimerRef.current) {
      window.clearInterval(liveTimerRef.current);
      liveTimerRef.current = null;
    }
    setIsLiveDetecting(false);
  };

  const toggleWebcamMode = () => {
    setIsWebcamActive((v) => !v);
    setResult(null);
    setError(null);
    setHasCameraPermission(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ScanFace className="h-6 w-6 text-primary" />
            <CardTitle className="font-headline">AI Intruder Detection</CardTitle>
          </div>
          <Button variant="outline" size="sm" onClick={toggleWebcamMode}>
            {isWebcamActive ? <UploadCloud className="mr-2 h-4 w-4" /> : <Video className="mr-2 h-4 w-4" />}
            {isWebcamActive ? 'Use File Upload' : 'Use Webcam'}
          </Button>
        </div>
        <CardDescription>Cross-reference intruder detection for army personnel</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* ================= Upload Mode ================= */}
        {!isWebcamActive && (
          <form onSubmit={handleFileUploadSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="face-scan-file">Scan here</Label>
              <Input
                id="face-scan-file"
                type="file"
                accept="image/*"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
              />
            </div>

            {scanPreview && (
              <div className="mt-4 relative w-full h-48 rounded-md overflow-hidden border border-border">
                <Image src={scanPreview} alt="Face scan preview" fill style={{ objectFit: 'cover' }} data-ai-hint="face portrait" />
              </div>
            )}

            <Button type="submit" disabled={isLoading || !faceScanFile} className="w-full">
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanFace className="mr-2 h-4 w-4" />}
              {isLoading ? 'Analyzing File...' : 'Analyze Uploaded Image'}
            </Button>
          </form>
        )}

        {/* ================= Webcam / Live Mode ================= */}
        {isWebcamActive && (
          <div className="space-y-4">
            <div className="relative w-full aspect-video bg-muted rounded-md overflow-hidden border border-border">
              <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline muted />
              <canvas ref={canvasRef} className="hidden" />
              {hasCameraPermission === null && !videoRef.current?.srcObject && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <Loader2 className="h-8 w-8 text-white animate-spin" />
                  <p className="text-white ml-2">Requesting camera...</p>
                </div>
              )}
            </div>

            {hasCameraPermission === false && (
              <ShadcnAlert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Camera Access Required</AlertTitle>
                <AlertDescription>
                  Camera access was denied. Please enable it in your browser settings and refresh the page or try toggling webcam mode again.
                </AlertDescription>
              </ShadcnAlert>
            )}

            {/* Live detection button — styled like your LPR example */}
            <div className="flex gap-2">
              {!isLiveDetecting ? (
                <Button type="button" onClick={startLiveDetection} disabled={!hasCameraPermission} className="w-full">
                  {isLiveProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Video className="mr-2 h-4 w-4" />}
                  {isLiveProcessing ? 'Starting…' : 'Start Live Detection'}
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={stopLiveDetection} className="w-full">
                  <Square className="mr-2 h-4 w-4" />
                  Stop Live Detection
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex flex-col items-stretch space-y-4 pt-0">
        {error && <p className="text-sm text-destructive text-center">{error}</p>}
        {result && (
          <div
            className={`mt-4 p-4 border rounded-md ${
              result.isThreat ? 'border-destructive bg-destructive/10' : 'border-green-500 bg-green-500/10'
            }`}
          >
            <div className="flex items-center space-x-2">
              {result.isThreat ? <UserX className="h-6 w-6 text-destructive" /> : <UserCheck className="h-6 w-6 text-green-500" />}
              <h4 className={`font-semibold text-lg ${result.isThreat ? 'text-destructive' : 'text-green-500'}`}>
                {result.isThreat ? 'Potential Threat Identified' : 'No Threat Identified'}
              </h4>
            </div>
            {result.name && (
              <p className="text-sm">
                <strong className="text-foreground">Name:</strong> {result.name}
              </p>
            )}
            {result.isThreat && result.reason && (
              <p className="text-sm">
                <strong className="text-foreground">Reason:</strong> {result.reason}
              </p>
            )}
            {!result.isThreat && result.reason && (
              <p className="text-sm">
                <strong className="text-foreground">Assessment:</strong> {result.reason}
              </p>
            )}
            <p className="text-sm">
              <strong className="text-foreground">Confidence:</strong> {((result.confidenceScore || 0) * 100).toFixed(0)}%
            </p>
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
