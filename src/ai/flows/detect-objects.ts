'use server';

/**
 * @fileOverview Detects weapons or illegal goods inside vehicles using AI-powered image analysis.
 *
 * - detectObjects - A function that handles the object detection process.
 * - DetectObjectsInput - The input type for the detectObjects function.
 * - DetectObjectsOutput - The return type for the detectObjects function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const DetectObjectsInputSchema = z.object({
  vehiclePhotoDataUri: z
    .string()
    .describe(
      "A photo of the vehicle's interior, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
  environmentalConditions: z
    .string()
    .describe('The environmental conditions, such as low light.'),
});
export type DetectObjectsInput = z.infer<typeof DetectObjectsInputSchema>;

const DetectObjectsOutputSchema = z.object({
  objectsDetected: z
    .array(z.string())
    .describe('A list of objects detected inside the vehicle.'),
  threatLevel: z
    .string()
    .describe(
      'The threat level associated with the detected objects (e.g., low, medium, high).'
    ),
  confidenceScore: z
    .number()
    .describe('The confidence score of the object detection (0 to 1).'),
});
export type DetectObjectsOutput = z.infer<typeof DetectObjectsOutputSchema>;

export async function detectObjects(input: DetectObjectsInput): Promise<DetectObjectsOutput> {
  return detectObjectsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'detectObjectsPrompt',
  input: {schema: DetectObjectsInputSchema},
  output: {schema: DetectObjectsOutputSchema},
  prompt: `You are an AI specializing in detecting illegal objects within vehicles at border checkpoints. Given an image and environmental conditions, identify any weapons, contraband, or other illegal items.  Assess the threat level and provide a confidence score for your detection.

Environmental Conditions: {{{environmentalConditions}}}
Vehicle Interior Photo: {{media url=vehiclePhotoDataUri}}

Objects Detected:`, // The LLM will continue from here with the list of detected objects
});

const detectObjectsFlow = ai.defineFlow(
  {
    name: 'detectObjectsFlow',
    inputSchema: DetectObjectsInputSchema,
    outputSchema: DetectObjectsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
