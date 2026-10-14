# Decide For Me — Hyper-Rational Decision Assistant

A hyper-rational decision assistant designed for chronically indecisive individuals facing major life choices (relocating, career transitions, choosing hobbies, investing capital).

The application evaluates dilemmas by weighting options against the user's declared core life priorities, delivering an authoritative verdict, rigorous axiomatic justification, and an immediate first step.

---

## Key Features

- **Dilemma Evaluation Dock**: Compare Option A and Option B through a structured decision interface.
- **Persistent User Priorities (Firestore)**:
  - Priorities stored in Firestore at `users/{userId}` with real-time listener synchronization.
  - Interactive editing mode allowing users to update their life priorities on the fly.
  - Secured with zero-trust Firestore Security Rules.
- **Dual Inference Backends**:
  1. **Agent Platform (Firebase AI Logic)**: Calls the Firebase AI Logic SDK (`firebase/ai`) using a `TemplateGenerativeModel` configured with the `decider-flow` server prompt template and `AgentPlatformBackend`.
  2. **Ollama (Local Inference)**: Runs completely offline on your local machine using Ollama (supports `llama3.2`, `llama3`, `mistral`, `gemma2`, etc.) with automatic model detection and connection diagnostics.
- **Structured 3-Field Output**:
  - **Verdict**: Decisive, calibrated recommendation.
  - **Axiomatic Justification**: Objective utility vector analysis grounded in declared priorities.
  - **First Step**: A concrete, immediate action item to break decision paralysis.
- **Authentication & Security**:
  - Firebase Authentication with Google Sign-In.
  - Firebase App Check debug mode integration with built-in token diagnostics and manual token registration tools.

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Tailwind CSS v4, Lucide React icons
- **Cloud & AI**:
  - Firebase JS SDK 11+ (Auth, Firestore, App Check)
  - Firebase AI Logic (`firebase/ai`) with `AgentPlatformBackend`
  - Local Ollama REST API (`/api/generate` & `/api/tags`)

---

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [npm](https://www.npmjs.com/) or [bun](https://bun.sh/)
- *(Optional for Local AI)* [Ollama](https://ollama.ai/) installed on your system

---

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/<your-username>/decide-for-me.git
cd decide-for-me
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start the Development Server

```bash
npm run dev
```

The app will start on `http://localhost:3000`.

---

## Running with Local Ollama

To use the local AI engine without cloud dependencies:

1. **Install and Start Ollama**:
   ```bash
   ollama serve
   ```
   *Note: If running in a browser that enforces cross-origin restrictions, enable CORS with:*
   ```bash
   OLLAMA_ORIGINS="*" ollama serve
   ```

2. **Pull a Model** (e.g., Llama 3.2):
   ```bash
   ollama pull llama3.2
   ```

3. **In the Decide For Me Web UI**:
   - Toggle the engine selector in the top-right header to **Ollama Local**.
   - Open settings (slider icon) and click **Test Connection** to detect available local models.
   - Enter your dilemma and click **Decide For Me**.

---

## Running with Firebase & Agent Platform

1. The app connects to the configured Firebase project in `firebase-applet-config.json`.
2. When testing in development with App Check enabled:
   - Copy the **Active Debug Token** displayed in the diagnostic error card.
   - Register it in the [Firebase Console](https://console.firebase.google.com/):
     `Project Settings` → `App Check` → `Apps` → select web app → `Manage debug tokens` → `Add debug token`.
   - Click **Retry Decision** in the app.

---

## Building for Production

```bash
# Type check and build bundle
npm run build

# Preview production build locally
npm run preview
```

---

## Pushing to GitHub

To push this codebase to your GitHub account:

```bash
# 1. Initialize git and commit files
git init
git add .
git commit -m "Initial commit: Decide For Me application with Firebase AI Logic and Ollama"

# 2. Add your GitHub repository as remote
git remote add origin https://github.com/<your-username>/<your-repo-name>.git

# 3. Rename branch to main and push
git branch -M main
git push -u origin main
```

---

## License

Apache-2.0
