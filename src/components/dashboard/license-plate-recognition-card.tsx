'use client';

import React, { useState, useRef } from 'react';
import Image from 'next/image';
import { recognizeLicensePlate, RecognizeLicensePlateInput, RecognizeLicensePlateOutput } from '@/ai/flows/recognize-license-plate';
import type { Alert } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ScanLine, Loader2, AlertTriangle, ShieldAlert, CheckCircle2, Info } from 'lucide-react';

interface LicensePlateRecognitionCardProps {
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

export function LicensePlateRecognitionCard({ addAlert }: LicensePlateRecognitionCardProps) {
  const [platePhoto, setPlatePhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<RecognizeLicensePlateOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setPlatePhoto(file);
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
      const input: RecognizeLicensePlateInput = { photoDataUri };
      const output = await recognizeLicensePlate(input);
      setResult(output);
      toast({ title: 'License Plate Recognition Successful', description: `Plate: ${output.plateNumber} ${output.isOfInterest ? '- Flagged as Of Interest' : '- Clear'}` });

      let severity: Alert['severity'] = 'Low';
      if (output.isOfInterest) {
        severity = 'High'; // Or Critical depending on reason
      }
      
      addAlert({
        id: `lpr-${new Date().toISOString()}`,
        timestamp: new Date().toISOString(),
        type: 'License Plate Recognition',
        severity,
        title: `LPR: ${output.plateNumber} ${output.isOfInterest ? 'Flagged' : 'Clear'}`,
        description: `Vehicle: ${output.vehicleDetails || 'N/A'}. Country: ${output.countryOfOrigin || 'N/A'}. ${output.isOfInterest ? `Reason: ${output.reasonForInterest}` : ''} Confidence: ${(output.confidenceScore * 100).toFixed(0)}%`,
        data: output,
      });

    } catch (e: any) {
      setError(e.message || 'An error occurred during license plate recognition.');
      toast({ title: 'LPR Failed', description: e.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };
  
  const getInterestIcon = (isOfInterest?: boolean) => {
    if (isOfInterest === undefined) return <Info className="h-5 w-5 text-blue-500" />;
    return isOfInterest ? <ShieldAlert className="h-5 w-5 text-destructive" /> : <CheckCircle2 className="h-5 w-5 text-green-500" />;
  };


  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
      <CardHeader>
        <div className="flex items-center space-x-2">
          <ScanLine className="h-6 w-6 text-primary" />
          <CardTitle className="font-headline">AI License Plate Recognition</CardTitle>
        </div>
        <CardDescription>Scan license plates and check against watchlists.</CardDescription>
      </CardHeader>
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
              <Image src={photoPreview} alt="License plate preview" layout="fill" objectFit="contain" data-ai-hint="license plate" />
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-col items-stretch space-y-4">
          <Button type="submit" disabled={isLoading || !platePhoto} className="w-full">
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ScanLine className="mr-2 h-4 w-4" />
            )}
            {isLoading ? 'Scanning Plate...' : 'Recognize Plate'}
          </Button>
          {error && <p className="text-sm text-destructive text-center">{error}</p>}
          {result && (
            <div className={`mt-4 p-4 border rounded-md ${result.isOfInterest ? 'border-destructive bg-destructive/10' : 'border-green-500 bg-green-500/10'}`}>
              <div className="flex items-center space-x-2 mb-2">
                {getInterestIcon(result.isOfInterest)}
                <h4 className={`font-semibold text-lg ${result.isOfInterest ? 'text-destructive' : 'text-green-500'}`}>
                  {result.isOfInterest ? 'Of Interest' : 'Clear'}
                </h4>
              </div>
              <p className="text-sm"><strong className="text-foreground">Plate Number:</strong> {result.plateNumber}</p>
              {result.vehicleDetails && <p className="text-sm"><strong className="text-foreground">Vehicle:</strong> {result.vehicleDetails}</p>}
              {result.countryOfOrigin && <p className="text-sm"><strong className="text-foreground">Country:</strong> {result.countryOfOrigin}</p>}
              {result.isOfInterest && result.reasonForInterest && (
                <p className="text-sm"><strong className="text-foreground">Reason:</strong> {result.reasonForInterest}</p>
              )}
              <p className="text-sm"><strong className="text-foreground">Confidence:</strong> {(result.confidenceScore * 100).toFixed(0)}%</p>
            </div>
          )}
        </CardFooter>
      </form>
    </Card>
  );
}
