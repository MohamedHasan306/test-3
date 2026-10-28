# Distributed Real-Time E-Commerce Platform — Requirement 1

Requirement 1: **API Design & Security**. A single NestJS project organized into four modules (Users, Products, Orders, Notifications), backed by PostgreSQL, running fully inside Docker.

## Stack

- **Framework:** NestJS 12 (TypeScript, ESM)
- **Database:** PostgreSQL + TypeORM
- **Auth:** JWT (passport-jwt), bcrypt password hashing
- **Docs:** Swagger / OpenAPI (interactive, try-it-out)
- **Containerization:** Docker + Docker Compose

## Running the project

```bash
docker compose up --build
```

This starts two containers:

- `db` — PostgreSQL 16
- `api` — the NestJS application, on `http://localhost:3000`

Once it's up:

- API base URL: `http://localhost:3000/api/v1`
- Swagger docs (interactive): `http://localhost:3000/api/docs`
- Health check: `http://localhost:3000/api/v1/health`

No manual `.env` setup is required to run via Docker — `docker-compose.yml` already sets matching credentials for both containers. For local development without Docker, copy `backend/.env.example` to `backend/.env` and point `DATABASE_HOST` at your local PostgreSQL instance.

## Project structure

```
backend/
  src/
    users/        # register, login, roles, JWT strategy
      auth/
      entities/
      dto/
    products/      # create (admin, with image upload), list (paginated, filterable), view one
      entities/
      dto/
    orders/        # create, view (owner or admin only), change status (admin only)
      entities/
      dto/
    notifications/  # per-user notification feed
      entities/
    common/        # guards, decorators, enums, error filter shared across modules
  uploads/products/ # uploaded product images (served at /uploads/products/...)
  Dockerfile
docker-compose.yml
```

## Roles & security model

Two roles: `customer` (default on registration) and `admin`. There is no public "become admin" endpoint on purpose — promote a user by running, against the running `db` container:

```sql
UPDATE users SET role = 'admin' WHERE email = 'someone@example.com';
```

Enforced rules:

- Every route except `GET /products`, `GET /products/:id`, `POST /auth/register` and `POST /auth/login` requires a valid `Authorization: Bearer <token>` header.
- Only an `admin` can create products or change an order's status.
- A customer can only see and list their **own** orders; an admin can see all of them. Attempting to open someone else's order returns `403 Forbidden`.
- Login is rate-limited to 5 attempts per minute per client.

## API overview

| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/auth/register` | public | Create an account, returns a JWT |
| POST | `/auth/login` | public (rate-limited) | Returns a JWT |
| GET | `/users/me` | authenticated | Current user's profile |
| GET | `/products` | public | Paginated list, `?page=&limit=&category=` |
| GET | `/products/:id` | public | Single product |
| POST | `/products` | admin | Create product, `multipart/form-data` with an `image` file |
| POST | `/orders` | authenticated | Create an order from a list of `{ productId, quantity }` |
| GET | `/orders` | authenticated | Own orders (all orders if admin) |
| GET | `/orders/:id` | owner or admin | A single order |
| PATCH | `/orders/:id/status` | admin | Change order status |
| GET | `/notifications` | authenticated | Current user's notifications |

Every error response follows the same shape:

```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have access to this order",
    "statusCode": 403,
    "path": "/api/v1/orders/...",
    "timestamp": "..."
  }
}
```

## Demonstrating the required security scenario

1. Register two customers, A and B.
2. A creates an order: `POST /orders`.
3. B tries `GET /orders/:id` for A's order with their own token → `403 Forbidden`.
4. B (a customer) tries `PATCH /orders/:id/status` → `403 Forbidden`.
5. No token at all on any protected route → `401 Unauthorized`.

This exact flow was run against a live instance of this API during development (register → login → create product as admin → create order → cross-user access attempt → status change attempt) and every response matched the expected status code.

## Notes on design decisions

- `Product` intentionally has **no stock/quantity field**. Inventory tracking is split into its own service under Requirement 2 (Inter-Service Communication, via gRPC against a separate warehouse service with its own database), so keeping `Product` stock-free now avoids rework later.
- `OrderItem` snapshots the unit price at the time of purchase, so later price changes on a product don't retroactively change past orders' totals.
