import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { pool } from "./db.js";

const router = Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Wagerageze kwinjira kenshi. Ongera ugerageze nyuma y'iminota 15." }
});

export function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ message: "Banza winjire muri konti yawe." });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ message: "Session yawe yarangiye. Ongera winjire." });
  }
}

export const roles = (...allowed) => (req, res, next) =>
  allowed.includes(req.user?.role)
    ? next()
    : res.status(403).json({ message: "Nta burenganzira ufite." });

router.post("/register", async (req, res, next) => {
  if (process.env.ALLOW_PUBLIC_REGISTRATION !== "true") {
    return res.status(403).json({ message: "Kwiyandikisha byafunzwe. Saba Admin kugukorera konti." });
  }
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
      return res.status(400).json({ message: "Tanga izina, email yemewe n'ijambo ry'ibanga rifite nibura inyuguti 8." });
    }
    const [existing] = await pool.execute("SELECT id FROM users WHERE email = ?", [email]);
    if (existing.length) return res.status(409).json({ message: "Email isanzwe ikoreshwa." });
    const hash = await bcrypt.hash(password, 12);
    const [result] = await pool.execute(
      "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'CASHIER')",
      [name, email, hash]
    );
    res.status(201).json({ id: result.insertId, message: "Konti yakozwe. Admin ni we ugena uruhare rwawe." });
  } catch (error) {
    next(error);
  }
});

router.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const [rows] = await pool.execute(
      "SELECT id, name, email, password_hash, role FROM users WHERE email = ? AND active = 1",
      [email]
    );
    const account = rows[0];
    if (!account || !(await bcrypt.compare(password, account.password_hash))) {
      return res.status(401).json({ message: "Email cyangwa ijambo ry'ibanga si byo." });
    }
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      return res.status(500).json({ message: "Server authentication is not configured securely." });
    }
    const user = { id: account.id, name: account.name, email: account.email, role: account.role };
    const token = jwt.sign(user, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "1d"
    });
    res.json({ token, user });
  } catch (error) {
    next(error);
  }
});

router.get("/me", auth, async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      "SELECT id, name, email, role FROM users WHERE id = ? AND active = 1",
      [req.user.id]
    );
    if (!rows.length) return res.status(401).json({ message: "Konti ntikiboneka cyangwa yarafunzwe." });
    res.json({ user: rows[0] });
  } catch (error) {
    next(error);
  }
});

export default router;
