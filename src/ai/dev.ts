import { config } from 'dotenv';
config();

import '@/ai/flows/detect-objects.ts';
import '@/ai/flows/recognize-license-plate.ts';
import '@/ai/flows/intruder-detection.ts';
