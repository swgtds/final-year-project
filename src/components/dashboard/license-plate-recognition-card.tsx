'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import {
  recognizeLicensePlate,
  RecognizeLicensePlateInput,
  RecognizeLicensePlateOutput,
} from '@/ai/flows/recognize-license-plate';
import type { Alert } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ScanLine, Loader2, ShieldAlert, CheckCircle2, Info, Video } from 'lucide-react';

interface LicensePlateRecognitionCardProps {
  addAlert: (alert: Alert) => void;
}

const fileToDataUri = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export function LicensePlateRecognitionCard({ addAlert }: LicensePlateRecognitionCardProps) {
  const [platePhoto, setPlatePhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<RecognizeLicensePlateOutput | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Webcam / live
  const [isWebcamActive, setIsWebcamActive] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [isLiveDetecting, setIsLiveDetecting] = useState(false);
  const [isLiveProcessing, setIsLiveProcessing] = useState(false); // throttle to avoid overlap
  const videoRef = useRef<HTMLVideoElement>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement>(null);
  const liveTimerRef = useRef<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Webcam on/off
  useEffect(() => {
    let stream: MediaStream | null = null;

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (videoRef.current) (videoRef.current as HTMLVideoElement).srcObject = stream;
        setHasCameraPermission(true);
      } catch (e) {
        console.error('Camera error:', e);
        setHasCameraPermission(false);
        setIsWebcamActive(false);
        toast({
          title: 'Camera Access Denied',
          description: 'Enable camera permissions in your browser settings and try again.',
          variant: 'destructive',
        });
      }
    };

    if (isWebcamActive) start();

    return () => {
      if (liveTimerRef.current) {
        window.clearInterval(liveTimerRef.current);
        liveTimerRef.current = null;
      }
      setIsLiveDetecting(false);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (videoRef.current) (videoRef.current as HTMLVideoElement).srcObject = null;
    };
  }, [isWebcamActive, toast]);

  const getInterestIcon = (isOfInterest?: boolean) =>
    isOfInterest ? <ShieldAlert className="h-5 w-5 text-destructive" /> : <CheckCircle2 className="h-5 w-5 text-green-500" />;

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setPlatePhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(file);
      setResult(null);
      setError(null);
    }
  };

  const runRecognize = async (photoDataUri: string, source: 'upload' | 'live') => {
    const input: RecognizeLicensePlateInput = { photoDataUri };
    const output = await recognizeLicensePlate(input);
    setResult(output);

    toast({
      title: source === 'live' ? 'Live Plate Detection' : 'License Plate Recognition',
      description: output.plateNumber
        ? `Plate: ${output.plateNumber} ${output.isOfInterest ? '— Flagged' : '— Clear'}`
        : 'No plate detected.',
    });

    // Alert severity
    let severity: Alert['severity'] = 'Low';
    if (output.isOfInterest) severity = 'High';

    addAlert({
      id: `lpr-${new Date().toISOString()}`,
      timestamp: new Date().toISOString(),
      type: 'License Plate Recognition',
      severity,
      title: `LPR: ${output.plateNumber || 'N/A'} ${output.isOfInterest ? 'Flagged' : 'Clear'}`,
      description: `Vehicle: ${output.vehicleDetails || 'N/A'}. Country: ${
        output.countryOfOrigin || 'N/A'
      }. ${output.isOfInterest ? `Reason: ${output.reasonForInterest || 'N/A'}. ` : ''}Confidence: ${
        (output.confidenceScore * 100).toFixed(0)
      }%`,
      data: output,
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!platePhoto) {
      setError('Please upload a license plate photo.');
      toast({ title: 'Error', description: 'Please upload a license plate photo.', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const photoDataUri = await fileToDataUri(platePhoto);
      await runRecognize(photoDataUri, 'upload');
    } catch (e: any) {
      setError(e.message || 'An error occurred during license plate recognition.');
      toast({ title: 'LPR Failed', description: e.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  // Live detection loop
  const startLiveDetection = () => {
    if (!videoRef.current || !liveCanvasRef.current) return;
    if (isLiveDetecting) return;
    setIsLiveDetecting(true);

    const canvas = liveCanvasRef.current;
    const ctx = canvas.getContext('2d');

    const tick = async () => {
      if (isLiveProcessing) return; // throttle: wait for previous call to finish
      const video = videoRef.current!;
      if (!ctx || video.readyState < 2) return;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 360;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUri = canvas.toDataURL('image/jpeg');

      try {
        setIsLiveProcessing(true);
        await runRecognize(dataUri, 'live');
      } catch (e) {
        console.error(e);
      } finally {
        setIsLiveProcessing(false);
      }
    };

    // every ~1.8s
    liveTimerRef.current = window.setInterval(tick, 1800);
  };

  const stopLiveDetection = () => {
    if (liveTimerRef.current) {
      window.clearInterval(liveTimerRef.current);
      liveTimerRef.current = null;
    }
    setIsLiveDetecting(false);
  };

  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ScanLine className="h-6 w-6 text-primary" />
            <CardTitle className="font-headline">AI License Plate Recognition</CardTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setIsWebcamActive((v) => !v);
              setResult(null);
              setError(null);
              setIsLiveDetecting(false);
            }}
          >
            <Video className="mr-2 h-4 w-4" />
            {isWebcamActive ? 'Use Image Upload' : 'Use Webcam'}
          </Button>
        </div>
        <CardDescription>Scan license plates via image upload or live webcam feed.</CardDescription>
      </CardHeader>

      {/* ===================== Upload Mode ===================== */}
      {!isWebcamActive && (
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="plate-photo">License Plate Photo</Label>
              <Input
                id="plate-photo"
                type="file"
                accept="image/*"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
              />
            </div>

            {photoPreview && (
              <div className="mt-4 relative w-full h-48 rounded-md overflow-hidden border border-border">
                {/* Next/Image (modern API): use fill + style instead of layout/objectFit */}
                <Image src={photoPreview} alt="License plate preview" fill style={{ objectFit: 'contain' }} />
              </div>
            )}
          </CardContent>

          <CardFooter className="flex flex-col items-stretch space-y-4">
            <Button type="submit" disabled={isLoading || !platePhoto} className="w-full">
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanLine className="mr-2 h-4 w-4" />}
              {isLoading ? 'Scanning Plate...' : 'Recognize Plate'}
            </Button>

            {error && <p className="text-sm text-destructive text-center">{error}</p>}

            {result && (
              <div
                className={`mt-4 p-4 border rounded-md ${
                  result.isOfInterest ? 'border-destructive bg-destructive/10' : 'border-green-500 bg-green-500/10'
                }`}
              >
                <div className="flex items-center space-x-2 mb-2">
                  {getInterestIcon(result.isOfInterest)}
                  <h4 className={`font-semibold text-lg ${result.isOfInterest ? 'text-destructive' : 'text-green-500'}`}>
                    {result.isOfInterest ? 'Of Interest' : 'Clear'}
                  </h4>
                </div>
                <p className="text-sm">
                  <strong className="text-foreground">Plate Number:</strong> {result.plateNumber || 'N/A'}
                </p>
                {result.vehicleDetails && (
                  <p className="text-sm">
                    <strong className="text-foreground">Vehicle:</strong> {result.vehicleDetails}
                  </p>
                )}
                {result.countryOfOrigin && (
                  <p className="text-sm">
                    <strong className="text-foreground">Country:</strong> {result.countryOfOrigin}
                  </p>
                )}
                {result.isOfInterest && result.reasonForInterest && (
                  <p className="text-sm">
                    <strong className="text-foreground">Reason:</strong> {result.reasonForInterest}
                  </p>
                )}
                <p className="text-sm">
                  <strong className="text-foreground">Confidence:</strong>{' '}
                  {(result.confidenceScore * 100).toFixed(0)}%
                </p>
              </div>
            )}
          </CardFooter>
        </form>
      )}

      {/* ===================== Webcam / Live Mode ===================== */}
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
              {hasCameraPermission === false && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <p className="text-white">Camera permission denied</p>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              {!isLiveDetecting ? (
                <Button type="button" onClick={startLiveDetection} disabled={!hasCameraPermission} className="w-full">
                  {isLiveProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Video className="mr-2 h-4 w-4" />}
                  {isLiveProcessing ? 'Starting…' : 'Start Live Detection'}
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
              <div
                className={`mt-2 p-4 border rounded-md ${
                  result.isOfInterest ? 'border-destructive bg-destructive/10' : 'border-green-500 bg-green-500/10'
                }`}
              >
                <div className="flex items-center space-x-2 mb-2">
                  {getInterestIcon(result.isOfInterest)}
                  <h4 className={`font-semibold text-lg ${result.isOfInterest ? 'text-destructive' : 'text-green-500'}`}>
                    {result.isOfInterest ? 'Of Interest' : 'Clear'}
                  </h4>
                </div>
                <p className="text-sm">
                  <strong className="text-foreground">Plate Number:</strong> {result.plateNumber || 'N/A'}
                </p>
                {result.vehicleDetails && (
                  <p className="text-sm">
                    <strong className="text-foreground">Vehicle:</strong> {result.vehicleDetails}
                  </p>
                )}
                {result.countryOfOrigin && (
                  <p className="text-sm">
                    <strong className="text-foreground">Country:</strong> {result.countryOfOrigin}
                  </p>
                )}
                {result.isOfInterest && result.reasonForInterest && (
                  <p className="text-sm">
                    <strong className="text-foreground">Reason:</strong> {result.reasonForInterest}
                  </p>
                )}
                <p className="text-sm">
                  <strong className="text-foreground">Confidence:</strong>{' '}
                  {(result.confidenceScore * 100).toFixed(0)}%
                </p>
              </div>
            )}
          </CardFooter>
        </>
      )}
    </Card>
  );
}
