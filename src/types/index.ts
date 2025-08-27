export interface Alert {
  id: string;
  timestamp: string; // ISO string
  type: 'Object Detection' | 'Threat Identification' | 'License Plate Recognition';
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  title: string;
  description: string;
  data?: any; 
}
