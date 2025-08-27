import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

export const ai = genkit({
  plugins: [googleAI({ apiKey: "AIzaSyBzGxQbCU7fQn80IyV7S4EryEL8fvSsdvA" })],
  model: 'googleai/gemini-2.0-flash',
});
