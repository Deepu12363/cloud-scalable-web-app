# Cloud-Based Scalable Web Application Infrastructure

This capstone runs a React frontend and Express API behind Nginx, with three backend replicas sharing MongoDB. It includes user authentication and a software-only IoT telemetry path that can be exercised with simulated temperature and humidity readings before physical hardware is available.

## Project structure

- `frontend/`: React application created with Vite
- `backend/`: Express API server
- `nginx/`: Nginx reverse proxy and API load balancer
- `monitoring/`: Prometheus scrape configuration and Grafana provisioning/dashboard
- `docker-compose.yml`: local MongoDB, three backend replicas, frontend, Nginx, Prometheus, and Grafana
- `.github/workflows/`: backend tests, frontend build, and Docker validation

## Local container architecture

```text
Browser / simulator
        |
  Nginx :8081
    /api/  \ other paths
      |       |
  backend1-3  React frontend
      |  ^
      |  +--- scrape /metrics --- Prometheus :9090 -> Grafana :3000
      |
   MongoDB
```

All backends use the same source, MongoDB database, and JWT secret. API traffic is load-balanced across the three replicas. Backend and MongoDB ports are not published on the host; use Nginx at `http://localhost:8081`.

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

## IoT telemetry milestone

The backend supports authenticated device provisioning and HTTP telemetry using the existing MongoDB connection. The data flow is:

```text
Local simulator (sample values) -> Nginx -> one of three Express backends -> MongoDB
                                                  ^
React client -> Nginx -> owner-protected device and history APIs
```

The simulator generates clearly labeled sample readings; no physical sensor is required. The authenticated dashboard lets each account register multiple devices and view only its own device list, latest readings, and paginated telemetry history.

### Device and telemetry endpoints

- `POST /api/devices` — register a device with a user JWT. The response includes a random device secret once; save it securely because it cannot be retrieved later.
- `GET /api/devices` — list only the authenticated user's devices. Device-secret hashes are never returned.
- `POST /api/telemetry` — submit a reading with `X-Device-ID` and `X-Device-Secret` headers. Device credentials are independent of user JWTs.
- `GET /api/telemetry/latest/:deviceId` — retrieve the latest reading for a device owned by the authenticated user.
- `GET /api/telemetry/history/:deviceId?page=1&limit=50` — retrieve paginated readings for an owned device. `limit` is restricted to 1–100.

Telemetry submissions require a UTC timestamp in `YYYY-MM-DDTHH:mm:ss.sssZ` format, finite numeric measurements, and a non-negative integer sequence strictly greater than the previous accepted sequence for that device. Sequence reservations are atomic in MongoDB so requests handled by different backend replicas cannot accept an older sequence after a newer one. Defaults accept temperatures from -40 to 80 °C and humidity from 0 to 100 percent. The `MIN_TEMPERATURE_C`, `MAX_TEMPERATURE_C`, `MIN_HUMIDITY_PERCENT`, and `MAX_HUMIDITY_PERCENT` environment variables configure these bounds; Compose passes them consistently to all three backend replicas. `receivedAt` records server receipt time separately from the device timestamp.

MongoDB enforces a unique `(deviceId, sequence)` index in addition to the per-device increasing-sequence check. A duplicate or out-of-order sequence receives HTTP 409, invalid measurements HTTP 400, missing/invalid device credentials HTTP 401, cross-device submission HTTP 403, an oversized JSON body HTTP 413, and missing ownership HTTP 404. The Express JSON body limit is 16 KB. Backends wait for the telemetry indexes before accepting traffic.

Nginx applies a shared local limit of 30 telemetry requests per minute per source IP, with a burst allowance of 10 and HTTP 429 for excess requests. It is shared across the three backends because they sit behind the same Nginx instance. It is not a per-device limit, can affect multiple devices behind one IP address, and would not be shared between multiple Nginx instances. The project currently uses local HTTP; do not expose device credentials over an untrusted network without TLS.

API proxy connections use a one-second connection timeout so Nginx can move to another replica promptly when a backend is stopped. The existing passive `max_fails`/`fail_timeout` behavior is retained; this is not an active health-check or autoscaling system.

### Authenticated dashboard monitoring

The dashboard uses the existing `/api/health` response to show actual backend instance responses observed through Nginx. These are explicitly samples, not total request counts or a traffic distribution report. The authenticated `GET /api/health/infrastructure` endpoint probes each configured backend directly and runs a MongoDB ping. Compose supplies the peer URLs through `BACKEND_HEALTH_URLS`; deployments outside this Compose configuration should set the corresponding comma-separated `backend-1=URL,backend-2=URL,backend-3=URL` value on each backend. Missing or failed probes are shown as unknown or unavailable, not online.

The dashboard also reports the responding backend process uptime and resident memory, peer-probe latency, MongoDB ping latency, and the browser-measured diagnostics API round trip. These are point-in-time measurements, not historical performance monitoring. There is no dedicated Nginx status endpoint in this project; a successful dashboard API response verifies only that request path through the gateway.

### Prometheus and Grafana monitoring

Prometheus scrapes each backend directly over `app-network` every 15 seconds. The Grafana provisioning files configure Prometheus as the default data source and load the **Cloud App Backend Overview** dashboard, which shows replica availability, HTTP request rates and totals, p95 request duration, and Node.js resident memory.

Set `GRAFANA_ADMIN_USER` and `GRAFANA_ADMIN_PASSWORD` in the root `.env` file before starting the stack. The root `.env` is ignored by Git; `.env.example` contains placeholders only. For a new checkout, copy `.env.example` to `.env` and replace the password placeholder with a long random value. Do not commit `.env`.

From the repository root, validate configuration and start monitoring:

```powershell
Set-Location C:\cloud-scalable-web-app
docker compose config --quiet
docker compose up -d prometheus grafana
docker compose ps
```

Compose waits for all three healthy backend services before starting Prometheus, and for healthy Prometheus before starting Grafana. If backend images predate the `/metrics` endpoint, rebuild and roll the replicas before starting monitoring:

```powershell
docker compose build backend1 backend2 backend3
docker compose up -d --no-deps --wait --wait-timeout 120 backend1
docker compose up -d --no-deps --wait --wait-timeout 120 backend2
docker compose up -d --no-deps --wait --wait-timeout 120 backend3
docker compose restart nginx
docker compose up -d prometheus grafana
```

Prometheus is available at `http://localhost:9090`; inspect **Status → Targets** or query `up{job="cloudapp-backends"}` to verify all three instances. Grafana is available at `http://localhost:3000`; log in using the admin username and password from the root `.env`. The Prometheus and Grafana ports bind only to loopback, backends have no published host ports, and Nginx does not proxy `/metrics`. These controls limit the intended local access paths; they are not a substitute for network and credential security on a deployed system.

Prometheus retains up to seven days or 2 GB of samples. Named volumes persist Prometheus and Grafana data. Stop only the monitoring services without deleting their data:

```powershell
docker compose stop prometheus grafana
```

Run the frontend API-service tests with `cd frontend; npm test` (Node's built-in test runner; no additional test dependency).

### Environment variables

Compose reads these measurement-bound variables from the shell or a root-level `.env` file. The values below are defaults, not secrets:

| Variable | Default | Purpose |
|---|---:|---|
| `MIN_TEMPERATURE_C` | `-40` | Lowest accepted temperature in Celsius |
| `MAX_TEMPERATURE_C` | `80` | Highest accepted temperature in Celsius |
| `MIN_HUMIDITY_PERCENT` | `0` | Lowest accepted relative humidity |
| `MAX_HUMIDITY_PERCENT` | `100` | Highest accepted relative humidity |
| `SIMULATOR_API_URL` | `http://localhost:8081/api/telemetry` | Simulator target endpoint |
| `SIMULATOR_DEVICE_ID` | unset | Provisioned simulator device ID |
| `SIMULATOR_DEVICE_SECRET` | unset | Provisioned secret, set only in the local shell |
| `SIMULATOR_INTERVAL_MS` | `5000` | Interval between samples; accepted range is 1000–3600000 ms |
| `SIMULATOR_SEQUENCE` | current timestamp | Optional non-negative initial sequence |

The simulator variables are consumed by the simulator process. They are not needed by the backend containers. Never commit a real device secret or put one in frontend configuration.

### Run the simulator

First sign in and register a device with `POST /api/devices` using your user JWT. Store the returned `deviceSecret` securely; it is shown only during provisioning. Do not commit it or include it in screenshots.

In a PowerShell terminal, set the simulator configuration and run it from the backend directory:

```powershell
$env:SIMULATOR_API_URL = "http://localhost:8081/api/telemetry"
$env:SIMULATOR_DEVICE_ID = "esp32-room-01"
$env:SIMULATOR_DEVICE_SECRET = "<paste-the-secret-shown-once-during-provisioning>"
$env:SIMULATOR_INTERVAL_MS = "5000"
Set-Location C:\cloud-scalable-web-app\backend
npm run simulate:telemetry
```

The interval must be between 1,000 and 3,600,000 milliseconds. Unless `SIMULATOR_SEQUENCE` is set, the simulator starts from the current timestamp and increments for each reading, avoiding sequence reuse on ordinary restarts. Each reading is marked `[simulated]` in simulator output, and the process stops cleanly with Ctrl+C. The script uses Node.js `fetch`; it adds no dependencies. The script refuses to run when `NODE_ENV=production`. Safe local placeholders are in `backend/.env.example`; replace the device ID and secret in your terminal environment rather than committing credentials.

### Verify locally

With Docker Compose running, health and telemetry endpoints are served through `http://localhost:8081`. After a simulator submission, use the authenticated latest/history endpoints to check stored values. Backend API tests run with:

```powershell
Set-Location C:\cloud-scalable-web-app
docker compose run --rm --build backend-test
```

This uses a dedicated Docker test image with the locked development dependencies. Production backend images intentionally install only production dependencies, so `docker compose exec backend1 npm test` is not a supported test command.

To install dependencies and run the same suite directly on Windows:

```powershell
Set-Location C:\cloud-scalable-web-app\backend
npm ci
npm test
```

### Provision a local test device

The dashboard's **Register a device** form creates devices for the currently signed-in account and displays its generated secret once. Device IDs are globally unique. Never include the secret in source code, screenshots, or committed files.

For an existing account, the following PowerShell commands run the safe-to-rerun test-device helper. Repeat them with Account B's email and password to provision a separate device under that account. Credentials are entered at the prompt, not saved in the repository; the helper stores each device secret in the current user's local application-data folder and refuses to recreate a device if its saved secret is missing.

```powershell
Set-Location C:\cloud-scalable-web-app\backend
$env:IOT_TEST_EMAIL = Read-Host "Account email"
$securePassword = Read-Host "Account password" -AsSecureString
$env:IOT_TEST_PASSWORD = [System.Net.NetworkCredential]::new("", $securePassword).Password
npm run provision:test-device
Remove-Item Env:IOT_TEST_EMAIL, Env:IOT_TEST_PASSWORD
```

The following standalone example creates a new temporary test account, keeps its issued JWT and device secret in variables, provisions one uniquely named device, submits one sample, and reads it back through Nginx:

```powershell
Set-Location C:\cloud-scalable-web-app
$base = "http://localhost:8081"
$suffix = [guid]::NewGuid().ToString("N").Substring(0, 12)
$email = "iot-test-$suffix@example.test"
$securePassword = Read-Host "Choose a temporary local test password" -AsSecureString
$password = [System.Net.NetworkCredential]::new("", $securePassword).Password

$null = Invoke-RestMethod "$base/api/auth/register" -Method Post `
  -ContentType "application/json" `
  -Body (@{ name = "Local IoT Test"; email = $email; password = $password } | ConvertTo-Json)
$login = Invoke-RestMethod "$base/api/auth/login" -Method Post `
  -ContentType "application/json" `
  -Body (@{ email = $email; password = $password } | ConvertTo-Json)
$userHeaders = @{ Authorization = "Bearer $($login.token)" }

$deviceId = "sim-$suffix"
$provision = Invoke-RestMethod "$base/api/devices" -Method Post `
  -Headers $userHeaders -ContentType "application/json" `
  -Body (@{ deviceId = $deviceId; name = "Local simulated sensor"; deviceType = "simulator" } | ConvertTo-Json)
$deviceHeaders = @{
  "X-Device-ID" = $deviceId
  "X-Device-Secret" = $provision.deviceSecret
}

$reading = @{
  deviceId = $deviceId
  temperatureC = 24.2
  humidityPercent = 51.3
  timestamp = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
  sequence = 1
}
$accepted = Invoke-RestMethod "$base/api/telemetry" -Method Post `
  -Headers $deviceHeaders -ContentType "application/json" -Body ($reading | ConvertTo-Json)
$latest = Invoke-RestMethod "$base/api/telemetry/latest/$deviceId" -Headers $userHeaders
$history = Invoke-RestMethod "$base/api/telemetry/history/${deviceId}?page=1&limit=10" -Headers $userHeaders

"Provisioned: $($provision.device.deviceId)"
"Ingestion: $($accepted.message)"
"Latest: $($latest.reading.temperatureC) C, $($latest.reading.humidityPercent)%"
"History count: $($history.pagination.total)"

$env:SIMULATOR_API_URL = "$base/api/telemetry"
$env:SIMULATOR_DEVICE_ID = $deviceId
$env:SIMULATOR_DEVICE_SECRET = $provision.deviceSecret
$env:SIMULATOR_INTERVAL_MS = "5000"
Set-Location C:\cloud-scalable-web-app\backend
npm run simulate:telemetry
# Stop the simulator with Ctrl+C, then clear the current PowerShell environment:
Remove-Item Env:SIMULATOR_DEVICE_SECRET, Env:SIMULATOR_DEVICE_ID, Env:SIMULATOR_API_URL, Env:SIMULATOR_INTERVAL_MS
```

Expected statuses: provisioning `201`, telemetry ingestion `201`, and latest/history reads `200`. Invalid data returns `400`, invalid device credentials `401`, cross-device submission `403`, duplicate sequence `409`, and an unknown/unowned device `404`.

### Infrastructure checks and troubleshooting

Run these checks from the repository root:

```powershell
Set-Location C:\cloud-scalable-web-app
docker compose up -d --build backend1 backend2 backend3 frontend
docker compose restart nginx
docker compose config --quiet
docker compose ps
docker compose exec -T nginx nginx -t
Invoke-RestMethod http://localhost:8081/api/health
1..12 | ForEach-Object { Invoke-RestMethod http://localhost:8081/api/instance }
```

The instance responses should show the three backend IDs across repeated requests. To demonstrate continued service with one backend stopped, then restore it:

```powershell
docker compose stop backend2
1..6 | ForEach-Object { Invoke-RestMethod http://localhost:8081/api/instance }
docker compose start backend2
docker compose ps
```

Common issues:

- **Jest missing from `backend1`:** application containers intentionally omit development packages. Run `docker compose run --rm --build backend-test`; do not install Jest globally or add it to the production image.
- **Nginx config changes do not take effect:** inspect the mounted config with `docker compose exec -T nginx nginx -T`; after editing, validate and restart only Nginx with `docker compose exec -T nginx nginx -t` and `docker compose restart nginx`.
- **Backend/frontend recreation returns upstream connection errors:** restart Nginx after Compose replaces containers so its statically configured upstream DNS addresses refresh: `docker compose restart nginx`.
- **HTTP 429 during testing:** the local per-IP limit is shared by requests from your machine. Pause until the rate window recovers, then use slower simulator intervals.
- **Telemetry returns 401:** verify the device ID and secret headers; the raw secret is displayed only once at provisioning.
- **MongoDB or service unhealthy:** check `docker compose ps` and `docker compose logs mongodb backend1 backend2 backend3`. Preserve data by avoiding `docker compose down -v`.

### Future hardware integration

After the HTTP API and simulator are validated, an ESP32 can read a DHT22 or BME280 and submit authenticated readings. An optional Raspberry Pi can run an MQTT broker and buffer messages during network outages. Initially use one logical MQTT ingestion consumer to avoid duplicate processing by all three backend replicas; retain the HTTP API as a working path when MQTT is unavailable. Hardware credentials must remain device-side, and deployment beyond the local machine requires TLS and a secure secret-provisioning process. No MQTT broker, Pi, ESP32 firmware, or cloud autoscaling is included in the current implementation.
```
