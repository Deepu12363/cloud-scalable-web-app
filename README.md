# Cloud-Based Scalable Web Application Infrastructure

Phase 1 provides a basic React frontend and Node.js + Express backend foundation.

## Project structure

- `frontend/`: React application created with Vite
- `backend/`: Express API server

## Requirements

- Node.js 18 or newer
- npm

## Start the backend

```powershell
cd backend
npm install
npm run dev
```

The backend runs on `http://localhost:5000`.

Health check: `http://localhost:5000/api/health`

## Start the frontend

Open a second PowerShell terminal:

```powershell
cd frontend
npm install
npm run dev
```

The frontend runs on the normal Vite development port shown in the terminal, usually `http://localhost:5173`.
