# UBUBIKO SMART

Bilingual (Kinyarwanda / English) inventory management platform.

## Stack
- Frontend: React 19, TypeScript, Vite
- Backend: Node.js, Express, JWT
- Database: MySQL 8.4 (Aiven)
- Frontend hosting: Netlify
- Backend hosting: Render

## Current modules
- JWT login and role-based access (ADMIN, STOCK_MANAGER, CASHIER, STOREKEEPER)
- Dashboard, products, stock requests and approval workflow
- Supplier and customer records
- Purchase receiving and automatic stock-in movements
- Sales and automatic stock-out movements
- Customer returns and stock-in movements
- Business summaries, movement reports and audit logs
- User administration and data-backed UBUBIKO insights
- Responsive navy / white / gold interface, Kinyarwanda and English, light and dark themes

## Git Bash local setup

From the repository root:

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Open another Git Bash terminal:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Set the frontend environment variable in `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000/api
```

Set backend environment variables in `backend/.env`. Use values from Aiven. Never commit `.env`, database passwords, JWT secrets or the CA certificate.

## Database

The original `database/schema.sql` is the initial schema reference. Do not run it against an existing production database.

For an existing UBUBIKO SMART Aiven database, run the additive business-module migration once:

`database/migrations/001_business_modules.sql`

It creates purchase, sales and returns tables without dropping or recreating existing data. Take an Aiven backup before applying production migrations.

## Deployment

### Render backend
A Render Blueprint is provided in `render.yaml`. Connect the repository in Render and deploy the blueprint. Set:
- `FRONTEND_URL`: exact Netlify site origin (for example, `https://your-site.netlify.app`)
- `DB_HOST`, `DB_USER`, `DB_PASSWORD`: from Aiven
- `DB_SSL_CA`: full PEM certificate contents from Aiven (secret environment variable)
- Confirm `DB_PORT` and `DB_NAME` match Aiven.

Keep `JWT_SECRET` private and at least 32 characters. Do not put backend secrets in Netlify.

### Netlify frontend
Keep the existing Netlify site. Set the Netlify environment variable:
`VITE_API_URL=https://YOUR-RENDER-SERVICE.onrender.com/api`

Then deploy the selected Git branch after the backend is healthy. The browser frontend only needs the public API URL; database credentials and AI provider keys stay on the backend.

## Important production notes
- Apply migrations only after taking a database backup.
- Render free services may sleep when idle; the first request after sleep can be delayed. Confirm current plan limits in Render before relying on availability.
- Do not enable public registration in production. Create users through the ADMIN account.
- The current UBUBIKO AI page provides database-backed stock insights and reorder suggestions. It is not a generative LLM chat until a server-side AI provider is configured.
- Sales and purchase operations create stock movements in database transactions. Keep stock movement records as the source of truth for inventory quantities.

## Attribution
Developed by Danger Team | L5 SOD Finalist · In collaboration with Danger · UBUBIKO SMART
