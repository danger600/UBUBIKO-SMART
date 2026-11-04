import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool } from "./db.js";
import { auth, roles } from "./auth.js";

const router = Router();
router.use(auth);
const admin = roles("ADMIN");
const managers = roles("ADMIN", "STOCK_MANAGER");
const staff = roles("ADMIN", "STOCK_MANAGER", "CASHIER", "STOREKEEPER");
const wrap = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
const positive = n => Number.isFinite(Number(n)) && Number(n) > 0;
const idOk = n => Number.isInteger(Number(n)) && Number(n) > 0;
const clean = v => String(v ?? "").trim();
async function audit(conn, userId, action, entity, entityId, details={}) {
  await conn.execute(
    "INSERT INTO audit_logs (user_id,action,entity,entity_id,details) VALUES (?,?,?,?,?)",
    [userId,action,entity,entityId || null,JSON.stringify(details)]
  );
}
async function transaction(work) {
  const conn=await pool.getConnection();
  try { await conn.beginTransaction(); const value=await work(conn); await conn.commit(); return value; }
  catch(error) { await conn.rollback(); throw error; }
  finally { conn.release(); }
}
const stockSql = "COALESCE(SUM(CASE WHEN movement_type='IN' THEN quantity WHEN movement_type='OUT' THEN -quantity ELSE 0 END),0)";

router.get("/suppliers", wrap(async (_req,res) => {
  const [rows]=await pool.query("SELECT * FROM suppliers ORDER BY name"); res.json(rows);
}));
router.post("/suppliers", managers, wrap(async (req,res) => {
  const name=clean(req.body.name); if(!name) return res.status(400).json({message:"Supplier name is required."});
  const [r]=await pool.execute("INSERT INTO suppliers(name,phone,email,address) VALUES(?,?,?,?)",[name,clean(req.body.phone)||null,clean(req.body.email)||null,clean(req.body.address)||null]);
  await audit(pool,req.user.id,"SUPPLIER_CREATED","suppliers",r.insertId,{name}); res.status(201).json({id:r.insertId});
}));
router.put("/suppliers/:id", managers, wrap(async (req,res) => {
  if(!idOk(req.params.id)||!clean(req.body.name)) return res.status(400).json({message:"Valid supplier ID and name are required."});
  const [r]=await pool.execute("UPDATE suppliers SET name=?,phone=?,email=?,address=? WHERE id=?",[clean(req.body.name),clean(req.body.phone)||null,clean(req.body.email)||null,clean(req.body.address)||null,req.params.id]);
  if(!r.affectedRows) return res.status(404).json({message:"Supplier not found."});
  await audit(pool,req.user.id,"SUPPLIER_UPDATED","suppliers",req.params.id); res.json({message:"Supplier updated."});
}));
router.delete("/suppliers/:id", managers, wrap(async (req,res) => {
  const [r]=await pool.execute("DELETE FROM suppliers WHERE id=?",[req.params.id]);
  if(!r.affectedRows) return res.status(404).json({message:"Supplier not found."});
  await audit(pool,req.user.id,"SUPPLIER_DELETED","suppliers",req.params.id); res.json({message:"Supplier deleted."});
}));

router.get("/customers", wrap(async (_req,res) => { const [rows]=await pool.query("SELECT * FROM customers ORDER BY name"); res.json(rows); }));
router.post("/customers", staff, wrap(async (req,res) => {
  const name=clean(req.body.name); if(!name) return res.status(400).json({message:"Customer name is required."});
  const [r]=await pool.execute("INSERT INTO customers(name,phone,email) VALUES(?,?,?)",[name,clean(req.body.phone)||null,clean(req.body.email)||null]);
  await audit(pool,req.user.id,"CUSTOMER_CREATED","customers",r.insertId,{name}); res.status(201).json({id:r.insertId});
}));
router.put("/customers/:id", staff, wrap(async (req,res) => {
  if(!clean(req.body.name)) return res.status(400).json({message:"Customer name is required."});
  const [r]=await pool.execute("UPDATE customers SET name=?,phone=?,email=? WHERE id=?",[clean(req.body.name),clean(req.body.phone)||null,clean(req.body.email)||null,req.params.id]);
  if(!r.affectedRows) return res.status(404).json({message:"Customer not found."});
  await audit(pool,req.user.id,"CUSTOMER_UPDATED","customers",req.params.id); res.json({message:"Customer updated."});
}));
router.delete("/customers/:id", managers, wrap(async (req,res) => {
  const [r]=await pool.execute("DELETE FROM customers WHERE id=?",[req.params.id]);
  if(!r.affectedRows) return res.status(404).json({message:"Customer not found."});
  await audit(pool,req.user.id,"CUSTOMER_DELETED","customers",req.params.id); res.json({message:"Customer deleted."});
}));

router.get("/purchases", managers, wrap(async (_req,res) => {
  const [rows]=await pool.query("SELECT p.*,s.name supplier_name,u.name created_by_name FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id JOIN users u ON u.id=p.created_by ORDER BY p.created_at DESC LIMIT 500");
  res.json(rows);
}));
router.post("/purchases", managers, wrap(async (req,res) => {
  const items=Array.isArray(req.body.items)?req.body.items:[]; if(!items.length) return res.status(400).json({message:"Add at least one purchase item."});
  const result=await transaction(async conn=>{
    let total=0; const normalized=[];
    for(const item of items){
      if(!idOk(item.product_id)||!positive(item.quantity)||!Number.isFinite(Number(item.unit_cost))||Number(item.unit_cost)<0) throw Object.assign(new Error("Invalid purchase item."),{status:400});
      const [p]=await conn.execute("SELECT id FROM products WHERE id=? AND active=1 FOR UPDATE",[item.product_id]);
      if(!p.length) throw Object.assign(new Error("Product not found."),{status:404});
      const qty=Number(item.quantity),cost=Number(item.unit_cost),line=qty*cost; total+=line; normalized.push({product_id:Number(item.product_id),quantity:qty,unit_cost:cost,line_total:line});
    }
    const ref=clean(req.body.reference_no)||"PUR-"+Date.now();
    const [purch]=await conn.execute("INSERT INTO purchases(supplier_id,reference_no,total_amount,notes,created_by) VALUES(?,?,?,?,?)",[idOk(req.body.supplier_id)?req.body.supplier_id:null,ref,total,clean(req.body.notes)||null,req.user.id]);
    for(const item of normalized){
      await conn.execute("INSERT INTO purchase_items(purchase_id,product_id,quantity,unit_cost,line_total) VALUES(?,?,?,?,?)",[purch.insertId,item.product_id,item.quantity,item.unit_cost,item.line_total]);
      await conn.execute("INSERT INTO stock_movements(product_id,movement_type,quantity,reference,created_by,approved_by) VALUES(?,'IN',?,?,?,?)",[item.product_id,item.quantity,ref,req.user.id,req.user.id]);
      await conn.execute("UPDATE products SET purchase_price=? WHERE id=?",[item.unit_cost,item.product_id]);
    }
    await audit(conn,req.user.id,"PURCHASE_RECEIVED","purchases",purch.insertId,{reference_no:ref,total});
    return {id:purch.insertId,reference_no:ref,total_amount:total};
  });
  res.status(201).json(result);
}));

router.get("/sales", staff, wrap(async (_req,res) => {
  const [rows]=await pool.query("SELECT s.*,c.name customer_name,u.name created_by_name FROM sales s LEFT JOIN customers c ON c.id=s.customer_id JOIN users u ON u.id=s.created_by ORDER BY s.created_at DESC LIMIT 500"); res.json(rows);
}));
router.post("/sales", staff, wrap(async (req,res) => {
  const items=Array.isArray(req.body.items)?req.body.items:[]; if(!items.length) return res.status(400).json({message:"Add at least one sale item."});
  const result=await transaction(async conn=>{
    let total=0; const normalized=[];
    for(const item of items){
      if(!idOk(item.product_id)||!positive(item.quantity)) throw Object.assign(new Error("Invalid sale item."),{status:400});
      const [p]=await conn.execute("SELECT id,selling_price,purchase_price FROM products WHERE id=? AND active=1 FOR UPDATE",[item.product_id]);
      if(!p.length) throw Object.assign(new Error("Product not found."),{status:404});
      const [s]=await conn.execute("SELECT "+stockSql+" qty FROM stock_movements WHERE product_id=?",[item.product_id]);
      const qty=Number(item.quantity); if(Number(s[0].qty)<qty) throw Object.assign(new Error("Insufficient stock for product ID "+item.product_id),{status:409});
      const price=item.unit_price===undefined?Number(p[0].selling_price):Number(item.unit_price);
      if(!Number.isFinite(price)||price<0) throw Object.assign(new Error("Invalid sale price."),{status:400});
      const line=qty*price; total+=line; normalized.push({product_id:Number(item.product_id),quantity:qty,unit_price:price,unit_cost:Number(p[0].purchase_price),line_total:line});
    }
    const ref=clean(req.body.receipt_no)||"SAL-"+Date.now();
    const [sale]=await conn.execute("INSERT INTO sales(customer_id,receipt_no,total_amount,notes,created_by) VALUES(?,?,?,?,?)",[idOk(req.body.customer_id)?req.body.customer_id:null,ref,total,clean(req.body.notes)||null,req.user.id]);
    for(const item of normalized){
      await conn.execute("INSERT INTO sale_items(sale_id,product_id,quantity,unit_price,unit_cost,line_total) VALUES(?,?,?,?,?,?)",[sale.insertId,item.product_id,item.quantity,item.unit_price,item.unit_cost,item.line_total]);
      await conn.execute("INSERT INTO stock_movements(product_id,movement_type,quantity,reference,created_by,approved_by) VALUES(?,'OUT',?,?,?,?)",[item.product_id,item.quantity,ref,req.user.id,req.user.id]);
    }
    await audit(conn,req.user.id,"SALE_COMPLETED","sales",sale.insertId,{receipt_no:ref,total});
    return {id:sale.insertId,receipt_no:ref,total_amount:total};
  });
  res.status(201).json(result);
}));

router.get("/returns", managers, wrap(async (_req,res) => { const [rows]=await pool.query("SELECT r.*,u.name created_by_name FROM returns r JOIN users u ON u.id=r.created_by ORDER BY r.created_at DESC LIMIT 500"); res.json(rows); }));
router.post("/returns", managers, wrap(async (req,res) => {
  const items=Array.isArray(req.body.items)?req.body.items:[]; if(!idOk(req.body.sale_id)||!items.length) return res.status(400).json({message:"A sale and at least one return item are required."});
  const result=await transaction(async conn=>{
    const [sale]=await conn.execute("SELECT id FROM sales WHERE id=? AND status='COMPLETED' FOR UPDATE",[req.body.sale_id]);
    if(!sale.length) throw Object.assign(new Error("Sale not found."),{status:404});
    let total=0; const normalized=[];
    for(const item of items){
      if(!idOk(item.sale_item_id)||!positive(item.quantity)) throw Object.assign(new Error("Invalid return item."),{status:400});
      const [rows]=await conn.execute("SELECT si.*,COALESCE((SELECT SUM(ri.quantity) FROM return_items ri JOIN returns r ON r.id=ri.return_id WHERE r.sale_id=si.sale_id AND ri.product_id=si.product_id),0) returned FROM sale_items si WHERE si.id=? AND si.sale_id=? FOR UPDATE",[item.sale_item_id,req.body.sale_id]);
      if(!rows.length) throw Object.assign(new Error("Sale item not found."),{status:404});
      const row=rows[0],qty=Number(item.quantity);
      if(qty>Number(row.quantity)-Number(row.returned)) throw Object.assign(new Error("Return quantity exceeds sold quantity."),{status:409});
      const line=qty*Number(row.unit_price); total+=line; normalized.push({product_id:row.product_id,quantity:qty,unit_price:Number(row.unit_price),line_total:line});
    }
    const ref="RET-"+Date.now();
    const [ret]=await conn.execute("INSERT INTO returns(sale_id,return_type,reference_no,total_amount,reason,created_by) VALUES(?,'CUSTOMER',?,?,?,?)",[req.body.sale_id,ref,total,clean(req.body.reason)||null,req.user.id]);
    for(const item of normalized){
      await conn.execute("INSERT INTO return_items(return_id,product_id,quantity,unit_price,line_total) VALUES(?,?,?,?,?)",[ret.insertId,item.product_id,item.quantity,item.unit_price,item.line_total]);
      await conn.execute("INSERT INTO stock_movements(product_id,movement_type,quantity,reference,created_by,approved_by) VALUES(?,'IN',?,?,?,?)",[item.product_id,item.quantity,ref,req.user.id,req.user.id]);
    }
    await audit(conn,req.user.id,"CUSTOMER_RETURN_RECEIVED","returns",ret.insertId,{sale_id:req.body.sale_id,total});
    return {id:ret.insertId,reference_no:ref,total_amount:total};
  });
  res.status(201).json(result);
}));

router.get("/reports/overview", managers, wrap(async (_req,res) => {
  const [[sales]]=await pool.query("SELECT COALESCE(SUM(total_amount),0) total FROM sales WHERE status='COMPLETED' AND created_at>=DATE_FORMAT(CURDATE(),'%Y-%m-01')");
  const [[purchases]]=await pool.query("SELECT COALESCE(SUM(total_amount),0) total FROM purchases WHERE status='RECEIVED' AND created_at>=DATE_FORMAT(CURDATE(),'%Y-%m-01')");
  const [[cost]]=await pool.query("SELECT COALESCE(SUM(si.quantity*si.unit_cost),0) total FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.status='COMPLETED' AND s.created_at>=DATE_FORMAT(CURDATE(),'%Y-%m-01')");
  const [[returns]]=await pool.query("SELECT COALESCE(SUM(total_amount),0) total FROM returns WHERE return_type='CUSTOMER' AND created_at>=DATE_FORMAT(CURDATE(),'%Y-%m-01')");
  const [[inventory]]=await pool.query("SELECT COALESCE(SUM(x.qty*p.purchase_price),0) total FROM products p LEFT JOIN (SELECT product_id,SUM(CASE WHEN movement_type='IN' THEN quantity WHEN movement_type='OUT' THEN -quantity ELSE 0 END) qty FROM stock_movements GROUP BY product_id) x ON x.product_id=p.id WHERE p.active=1");
  res.json({sales:Number(sales.total),purchases:Number(purchases.total),costOfGoods:Number(cost.total),returns:Number(returns.total),grossProfit:Number(sales.total)-Number(returns.total)-Number(cost.total),inventoryValue:Number(inventory.total)});
}));
router.get("/reports/movements", managers, wrap(async (req,res) => {
  const limit=Math.min(Math.max(Number(req.query.limit)||100,1),500);
  const [rows]=await pool.query("SELECT sm.*,p.name product_name,p.sku,u.name created_by_name FROM stock_movements sm JOIN products p ON p.id=sm.product_id JOIN users u ON u.id=sm.created_by ORDER BY sm.created_at DESC LIMIT ?",[limit]); res.json(rows);
}));
router.get("/users", admin, wrap(async (_req,res) => { const [rows]=await pool.query("SELECT id,name,email,role,active,created_at FROM users ORDER BY name"); res.json(rows); }));
router.post("/users", admin, wrap(async (req,res) => {
  const name=clean(req.body.name),email=clean(req.body.email).toLowerCase(),password=String(req.body.password||""),role=clean(req.body.role);
  if(!name||!/^\S+@\S+\.\S+$/.test(email)||password.length<10||!["ADMIN","STOCK_MANAGER","CASHIER","STOREKEEPER"].includes(role)) return res.status(400).json({message:"Enter a valid name, email, role and password (at least 10 characters)."});
  const hash=await bcrypt.hash(password,12);
  const [r]=await pool.execute("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)",[name,email,hash,role]);
  await audit(pool,req.user.id,"USER_CREATED","users",r.insertId,{email,role}); res.status(201).json({id:r.insertId});
}));
router.patch("/users/:id/status", admin, wrap(async (req,res) => {
  if(Number(req.params.id)===Number(req.user.id)) return res.status(400).json({message:"You cannot deactivate your own account."});
  const active=req.body.active===true?1:req.body.active===false?0:null; if(active===null) return res.status(400).json({message:"active must be true or false."});
  const [r]=await pool.execute("UPDATE users SET active=? WHERE id=?",[active,req.params.id]);
  if(!r.affectedRows) return res.status(404).json({message:"User not found."});
  await audit(pool,req.user.id,"USER_STATUS_CHANGED","users",req.params.id,{active:!!active}); res.json({message:"User status updated."});
}));
router.get("/audit-logs", admin, wrap(async (_req,res) => { const [rows]=await pool.query("SELECT a.*,u.name user_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 300"); res.json(rows); }));

router.get("/assistant/insights", staff, wrap(async (_req,res) => {
  const [[p]]=await pool.query("SELECT COUNT(*) products FROM products WHERE active=1");
  const [[low]]=await pool.query("SELECT COUNT(*) total FROM (SELECT p.id,p.min_quantity,"+stockSql+" qty FROM products p LEFT JOIN stock_movements sm ON sm.product_id=p.id WHERE p.active=1 GROUP BY p.id,p.min_quantity) z WHERE z.qty<=z.min_quantity");
  const [[s]]=await pool.query("SELECT COALESCE(SUM(total_amount),0) total FROM sales WHERE status='COMPLETED' AND DATE(created_at)=CURDATE()");
  const [[pend]]=await pool.query("SELECT COUNT(*) total FROM stock_requests WHERE status='PENDING'");
  const [suggestions]=await pool.query("SELECT p.name,p.sku,p.min_quantity,"+stockSql+" stock_quantity,GREATEST(p.min_quantity*2-"+stockSql+",0) suggested_reorder FROM products p LEFT JOIN stock_movements sm ON sm.product_id=p.id WHERE p.active=1 GROUP BY p.id,p.name,p.sku,p.min_quantity HAVING stock_quantity<=p.min_quantity ORDER BY stock_quantity ASC LIMIT 10");
  res.json({products:Number(p.products),lowStock:Number(low.total),todaySales:Number(s.total),pendingApprovals:Number(pend.total),suggestions});
}));

export default router;
