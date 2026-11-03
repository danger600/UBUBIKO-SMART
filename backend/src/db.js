import mysql from "mysql2/promise";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

const defaultCaPath = fileURLToPath(new URL("../ca.pem", import.meta.url));

function getSslOptions() {
  if (process.env.DB_SSL !== "true") return undefined;

  const inlineCa = process.env.DB_SSL_CA?.replace(/\\n/g, "\n");
  const caPath = process.env.DB_SSL_CA_PATH
    ? path.resolve(process.env.DB_SSL_CA_PATH)
    : defaultCaPath;

  const ca = inlineCa ||
    (fs.existsSync(caPath) ? fs.readFileSync(caPath, "utf8") : undefined);

  if (!ca) {
    console.warn(
      "[database] SSL is enabled but no CA certificate was found. " +
      "Set DB_SSL_CA or DB_SSL_CA_PATH, or place the Aiven certificate at backend/ca.pem."
    );
  }

  return {
    rejectUnauthorized: true,
    ...(ca ? { ca } : {})
  };
}

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  connectTimeout: 15000,
  decimalNumbers: true,
  ssl: getSslOptions()
});
