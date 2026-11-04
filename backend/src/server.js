import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import authRoutes, { auth, roles } from "./auth.js";
import { pool } from "./db.js";

dotenv.config();
const app = express();
const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:5173").split(",").map(v => v.trim()).filter(Boolean);
app.use(helmet());
app.use(cors({ origin(origin, callback) {
  if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
  return callback(new Error("Origin not allowed by CORS"));
} }));
app.use(express.json({ limit: "1mb" }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
async function audit(conn, userId, action, entity, entityId, details = {}) {
  await conn.execute(
    "INSERT INTO audit_logs (user_id, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?)",
    [userId || null, action, entity || null, entityId || null, JSON.stringify(details)]
  );
}

app.get("/api/health", asyncRoute(async (_req, res) => {
  await pool.query("SELECT 1");
  res.json({ status: "ok", database: "connected" });
}));
app.use("/api/auth", authRoutes);

app.get("/api/categories", auth, asyncRoute(async (_req, res) => {
  const [rows] = await pool.query("SELECT id, name FROM categories ORDER BY name");
  res.json(rows);
}));

app.get("/api/products", auth, asyncRoute(async (_req, res) => {
  const [rows] = await pool.query(
    "SELECT p.id,p.name,p.sku,p.category_id,c.name AS category_name,p.unit,p.purchase_price,p.selling_price,p.min_quantity,p.active,COALESCE(SUM(CASE WHEN m.movement_type='IN' THEN m.quantity WHEN m.movement_type='OUT' THEN -m.quantity ELSE 0 END),0) AS stock_quantity FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN stock_movements m ON m.product_id=p.id WHERE p.active=1 GROUP BY p.id,c.name ORDER BY p.name"
  );
  res.json(rows);
}));

app.post("/api/products", auth, roles("ADMIN", "STOCK_MANAGER"), asyncRoute(async (req, res) => {
  const { name, sku, category_id, unit = "pcs", purchase_price = 0, selling_price = 0, min_quantity = 0 } = req.body;
  if (typeof name !== "string" || !name.trim() || typeof sku !== "string" || !sku.trim()) {
    return res.status(400).json({ message: "Izina na SKU birakenewe." });
  }
  for (const value of [purchase_price, selling_price, min_quantity]) {
    if (!Number.isFinite(Number(value)) || Number(value) < 0) {
      return res.status(400).json({ message: "Ibiciro n'ingano ntibigomba kuba munsi ya zero." });
    }
  }
  const [result] = await pool.execute(
    "INSERT INTO products (name,sku,category_id,unit,purchase_price,selling_price,min_quantity) VALUES (?,?,?,?,?,?,?)",
    [name.trim(), sku.trim(), category_id || null, unit, purchase_price, selling_price, min_quantity]
  );
  await audit(pool, req.user.id, "PRODUCT_CREATED", "products", result.insertId, { sku: sku.trim() });
  res.status(201).json({ id: result.insertId, message: "Igicuruzwa cyongeweho." });
}));

app.get("/api/dashboard/summary", auth, asyncRoute(async (_req, res) => {
  const [[p]] = await pool.query("SELECT COUNT(*) total FROM products WHERE active=1");
  const [[a]] = await pool.query("SELECT COUNT(*) total FROM stock_requests WHERE status='PENDING'");
  const [[m]] = await pool.query("SELECT COUNT(*) total FROM stock_movements WHERE created_at >= CURDATE() AND created_at < CURDATE() + INTERVAL 1 DAY");
  const [[l]] = await pool.query("SELECT COUNT(*) total FROM (SELECT p.id,p.min_quantity,COALESCE(SUM(CASE WHEN sm.movement_type='IN' THEN sm.quantity WHEN sm.movement_type='OUT' THEN -sm.quantity ELSE 0 END),0) qty FROM products p LEFT JOIN stock_movements sm ON sm.product_id=p.id WHERE p.active=1 GROUP BY p.id,p.min_quantity) s WHERE s.qty <= s.min_quantity");
  res.json({ products: Number(p.total), pendingApprovals: Number(a.total), todayMovements: Number(m.total), lowStock: Number(l.total) });
}));

app.get("/api/stock/requests", auth, asyncRoute(async (_req, res) => {
  const [rows] = await pool.query(
    "SELECT sr.*,p.name product_name,p.sku,requester.name requested_by_name,reviewer.name reviewed_by_name FROM stock_requests sr JOIN products p ON p.id=sr.product_id JOIN users requester ON requester.id=sr.requested_by LEFT JOIN users reviewer ON reviewer.id=sr.reviewed_by ORDER BY sr.created_at DESC LIMIT 500"
  );
  res.json(rows);
}));

app.post("/api/stock/requests", auth, asyncRoute(async (req, res) => {
  const { product_id, movement_type, quantity, reason = "" } = req.body;
  const amount = Number(quantity);
  if (!Number.isInteger(Number(product_id)) || Number(product_id) < 1 ||
      !["IN", "OUT"].includes(movement_type) || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ message: "Hitamo IN cyangwa OUT n'ingano irenze zero." });
  }
  const [result] = await pool.execute(
    "INSERT INTO stock_requests (product_id,movement_type,quantity,reason,requested_by) VALUES (?,?,?,?,?)",
    [product_id, movement_type, amount, String(reason).slice(0, 500), req.user.id]
  );
  await audit(pool, req.user.id, "STOCK_REQUESTED", "stock_requests", result.insertId, { product_id, movement_type, quantity: amount });
  res.status(201).json({ id: result.insertId, status: "PENDING", message: "Icyifuzo cyoherejwe kwemezwa." });
}));

app.post("/api/stock/requests/:id/decision", auth, roles("ADMIN", "STOCK_MANAGER"), asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  const { decision, comment = "" } = req.body;
  if (!Number.isInteger(id) || id < 1 || !["APPROVED", "REJECTED"].includes(decision)) {
    return res.status(400).json({ message: "Icyemezo cyangwa nimero y'icyifuzo si byo." });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute("SELECT * FROM stock_requests WHERE id=? AND status='PENDING' FOR UPDATE", [id]);
    if (!rows.length) {
      await conn.rollback();
      return res.status(404).json({ message: "Icyifuzo ntikiboneka cyangwa cyamaze gusuzumwa." });
    }
    const item = rows[0];
    if (decision === "APPROVED" && item.movement_type === "OUT") {
      const [stock] = await conn.execute(
        "SELECT COALESCE(SUM(CASE WHEN movement_type='IN' THEN quantity WHEN movement_type='OUT' THEN -quantity ELSE 0 END),0) qty FROM stock_movements WHERE product_id=?",
        [item.product_id]
      );
      if (Number(stock[0].qty) < Number(item.quantity)) {
        await conn.rollback();
        return res.status(409).json({ message: "Stock ihari ntihagije." });
      }
    }
    if (decision === "APPROVED") {
      await conn.execute(
        "INSERT INTO stock_movements (product_id,movement_type,quantity,reference,created_by,approved_by) VALUES (?,?,?,?,?,?)",
        [item.product_id, item.movement_type, item.quantity, "REQUEST-" + item.id, item.requested_by, req.user.id]
      );
    }
    await conn.execute(
      "UPDATE stock_requests SET status=?,reviewed_by=?,review_comment=?,reviewed_at=NOW() WHERE id=?",
      [decision, req.user.id, String(comment).slice(0, 500), id]
    );
    await audit(conn, req.user.id, "STOCK_REQUEST_" + decision, "stock_requests", id, { product_id: item.product_id, quantity: item.quantity });
    await conn.commit();
    res.json({ status: decision, message: "Icyemezo cyabitswe." });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}));

app.use((error, _req, res, _next) => {
  console.error("[api]", error.code || error.message);
  if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "SKU cyangwa email isanzwe ikoreshwa." });
  if (error.message === "Origin not allowed by CORS") return res.status(403).json({ message: "Origin not allowed." });
  res.status(500).json({ message: "Habaye ikibazo kuri server. Ongera ugerageze." });
});

app.listen(Number(process.env.PORT || 5000), "0.0.0.0", () => console.log("UBUBIKO SMART API running"));
