# Final Year Project - Border Watch-AI

The B.Tech Final Boss

---

## 📦 Prerequisites

* [Node.js](https://nodejs.org/) (v18 or above recommended)
* [Git](https://git-scm.com/)

---

## 🔽 Clone the Repository

```bash
git clone https://github.com/swgtds/final-year-project
cd final-year-project
```

---

## 📥 Install Dependencies

```bash
npm install
```

(or if you prefer Yarn)

```bash
yarn install
```

---

## Add your OpenRouter API key in a `.env` file in the project root:

The app uses [OpenRouter](https://openrouter.ai/) with a **Gemma** model (OpenAI-compatible API). Create a key at OpenRouter, then set:

```bash
OPENROUTER_API_KEY=<your_openrouter_key>
```

Optional:

```bash
# Defaults to google/gemma-3-27b-it; use any OpenRouter model id (e.g. google/gemma-4-31b-it:free)
OPENROUTER_MODEL=google/gemma-3-27b-it
# Recommended by OpenRouter for rankings (your site or repo URL)
OPENROUTER_HTTP_REFERER=https://github.com/your-org/your-repo
OPENROUTER_APP_TITLE=Border Watch AI
```

## ▶️ Run the Development Server

```bash
npm run dev
```

(or with Yarn)

```bash
yarn dev
```

Now open 👉 [http://localhost:3000](http://localhost:3000) in your browser to see the app running.

---

## 🏗️ Build for Production

```bash
npm run build
npm run start
```

This will create an optimized production build and start the server.

---

## 🧪 Run Linting (Optional)

```bash
npm run lint
```

---

## 📝 License

This project is licensed under the **MIT License**.
