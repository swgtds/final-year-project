export interface Alert {
  id: string;
  timestamp: string; // ISO string
  type:
    | 'Object Detection'
    | 'License Plate Recognition'
    | 'Intruder Surveillance';
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  title: string;
  description: string;
  data?: any; 
}
