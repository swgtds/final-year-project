import { openAICompatible } from '@genkit-ai/compat-oai';
import { genkit } from 'genkit';

/** OpenRouter model id, e.g. google/gemma-3-27b-it or google/gemma-4-31b-it:free */
const openRouterModelId =
  process.env.OPENROUTER_MODEL ?? 'google/gemma-3-27b-it';

export const ai = genkit({
  plugins: [
    openAICompatible({
      name: 'openrouter',
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer':
          process.env.OPENROUTER_HTTP_REFERER ?? 'http://localhost:3000',
        'X-Title': process.env.OPENROUTER_APP_TITLE ?? 'Border Watch AI',
      },
    }),
  ],
  model: `openrouter/${openRouterModelId}`,
});
