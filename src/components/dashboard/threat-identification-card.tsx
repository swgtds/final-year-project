'use client';

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { identifyThreat, ThreatIdentificationInput, ThreatIdentificationOutput } from '@/ai/flows/identify-threats';
import type { Alert } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ScanFace, UserCheck, UserX, Loader2, Video, Camera, UploadCloud, AlertCircle } from 'lucide-react';
import { Alert as ShadcnAlert, AlertTitle, AlertDescription } from '@/components/ui/alert'; 

const fileToDataUri = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export function ThreatIdentificationCard({ addAlert }: { addAlert: (alert: Alert) => void }) {
  const [faceScanFile, setFaceScanFile] = useState<File | null>(null);
  const [scanPreview, setScanPreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ThreatIdentificationOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [isWebcamActive, setIsWebcamActive] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    let streamInstance: MediaStream | null = null;
    if (isWebcamActive) {
      const getCameraPermission = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          streamInstance = stream;
          setHasCameraPermission(true);
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
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
      getCameraPermission();
    }
    
    return () => {
      if (streamInstance) {
        streamInstance.getTracks().forEach(track => track.stop());
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
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

  const processImageForAnalysis = async (imageDataUri: string) => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const input: ThreatIdentificationInput = { photoDataUri: imageDataUri };
      const output = await identifyThreat(input);
      setResult(output);
      toast({ 
        title: 'Threat Identification Complete', 
        description: `${output.isThreat ? `Threat Identified: ${output.name || 'Unknown'}` : 'No immediate threat identified.'} Confidence: ${((output.confidenceScore || 0) * 100).toFixed(0)}%`,
        variant: output.isThreat ? 'destructive' : 'default',
      });
      
      if (output.isThreat) {
        addAlert({
          id: `ti-${new Date().toISOString()}`,
          timestamp: new Date().toISOString(),
          type: 'Threat Identification',
          severity: 'Critical', // Default to critical, could be adjusted by specific reasons
          title: `Potential Threat: ${output.name || 'Unknown'}`,
          description: `${output.reason || 'Matches person of interest criteria.'} Confidence: ${((output.confidenceScore || 0) * 100).toFixed(0)}%`,
          data: output,
        });
      } else {
         addAlert({
          id: `ti-${new Date().toISOString()}`,
          timestamp: new Date().toISOString(),
          type: 'Threat Identification',
          severity: 'Low',
          title: `Individual Cleared: ${output.name || 'Unknown'}`,
          description: `${output.reason || 'No threat indicators found.'} Confidence: ${((output.confidenceScore || 0) * 100).toFixed(0)}%`,
          data: output,
        });
      }
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
    await processImageForAnalysis(photoDataUri);
  };

  const handleCaptureFromWebcam = async () => {
    if (!videoRef.current || !canvasRef.current || !hasCameraPermission) {
      toast({ title: 'Error', description: 'Webcam not ready or permission denied.', variant: 'destructive' });
      return;
    }
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (context) {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const photoDataUri = canvas.toDataURL('image/jpeg');
      setScanPreview(photoDataUri); 
      await processImageForAnalysis(photoDataUri);
    } else {
       toast({ title: 'Error', description: 'Could not capture image from webcam.', variant: 'destructive' });
    }
  };

  const toggleWebcamMode = () => {
    setIsWebcamActive(!isWebcamActive);
    setScanPreview(null);
    setFaceScanFile(null);
    setResult(null);
    setError(null);
    setHasCameraPermission(null); // Reset permission status on mode toggle
    if (fileInputRef.current) {
        fileInputRef.current.value = ""; 
    }
  };

  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
      <CardHeader>
        <div className="flex items-center space-x-2">
          <ScanFace className="h-6 w-6 text-primary" />
          <CardTitle className="font-headline">AI Threat Identification</CardTitle>
        </div>
        <CardDescription>Cross-reference facial scans against a known persons of interest database.</CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={toggleWebcamMode}>
            {isWebcamActive ? <UploadCloud className="mr-2 h-4 w-4" /> : <Video className="mr-2 h-4 w-4" />}
            {isWebcamActive ? 'Use File Upload' : 'Use Webcam'}
          </Button>
        </div>

        {!isWebcamActive && (
          <form onSubmit={handleFileUploadSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="face-scan-file">Facial Scan File</Label>
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
                <Image src={scanPreview} alt="Face scan preview" layout="fill" objectFit="cover" data-ai-hint="face portrait" />
              </div>
            )}
            <Button type="submit" disabled={isLoading || !faceScanFile} className="w-full">
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanFace className="mr-2 h-4 w-4" />}
              {isLoading ? 'Analyzing File...' : 'Analyze Uploaded Image'}
            </Button>
          </form>
        )}

        {isWebcamActive && (
          <div className="space-y-4">
            <div className="relative w-full aspect-video bg-muted rounded-md overflow-hidden border border-border">
              <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline muted />
              <canvas ref={canvasRef} className="hidden"></canvas>
              {hasCameraPermission === null && !videoRef.current?.srcObject && ( // Loading state for camera permission
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <Loader2 className="h-8 w-8 text-white animate-spin" />
                  <p className="text-white ml-2">Requesting camera...</p>
                </div>
              )}
            </div>
             {scanPreview && !isLoading && ( 
              <div className="mt-4 relative w-full h-48 rounded-md overflow-hidden border border-border">
                <Image src={scanPreview} alt="Webcam capture preview" layout="fill" objectFit="cover" data-ai-hint="face portrait" />
              </div>
            )}
            {hasCameraPermission === false && ( // Explicit permission denied message
                <ShadcnAlert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Camera Access Required</AlertTitle>
                  <AlertDescription>
                    Camera access was denied. Please enable it in your browser settings and refresh the page or try toggling webcam mode again.
                  </AlertDescription>
                </ShadcnAlert>
              )}
            <Button onClick={handleCaptureFromWebcam} disabled={isLoading || !hasCameraPermission} className="w-full">
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
              {isLoading ? 'Analyzing Webcam...' : 'Capture & Analyze'}
            </Button>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex flex-col items-stretch space-y-4 pt-0">
        {error && <p className="text-sm text-destructive text-center">{error}</p>}
        {result && (
          <div className={`mt-4 p-4 border rounded-md ${result.isThreat ? 'border-destructive bg-destructive/10' : 'border-green-500 bg-green-500/10'}`}>
            <div className="flex items-center space-x-2">
              {result.isThreat ? <UserX className="h-6 w-6 text-destructive" /> : <UserCheck className="h-6 w-6 text-green-500" />}
              <h4 className={`font-semibold text-lg ${result.isThreat ? 'text-destructive' : 'text-green-500'}`}>
                {result.isThreat ? 'Potential Threat Identified' : 'No Threat Identified'}
              </h4>
            </div>
            {result.name && <p className="text-sm"><strong className="text-foreground">Name:</strong> {result.name}</p>}
            {result.isThreat && result.reason && (
              <p className="text-sm"><strong className="text-foreground">Reason:</strong> {result.reason}</p>
            )}
            {!result.isThreat && result.reason && (
              <p className="text-sm"><strong className="text-foreground">Assessment:</strong> {result.reason}</p>
            )}
             <p className="text-sm"><strong className="text-foreground">Confidence:</strong> {((result.confidenceScore || 0) * 100).toFixed(0)}%</p>
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
