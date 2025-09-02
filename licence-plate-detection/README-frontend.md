# Frontend (Vite + React + Tailwind)


1. Create the folder `frontend` in your project root and copy the files from this template.


2. Install dependencies:


```bash
cd frontend
npm install
```


3. Start dev server:


```bash
npm run dev
```


4. The UI uses localStorage keys: `BW_MALICIOUS_PLATES` and `BW_DETECTIONS`.
To switch to a real database later, replace the functions in `src/services/storage.js` with fetch calls to your backend API.


5. To integrate Gemini API for extracting text from images, replace the mock detection in `AdminPanel.jsx` with a call to your server endpoint that calls Gemini. Add your `GOOGLE_AI_API_KEY` to `.env` (see root README in the original repo for where the key goes).

