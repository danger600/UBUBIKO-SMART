# UBUBIKO SMART
Sisitemu yuzuye yo gucunga ububiko. Stack: React + TypeScript + Vite, Node.js + Express, MySQL.

## Ibyo irimo
- Konti, JWT authentication na roles: ADMIN, STOCK_MANAGER, CASHIER, STOREKEEPER.
- Products, categories, stock requests, stock movements.
- Ibyifuzo byose byo kongera/kugabanya stock bigomba kwemezwa na Stock Manager cyangwa Admin mbere yo guhindura stock.
- Dashboard, Kinyarwanda/English, light/dark theme, responsive layout.
- Navy blue, white and gold design.

## Gutangiza (Windows PowerShell)
1. Kora database ukoresheje `database/schema.sql`.
2. Backend: `cd backend; Copy-Item .env.example .env; npm install; npm run dev`.
3. Frontend: indi PowerShell: `cd frontend; Copy-Item .env.example .env; npm install; npm run dev`.
4. Fungura http://localhost:5173.
5. Shyira MySQL credentials na JWT_SECRET muri backend/.env. Ntushyire .env kuri GitHub.

Frontend API URL: VITE_API_URL=http://localhost:5000/api
Backend health: GET /api/health
Developed by Remmy | L5 SWD · @tigernsanz
