'use client';

import React, { useState, useRef } from 'react';
import Image from 'next/image';
import { detectObjects, DetectObjectsInput, DetectObjectsOutput } from '@/ai/flows/detect-objects';
import type { Alert } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Camera, Car, Loader2, AlertTriangle, Info, ShieldAlert, CheckCircle2 } from 'lucide-react';

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

export function ObjectDetectionCard({ addAlert }: ObjectDetectionCardProps) {
  const [vehiclePhoto, setVehiclePhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [environmentalConditions, setEnvironmentalConditions] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<DetectObjectsOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setVehiclePhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      setResult(null); // Clear previous results
      setError(null);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!vehiclePhoto) {
      setError('Please upload a vehicle photo.');
      toast({ title: 'Error', description: 'Please upload a vehicle photo.', variant: 'destructive' });
      return;
    }
    if (!environmentalConditions.trim()) {
      setError('Please describe environmental conditions.');
      toast({ title: 'Error', description: 'Please describe environmental conditions.', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const vehiclePhotoDataUri = await fileToDataUri(vehiclePhoto);
      const input: DetectObjectsInput = { vehiclePhotoDataUri, environmentalConditions };
      const output = await detectObjects(input);
      setResult(output);
      toast({ title: 'Object Detection Successful', description: `${output.objectsDetected.length > 0 ? output.objectsDetected.join(', ') : 'No objects'} detected.` });

      let severity: Alert['severity'] = 'Low';
      if (output.threatLevel.toLowerCase() === 'high') severity = 'High';
      else if (output.threatLevel.toLowerCase() === 'medium') severity = 'Medium';
      else if (output.threatLevel.toLowerCase() === 'critical') severity = 'Critical';
      
      addAlert({
        id: `od-${new Date().toISOString()}`,
        timestamp: new Date().toISOString(),
        type: 'Object Detection',
        severity,
        title: `Vehicle Scan: ${output.threatLevel} Threat`,
        description: `Detected: ${output.objectsDetected.join(', ') || 'None'}. Confidence: ${(output.confidenceScore * 100).toFixed(0)}%`,
        data: output,
      });

    } catch (e: any) {
      setError(e.message || 'An error occurred during object detection.');
      toast({ title: 'Object Detection Failed', description: e.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const getThreatIcon = (level: string | undefined) => {
    if (!level) return <Info className="h-5 w-5 text-blue-500" />;
    switch (level.toLowerCase()) {
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
        <div className="flex items-center space-x-2">
          <Car className="h-6 w-6 text-primary" />
          <CardTitle className="font-headline">AI Object Detection</CardTitle>
        </div>
        <CardDescription>Scan vehicle interiors for weapons or contraband, even in low light.</CardDescription>
      </CardHeader>
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
              <Image src={photoPreview} alt="Vehicle preview" layout="fill" objectFit="cover" data-ai-hint="vehicle interior" />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="environmental-conditions">Environmental Conditions</Label>
            <Textarea
              id="environmental-conditions"
              placeholder="e.g., low light, foggy, night vision"
              value={environmentalConditions}
              onChange={(e) => setEnvironmentalConditions(e.target.value)}
              rows={3}
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col items-stretch space-y-4">
          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Camera className="mr-2 h-4 w-4" />
            )}
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
    </Card>
  );
}
