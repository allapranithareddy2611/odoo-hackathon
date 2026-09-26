# StockSense — Inventory Management System

StockSense is a full-stack inventory app with a React/Vite frontend and an Express API. It tracks products, stock by location, receipts, deliveries, internal transfers, and physical-count adjustments in a stock ledger.

## Run locally

Requirements: Node.js 20+ and npm.

1. In `backend`, copy `.env.example` to `.env` and set `PORT=4000`. Supabase settings are optional for the demo mode.
2. Start the API:

   ```bash
   cd backend
   npm install
   npm run dev
   ```

3. In another terminal start the frontend:

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

4. Open the URL printed by Vite (normally http://localhost:5173). The API health check is http://localhost:4000/api/health.

Without Supabase credentials the API starts with sample data in demo mode. Data is held in memory and resets when the API restarts. For persistent data, create a Supabase project, run `backend/supabase/schema.sql` in the Supabase SQL Editor, and set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `backend/.env`. **Keep the service-role key on the server; never put it in the frontend.**

The browser app connects to Supabase Auth directly when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are configured. Enable email/password auth in Supabase and allow `http://localhost:5173` as a redirect URL. For a code-based password reset email, set the Supabase recovery email template to display `{{ .Token }}`; the entered recovery code is verified before the user chooses a new password. If Auth variables are omitted, the demo opens directly without a sign-in gate.

## Demo for judges

1. Open the dashboard to view key stock metrics, low-stock alerts, recent inventory movements, and the warehouse-wise stock summary.
2. Open **Products** and search by SKU or product name. The seeded catalog includes stock at multiple locations.
3. In **Operations**, create a receipt for an existing SKU and validate it. Show the increased on-hand quantity and new ledger entry.
4. Create and validate a delivery to demonstrate stock decreasing. Try a quantity larger than available to see the validation guard.
5. Create a transfer between Main Warehouse and Production Floor; the total company stock stays constant while the location balances change.
6. Record an adjustment for a physical count and open **Move history** to trace all four operations.

## Structure

- `frontend/` — React, Vite, responsive dashboard and inventory workflows.
- `backend/` — Express REST API, Supabase persistence and seeded in-memory demo mode.
- `backend/supabase/schema.sql` — database schema, constraints, and initial warehouses.

## API

`GET /api/health`, `GET /api/dashboard`, `GET/POST /api/products`, `PATCH /api/products/:id`, `GET/POST /api/operations`, `POST /api/operations/:id/validate`, `GET /api/warehouses`, and `GET /api/movements`.

## Notes

The demo mode is for evaluation and local exploration, not production use. Configure Supabase before using with shared users or persistent stock. Production deployment should also add role-based authorization, audit policies, and a transactional database function for validating multi-line operations.
