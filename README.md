# ice-shop-microservices 🧊

A distributed microservices architecture built with Node.js, Docker, and JWT auth — splitting a penguin-themed ice shop monolith into independent, scalable services.

## Services

| Service | Port (internal) | Responsibility |
|---|---|---|
| API Gateway | 3000 (public) | Auth, routing, JWT validation |
| service-productos | 3001 | Product catalog CRUD |
| service-inventario | 3002 | Stock management |
| service-pedidos | 3003 | Order creation and orchestration |
| service-pagos | 3004 | Payment processing |

## Requirements

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes docker-compose)

That's it. No Node.js installation needed locally.

## Setup

```bash
# 1. Clone the repo
git clone <your-repo-url>
cd ice-shop-microservices

# 2. Copy the env file and fill in values (already filled for local dev)
cp .env.example .env

# 3. Start everything
docker compose up --build
```

Wait ~30 seconds for all databases to initialize.

## Quick test

```bash
# Get a JWT token
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"usuario": "pinguino", "password": "hielo123"}'

# Use the token (replace TOKEN with the value from above)
curl http://localhost:3000/productos \
  -H "Authorization: Bearer TOKEN"

# Create an order
curl -X POST http://localhost:3000/pedidos \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"producto_id": 1, "cantidad": 2}'
```

## Stop

```bash
docker compose down          # stop containers
docker compose down -v       # stop and delete all data
```
