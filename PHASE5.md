# Phase 5: Backend Scaling Behind Nginx

## Objective

Run the same Node.js backend application in three containers behind Nginx. MongoDB remains one shared database, so all instances use the same users and authentication data.

## Architecture

```text
Browser
   |
 Nginx
   |
 +----------+----------+
 |          |          |
Backend1  Backend2  Backend3
 |          |          |
 +----------+----------+
            |
          MongoDB
```

## Start the system

From PowerShell:

```powershell
cd C:\cloud-scalable-web-app
docker compose build
docker compose up -d
docker compose ps
```

Open the application at `http://localhost:8081`.

## Multiple backend containers

`backend1`, `backend2`, and `backend3` all build from `backend/Dockerfile`. Each receives a different `INSTANCE_ID`, but all use the same `MONGO_URI`, `JWT_SECRET`, and internal port 5000.

The backend health response includes the instance ID. `GET /api/instance` also returns the instance ID and container hostname.

## Nginx load balancing

Nginx uses round-robin routing through the `backend_servers` upstream. API requests under `/api/` go to the backend pool. All other requests go to the frontend container.

Nginx uses passive failure detection with `max_fails`, `fail_timeout`, and `proxy_next_upstream`. This is not an active health-check system.

## Demonstrate load balancing

```powershell
1..12 | ForEach-Object { Invoke-RestMethod http://localhost:8081/api/instance }
```

The responses should show `backend-1`, `backend-2`, and `backend-3`. The exact order can vary after failures or restarts.

## Demonstrate failure recovery

Stop backend2:

```powershell
docker compose stop backend2
```

Continue requests:

```powershell
1..12 | ForEach-Object { Invoke-RestMethod http://localhost:8081/api/instance }
```

Requests should continue through backend1 and backend3 after Nginx marks backend2 unavailable.

Restart backend2:

```powershell
docker compose start backend2
docker compose ps
```

Once backend2 is healthy, it can receive traffic again.

## Shared MongoDB and JWT

All backend instances use the single `mongodb` service and the `mongodb_data` named volume. They also share the same `JWT_SECRET`, so a token issued by one instance can be verified by another. No in-memory authentication session is used.

## Useful commands

```powershell
docker compose logs backend1 backend2 backend3
docker compose logs nginx
docker compose ps
docker compose down
```

`docker compose down` keeps the MongoDB volume. Do not use `docker compose down -v` unless you intentionally want to delete database data.

## Expected results

- The browser uses only Nginx at port 8081.
- Backend containers are not exposed directly to the host.
- MongoDB is not exposed directly to the host.
- `/api/health`, authentication, password reset, and `/api/instance` work through Nginx.
- Stopping one backend leaves the other two available.

## Limitations

This phase demonstrates a local Docker Compose deployment with Nginx round-robin routing and passive failure handling. It does not implement Kubernetes, Docker Swarm, cloud deployment, active Nginx health checks, autoscaling, or CI/CD.
