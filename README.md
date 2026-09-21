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

## Phase 6 - DevOps and CI/CD

Phase 6 adds GitHub-based collaboration and automated validation. The existing application architecture is unchanged.

### Branching strategy

- `main`: stable, reviewed code suitable for demonstration or release.
- `develop`: shared integration branch for completed feature work.
- `feature/*`: short-lived branches for individual tasks.
- Pull Requests: feature branches are reviewed and checked by GitHub Actions before merging into `develop`. Reviewed `develop` changes can then be merged into `main`.

Workflow:

```text
Developer
	|
Feature Branch
	|
Commit
	|
Push
	|
Pull Request
	|
GitHub Actions
	|
Tests + Build + Docker
	|
Code Review
	|
Merge
```

### GitHub Actions

The workflow at `.github/workflows/ci.yml` runs for pushes to `main` and `develop`, and for Pull Requests targeting either branch. It runs three independent jobs:

1. Backend Jest/Supertest tests using mocked model operations, so CI does not use or modify a real MongoDB database.
2. Frontend dependency installation and `npm run build`.
3. Docker Compose image build using the existing Phase 5 Dockerfiles and configuration. Images are not pushed or deployed.

The workflow fails when a test, frontend build, or Docker build fails. CI uses Node.js 22 and `npm ci` with the committed lockfiles.

### Team workflow

Four team members can work independently using task branches such as:

- Member 1: `feature/frontend`
- Member 2: `feature/backend`
- Member 3: `feature/devops`
- Member 4: `feature/testing`

The branch names describe work areas and do not hard-code team member names.

### Feature branch commands

```powershell
git checkout develop
git pull origin develop
git checkout -b feature/your-task

git add .
git commit -m "description"
git push -u origin feature/your-task
```

After pushing, create a Pull Request on GitHub from `feature/your-task` into `develop`. Wait for GitHub Actions and code review before merging.

### Local Phase 6 checks

Backend tests:

```powershell
cd backend
npm ci
npm test
```

Frontend build:

```powershell
cd frontend
npm ci
npm run build
```

Docker build:

```powershell
cd C:\cloud-scalable-web-app
docker compose config --quiet
docker compose build
```

No real secrets are stored in tracked files. Use local `.env` files or GitHub Actions secrets for sensitive values; `.env.example` files contain placeholders only.
