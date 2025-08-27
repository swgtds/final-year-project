'use server';
/**
 * @fileOverview Recognizes license plates from images and checks against watchlists.
 *
 * - recognizeLicensePlate - A function that handles license plate recognition.
 * - RecognizeLicensePlateInput - The input type for the recognizeLicensePlate function.
 * - RecognizeLicensePlateOutput - The return type for the recognizeLicensePlate function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const RecognizeLicensePlateInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "A photo of a vehicle's license plate, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type RecognizeLicensePlateInput = z.infer<typeof RecognizeLicensePlateInputSchema>;

const RecognizeLicensePlateOutputSchema = z.object({
  plateNumber: z.string().describe('The extracted license plate number. Should be as accurate as possible.'),
  vehicleDetails: z.string().optional().describe('Brief details about the vehicle if identifiable from the image (e.g., make, model, color). This should be supplemented by watchlist info if available and relevant.'),
  countryOfOrigin: z.string().optional().describe('The suspected country of origin of the license plate based on its format or context clues in the image.'),
  isOfInterest: z.boolean().describe('Whether the license plate or vehicle is on a watchlist or considered of interest based on tool lookup.'),
  reasonForInterest: z.string().optional().describe('Reason if the plate/vehicle is of interest, primarily from the watchlist tool.'),
  confidenceScore: z.number().min(0).max(1).describe('Confidence score for the license plate *number extraction* (0 to 1).'),
});
export type RecognizeLicensePlateOutput = z.infer<typeof RecognizeLicensePlateOutputSchema>;


// Mock Tool: Check License Plate Watchlist
const checkLicensePlateWatchlistTool = ai.defineTool(
  {
    name: 'checkLicensePlateWatchlistTool',
    description: 'Checks a given license plate number against a database of vehicles/plates of interest (e.g., stolen, linked to smuggling, wanted individuals).',
    inputSchema: z.object({
      plateNumber: z.string().describe('The license plate number to check.'),
    }),
    outputSchema: z.object({
      isOnWatchlist: z.boolean().describe('True if the plate is found on a watchlist, false otherwise.'),
      reason: z.string().optional().describe('Reason for being on the watchlist, if applicable.'),
      associatedVehicleDetails: z.string().optional().describe('Additional vehicle details from the watchlist record, if any (e.g. "Red Ford F-150, reported missing").'),
    }),
  },
  async (input) => {
    // Mock implementation
    const plate = input.plateNumber.toUpperCase();
    if (plate === 'DANGER1' || plate === 'AKH-123B') {
      return {
        isOnWatchlist: true,
        reason: 'Vehicle reported stolen.',
        associatedVehicleDetails: 'Red Toyota Camry 2022 (Matches plate DANGER1)',
      };
    }
    if (plate.startsWith('WANTED')) {
      return {
        isOnWatchlist: true,
        reason: 'Plate linked to ongoing investigation.',
        associatedVehicleDetails: 'Unknown make/model, but plate flagged for surveillance.',
      }
    }
    // Default: not on watchlist
    return {
      isOnWatchlist: false,
      reason: 'Plate not found on current watchlists.',
    };
  }
);


export async function recognizeLicensePlate(input: RecognizeLicensePlateInput): Promise<RecognizeLicensePlateOutput> {
  return recognizeLicensePlateFlow(input);
}

const prompt = ai.definePrompt({
  name: 'recognizeLicensePlatePrompt',
  input: {schema: RecognizeLicensePlateInputSchema},
  output: {schema: RecognizeLicensePlateOutputSchema},
  tools: [checkLicensePlateWatchlistTool],
  prompt: `You are an AI system for advanced border security, specializing in license plate recognition and vehicle screening.

Task:
1.  Analyze the provided image of a vehicle's license plate: {{media url=photoDataUri}}.
2.  Accurately extract the license plate number ('plateNumber'). Provide a 'confidenceScore' (0.0 to 1.0) for this *extraction*.
3.  From the image, attempt to identify the vehicle's make, model, and color ('vehicleDetails'), and the license plate's likely country of origin ('countryOfOrigin').
4.  Take the extracted 'plateNumber' and use the 'checkLicensePlateWatchlistTool' to check it against known watchlists.
5.  Based *only* on the 'checkLicensePlateWatchlistTool' output, set 'isOfInterest' (true if tool says isOnWatchlist, false otherwise).
6.  If the tool indicates the plate is of interest, use its 'reason' and 'associatedVehicleDetails' to populate 'reasonForInterest' and supplement 'vehicleDetails' respectively. If the tool provides vehicle details, prioritize them or merge them intelligently with what you observed from the image.

Output Format:
Ensure your response strictly adheres to the JSON schema for 'RecognizeLicensePlateOutputSchema'.
- 'plateNumber': string (extracted from image)
- 'vehicleDetails': string (optional, from image, potentially enhanced by tool)
- 'countryOfOrigin': string (optional, from image)
- 'isOfInterest': boolean (from tool output)
- 'reasonForInterest': string (optional, from tool output)
- 'confidenceScore': number (0.0-1.0, for plate number extraction accuracy from image)
`,
});

const recognizeLicensePlateFlow = ai.defineFlow(
  {
    name: 'recognizeLicensePlateFlow',
    inputSchema: RecognizeLicensePlateInputSchema,
    outputSchema: RecognizeLicensePlateOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    if (!output) {
      throw new Error('AI failed to provide an output for license plate recognition.');
    }
    // Ensure confidence score is set, default to 0.7 if not provided by LLM.
    if (output.confidenceScore === undefined) {
        output.confidenceScore = 0.7; 
    }
    return output;
  }
);
