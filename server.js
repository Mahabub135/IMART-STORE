require("dotenv").config();
const express = require("express");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const helmet = require("helmet");
const bcrypt = require("bcryptjs");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  store: new PgSession({ pool, createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || "development-only-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 1000 * 60 * 60 * 8 }
}));

// Keep the admin HTML page available at /admin; API data/actions are protected separately.
app.use(express.static(path.join(__dirname, "public"), { index: false }));

// Lightweight login throttling for this single-instance starter. For multi-instance production,
// move rate-limit state to a shared store such as Redis.
const loginAttempts = new Map();
function loginRateLimit(req, res, next) {
  const key = `${req.ip}:${String(req.body.email || "").toLowerCase().trim()}`;
  const now = Date.now();
  const record = loginAttempts.get(key);
  if (record && record.until > now && record.count >= 8) {
    res.set("Retry-After", String(Math.ceil((record.until - now) / 1000)));
    return res.status(429).json({ error: "Too many login attempts. Wait 15 minutes and try again." });
  }
  if (!record || record.until <= now) loginAttempts.set(key, { count: 1, until: now + 15 * 60 * 1000 });
  else record.count += 1;
  next();
}

async function initialize() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS customer_addresses (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      label TEXT NOT NULL DEFAULT 'Home',
      recipient_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT NOT NULL,
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(customer_id, label, address)
    );
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'iPhone',
      description TEXT DEFAULT '', price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
      original_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (original_price >= 0),
      stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0), image_url TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE products ADD COLUMN IF NOT EXISTS original_price NUMERIC(12,2) NOT NULL DEFAULT 0;
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY, customer_id INTEGER REFERENCES customers(id),
      customer_name TEXT NOT NULL, phone TEXT NOT NULL,
      address TEXT NOT NULL, items JSONB NOT NULL, total NUMERIC(12,2) NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'TRC20 USDT',
      payment_tx_hash TEXT DEFAULT '',
      payment_status TEXT NOT NULL DEFAULT 'Pending verification'
        CHECK (payment_status IN ('Pending verification','Paid','Rejected')),
      status TEXT NOT NULL DEFAULT 'Pending'
        CHECK (status IN ('Pending','Confirmed','Shipped','Delivered','Cancelled')),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id);
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'TRC20 USDT';
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_tx_hash TEXT DEFAULT '';
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'Pending verification';
    CREATE TABLE IF NOT EXISTS customer_wishlist (
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (customer_id, product_id)
    );
    CREATE TABLE IF NOT EXISTS product_reviews (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      review_text TEXT NOT NULL CHECK (char_length(review_text) BETWEEN 5 AND 1000),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (customer_id, product_id)
    );
  `);

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    const exists = await pool.query("SELECT id FROM admins WHERE email = $1", [email.toLowerCase()]);
    if (!exists.rowCount) {
      const hash = await bcrypt.hash(password, 12);
      await pool.query("INSERT INTO admins (email, password_hash) VALUES ($1, $2)", [email.toLowerCase(), hash]);
      console.log("Initial admin created.");
    }
  }

  const count = await pool.query("SELECT COUNT(*)::int AS count FROM products");
  if (count.rows[0].count === 0) {
    // Illustrative demo prices only, not a claim of a genuine 70% retail discount.
    const demo = [
      ["iPhone 16 · 128GB", "iPhone 16 Series", "Demo listing. Verify exact model, condition, warranty and price before sale.", 248.70, 829.00, 5, "https://images.unsplash.com/photo-1727471288322-9335f1f8a3b0?auto=format&fit=crop&w=900&q=80"],
      ["iPhone 16 Plus · 128GB", "iPhone 16 Series", "Demo listing. Verify exact model, condition, warranty and price before sale.", 299.70, 999.00, 3, "https://images.unsplash.com/photo-1727471288322-9335f1f8a3b0?auto=format&fit=crop&w=900&q=80"],
      ["iPhone 17 · 256GB", "iPhone 17 Series", "Demo listing. Verify exact model, condition, warranty and price before sale.", 269.70, 899.00, 5, "https://images.unsplash.com/photo-1727471288322-9335f1f8a3b0?auto=format&fit=crop&w=900&q=80"],
      ["iPhone 17e · 256GB", "iPhone 17 Series", "Demo listing. Verify exact model, condition, warranty and price before sale.", 209.70, 699.00, 4, "https://images.unsplash.com/photo-1727471288322-9335f1f8a3b0?auto=format&fit=crop&w=900&q=80"],
      ["iPhone 18 Pro · 256GB", "iPhone 18 Series", "Demo listing. Verify exact model, condition, warranty and price before sale.", 359.70, 1199.00, 2, "https://images.unsplash.com/photo-1727471288322-9335f1f8a3b0?auto=format&fit=crop&w=900&q=80"],
      ["iPhone 18 Pro Max · 256GB", "iPhone 18 Series", "Demo listing. Verify exact model, condition, warranty and price before sale.", 389.70, 1299.00, 2, "https://images.unsplash.com/photo-1727471288322-9335f1f8a3b0?auto=format&fit=crop&w=900&q=80"]
    ];
    for (const p of demo) {
      await pool.query("INSERT INTO products (name,category,description,price,original_price,stock,image_url) VALUES ($1,$2,$3,$4,$5,$6,$7)", p);
    }
  }
}

function requireAdmin(req, res, next) {
  if (!req.session.adminId) return res.status(401).json({ error: "Admin login required" });
  next();
}

app.get("/api/products", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.id,p.name,p.category,p.description,p.price,p.original_price,p.stock,p.image_url,
        COALESCE(rv.review_count,0)::int AS review_count,
        COALESCE(rv.average_rating,0)::numeric(3,2) AS average_rating
      FROM products p
      LEFT JOIN (
        SELECT product_id, COUNT(*) AS review_count, AVG(rating) AS average_rating
        FROM product_reviews GROUP BY product_id
      ) rv ON rv.product_id=p.id
      ORDER BY p.id DESC`);
    res.json(result.rows);
  } catch { res.status(500).json({ error: "Could not load products" }); }
});

// Wishlist: each customer's list is private and scoped to their authenticated session.
app.get("/api/my-wishlist", requireCustomer, async (req, res) => {
  try {
    const result = await pool.query(`SELECT p.id,p.name,p.category,p.price,p.original_price,p.stock,p.image_url
      FROM customer_wishlist w JOIN products p ON p.id=w.product_id
      WHERE w.customer_id=$1 ORDER BY w.created_at DESC`, [req.session.customerId]);
    res.json(result.rows);
  } catch { res.status(500).json({ error: "Could not load wishlist" }); }
});
app.post("/api/my-wishlist/:productId", requireCustomer, async (req, res) => {
  const productId = Number(req.params.productId);
  if (!Number.isInteger(productId) || productId < 1) return res.status(400).json({ error: "Invalid product" });
  try {
    const product = await pool.query("SELECT id FROM products WHERE id=$1", [productId]);
    if (!product.rowCount) return res.status(404).json({ error: "Product not found" });
    await pool.query("INSERT INTO customer_wishlist (customer_id,product_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [req.session.customerId, productId]);
    res.status(201).json({ message: "Added to wishlist" });
  } catch { res.status(500).json({ error: "Could not update wishlist" }); }
});
app.delete("/api/my-wishlist/:productId", requireCustomer, async (req, res) => {
  try {
    await pool.query("DELETE FROM customer_wishlist WHERE customer_id=$1 AND product_id=$2", [req.session.customerId, Number(req.params.productId)]);
    res.json({ message: "Removed from wishlist" });
  } catch { res.status(500).json({ error: "Could not update wishlist" }); }
});

// Reviews are public to read. Only customers with an order marked Paid may submit a review.
app.get("/api/products/:productId/reviews", async (req, res) => {
  const productId = Number(req.params.productId);
  if (!Number.isInteger(productId) || productId < 1) return res.status(400).json({ error: "Invalid product" });
  try {
    const result = await pool.query(`SELECT r.id,r.rating,r.review_text,r.created_at,c.name AS customer_name
      FROM product_reviews r JOIN customers c ON c.id=r.customer_id
      WHERE r.product_id=$1 ORDER BY r.created_at DESC LIMIT 100`, [productId]);
    res.json(result.rows);
  } catch { res.status(500).json({ error: "Could not load reviews" }); }
});
app.post("/api/products/:productId/reviews", requireCustomer, async (req, res) => {
  const productId = Number(req.params.productId);
  const rating = Number(req.body.rating);
  const reviewText = String(req.body.review_text || "").trim();
  if (!Number.isInteger(productId) || productId < 1 || !Number.isInteger(rating) || rating < 1 || rating > 5 || reviewText.length < 5 || reviewText.length > 1000)
    return res.status(400).json({ error: "Select 1–5 stars and write a review of 5–1000 characters." });
  try {
    const product = await pool.query("SELECT id FROM products WHERE id=$1", [productId]);
    if (!product.rowCount) return res.status(404).json({ error: "Product not found" });
    const purchase = await pool.query(`SELECT 1 FROM orders o
      WHERE o.customer_id=$1 AND o.payment_status='Paid'
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(o.items) AS item WHERE item->>'id'=$2::text)
      LIMIT 1`, [req.session.customerId, productId]);
    if (!purchase.rowCount) return res.status(403).json({ error: "Only customers with a verified paid order for this product can review it." });
    const result = await pool.query(`INSERT INTO product_reviews (customer_id,product_id,rating,review_text)
      VALUES ($1,$2,$3,$4) RETURNING id,rating,review_text,created_at`, [req.session.customerId, productId, rating, reviewText]);
    res.status(201).json({ message: "Review published", review: result.rows[0] });
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: "You have already reviewed this product." });
    res.status(500).json({ error: "Could not publish review" });
  }
});

app.get("/api/payment-info", (req, res) => {
  res.json({ method: "USDT TRC20", walletAddress: process.env.TRC20_WALLET_ADDRESS || "", configured: Boolean(process.env.TRC20_WALLET_ADDRESS) });
});

function requireCustomer(req, res, next) {
  if (!req.session.customerId) return res.status(401).json({ error: "Please register or log in first" });
  next();
}
app.post("/api/auth/register", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email) || password.length < 10)
      return res.status(400).json({ error: "Enter your name, a valid email and a password with at least 10 characters" });
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query("INSERT INTO customers (name,email,password_hash) VALUES ($1,$2,$3) RETURNING id,name,email", [name,email,hash]);
    req.session.customerId = result.rows[0].id;
    req.session.customerName = result.rows[0].name;
    req.session.customerEmail = result.rows[0].email;
    res.status(201).json({ message: "Registration successful", customer: result.rows[0] });
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: "This email is already registered. Please log in." });
    res.status(500).json({ error: "Registration failed" });
  }
});
app.post("/api/auth/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const result = await pool.query("SELECT id,name,email,password_hash FROM customers WHERE email=$1", [email]);
    if (!result.rowCount || !(await bcrypt.compare(password, result.rows[0].password_hash)))
      return res.status(401).json({ error: "Email or password is incorrect" });
    req.session.regenerate(err => {
      if (err) return res.status(500).json({ error: "Could not start session" });
      req.session.customerId = result.rows[0].id;
      req.session.customerName = result.rows[0].name;
      req.session.customerEmail = result.rows[0].email;
      res.json({ message: "Logged in", customer: { id: result.rows[0].id, name: result.rows[0].name, email: result.rows[0].email } });
    });
  } catch { res.status(500).json({ error: "Login failed" }); }
});
app.get("/api/auth/me", (req, res) => {
  if (!req.session.customerId) return res.status(401).json({ error: "Not logged in" });
  res.json({ id: req.session.customerId, name: req.session.customerName, email: req.session.customerEmail });
});
app.post("/api/auth/logout", (req, res) => {
  delete req.session.customerId; delete req.session.customerName; delete req.session.customerEmail;
  req.session.save(() => res.json({ message: "Logged out" }));
});
app.get("/api/my-addresses", requireCustomer, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id,label,recipient_name,phone,address,is_default FROM customer_addresses WHERE customer_id=$1 ORDER BY is_default DESC, created_at DESC",
      [req.session.customerId]
    );
    res.json(result.rows);
  } catch { res.status(500).json({ error: "Could not load saved addresses" }); }
});
app.post("/api/my-addresses", requireCustomer, async (req, res) => {
  const label = String(req.body.label || "Home").trim().slice(0, 40) || "Home";
  const recipient_name = String(req.body.recipient_name || req.session.customerName || "").trim().slice(0, 120);
  const phone = String(req.body.phone || "").trim().slice(0, 40);
  const address = String(req.body.address || "").trim().slice(0, 500);
  const makeDefault = req.body.is_default !== false;
  if (recipient_name.length < 2 || !phone || address.length < 8)
    return res.status(400).json({ error: "Enter recipient name, phone and full delivery address" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (makeDefault) await client.query("UPDATE customer_addresses SET is_default=FALSE WHERE customer_id=$1", [req.session.customerId]);
    const result = await client.query(
      `INSERT INTO customer_addresses (customer_id,label,recipient_name,phone,address,is_default)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (customer_id,label,address) DO UPDATE SET recipient_name=EXCLUDED.recipient_name, phone=EXCLUDED.phone, is_default=EXCLUDED.is_default
       RETURNING id,label,recipient_name,phone,address,is_default`,
      [req.session.customerId,label,recipient_name,phone,address,makeDefault]
    );
    await client.query("COMMIT");
    res.status(201).json(result.rows[0]);
  } catch { await client.query("ROLLBACK"); res.status(500).json({ error: "Could not save address" }); }
  finally { client.release(); }
});
app.delete("/api/my-addresses/:id", requireCustomer, async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM customer_addresses WHERE id=$1 AND customer_id=$2 RETURNING id", [req.params.id, req.session.customerId]);
    if (!result.rowCount) return res.status(404).json({ error: "Saved address not found" });
    res.json({ message: "Address deleted" });
  } catch { res.status(500).json({ error: "Could not delete address" }); }
});

app.get("/api/my-orders", requireCustomer, async (req, res) => {
  try {
    const result = await pool.query("SELECT id,items,total,payment_method,payment_tx_hash,payment_status,status,created_at FROM orders WHERE customer_id=$1 ORDER BY created_at DESC", [req.session.customerId]);
    res.json(result.rows);
  } catch { res.status(500).json({ error: "Could not load orders" }); }
});

app.post("/api/orders", requireCustomer, async (req, res) => {
  const { phone, address, items, payment_tx_hash } = req.body || {};
  if (!phone?.trim() || !address?.trim() || !Array.isArray(items) || !items.length)
    return res.status(400).json({ error: "Phone, delivery address and cart items are required" });
  const count = items.reduce((sum, item) => sum + (Number.isInteger(Number(item.quantity)) ? Number(item.quantity) : 0), 0);
  if (count < 5) return res.status(400).json({ error: "Delivery confirmation requires at least 5 total products in the order." });
  if (!process.env.TRC20_WALLET_ADDRESS) return res.status(503).json({ error: "TRC20 wallet address is not configured by the store admin yet. Please try later." });
  if (!String(payment_tx_hash || "").trim()) return res.status(400).json({ error: "Enter the TRC20 transaction hash after making payment." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let total = 0;
    const verified = [];
    for (const item of items) {
      const id = Number(item.id), quantity = Number(item.quantity);
      if (!Number.isInteger(id) || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw new Error("Invalid cart item");
      const found = await client.query("SELECT id,name,price,stock FROM products WHERE id=$1 FOR UPDATE", [id]);
      if (!found.rowCount || found.rows[0].stock < quantity) throw new Error("A product is unavailable or out of stock");
      const p = found.rows[0]; total += Number(p.price) * quantity;
      verified.push({ id: p.id, name: p.name, price: Number(p.price), quantity });
    }
    for (const item of verified) await client.query("UPDATE products SET stock = stock - $1 WHERE id = $2", [item.quantity, item.id]);
    const customer = await client.query("SELECT name,email FROM customers WHERE id=$1", [req.session.customerId]);
    const order = await client.query(
      "INSERT INTO orders (customer_id,customer_name,phone,address,items,total,payment_method,payment_tx_hash,payment_status) VALUES ($1,$2,$3,$4,$5,$6,'USDT TRC20',$7,'Pending verification') RETURNING id",
      [req.session.customerId, customer.rows[0].name, phone.trim(), address.trim(), JSON.stringify(verified), total.toFixed(2), String(payment_tx_hash).trim()]
    );
    await client.query("COMMIT");
    res.status(201).json({ message: "Order submitted. Payment and delivery require admin verification.", order_id: order.rows[0].id, payment_status: "Pending verification", delivery_minimum_met: true });
  } catch (e) {
    await client.query("ROLLBACK"); res.status(400).json({ error: e.message || "Could not place order" });
  } finally { client.release(); }
});

app.post("/api/admin/login", loginRateLimit, async (req, res) => {
  try {
    const email = String(req.body.email || "").toLowerCase().trim();
    const password = String(req.body.password || "");
    const result = await pool.query("SELECT id,email,password_hash FROM admins WHERE email=$1", [email]);
    if (!result.rowCount || !(await bcrypt.compare(password, result.rows[0].password_hash)))
      return res.status(401).json({ error: "Email or password is incorrect" });
    req.session.regenerate(err => {
      if (err) return res.status(500).json({ error: "Could not start session" });
      req.session.adminId = result.rows[0].id;
      req.session.adminEmail = result.rows[0].email;
      res.json({ message: "Logged in", email: result.rows[0].email });
    });
  } catch { res.status(500).json({ error: "Login failed" }); }
});
app.post("/api/admin/logout", (req, res) => req.session.destroy(() => res.json({ message: "Logged out" })));
app.get("/api/admin/me", requireAdmin, (req, res) => res.json({ email: req.session.adminEmail }));
app.get("/api/admin/orders", requireAdmin, async (req, res) => {
  const result = await pool.query("SELECT * FROM orders ORDER BY created_at DESC LIMIT 200");
  res.json(result.rows);
});
app.patch("/api/admin/orders/:id/payment", requireAdmin, async (req, res) => {
  const allowed = ["Pending verification", "Paid", "Rejected"];
  if (!allowed.includes(req.body.payment_status)) return res.status(400).json({ error: "Invalid payment status" });
  const result = await pool.query("UPDATE orders SET payment_status=$1 WHERE id=$2 RETURNING id,payment_status", [req.body.payment_status, req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: "Order not found" });
  res.json(result.rows[0]);
});
app.patch("/api/admin/orders/:id", requireAdmin, async (req, res) => {
  const allowed = ["Pending","Confirmed","Shipped","Delivered","Cancelled"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: "Invalid status" });
  if (["Confirmed", "Shipped", "Delivered"].includes(req.body.status)) {
    const check = await pool.query("SELECT payment_status,items FROM orders WHERE id=$1", [req.params.id]);
    if (!check.rowCount) return res.status(404).json({ error: "Order not found" });
    const units = (check.rows[0].items || []).reduce((n, item) => n + Number(item.quantity || 0), 0);
    if (units < 5) return res.status(400).json({ error: "Delivery requires at least 5 product units" });
    if (check.rows[0].payment_status !== "Paid") return res.status(400).json({ error: "Verify TRC20 payment before confirming delivery" });
  }
  const result = await pool.query("UPDATE orders SET status=$1 WHERE id=$2 RETURNING id,status", [req.body.status, req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: "Order not found" });
  res.json(result.rows[0]);
});
app.post("/api/admin/products", requireAdmin, async (req, res) => {
  const { name, category, description, price, original_price, stock, image_url } = req.body || {};
  if (!name?.trim() || !Number.isFinite(Number(price)) || Number(price) < 0 ||
      !Number.isFinite(Number(original_price)) || Number(original_price) < 0 ||
      !Number.isInteger(Number(stock)) || Number(stock) < 0)
    return res.status(400).json({ error: "Valid name, sale price, original price and stock are required" });
  if (Number(price) > Number(original_price) && Number(original_price) > 0)
    return res.status(400).json({ error: "Sale price should not be higher than original price" });
  const result = await pool.query(
    "INSERT INTO products (name,category,description,price,original_price,stock,image_url) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *",
    [name.trim(), category || "iPhone", description || "", Number(price), Number(original_price), Number(stock), image_url || ""]
  );
  res.status(201).json(result.rows[0]);
});
app.patch("/api/admin/products/:id", requireAdmin, async (req, res) => {
  const { name, category, description, price, original_price, stock, image_url } = req.body || {};
  if (!name?.trim() || !Number.isFinite(Number(price)) || Number(price) < 0 ||
      !Number.isFinite(Number(original_price)) || Number(original_price) < 0 ||
      !Number.isInteger(Number(stock)) || Number(stock) < 0)
    return res.status(400).json({ error: "Valid name, sale price, original price and stock are required" });
  if (Number(price) > Number(original_price) && Number(original_price) > 0)
    return res.status(400).json({ error: "Sale price should not be higher than original price" });
  const result = await pool.query(
    "UPDATE products SET name=$1,category=$2,description=$3,price=$4,original_price=$5,stock=$6,image_url=$7 WHERE id=$8 RETURNING *",
    [name.trim(), category || "iPhone", description || "", Number(price), Number(original_price), Number(stock), image_url || "", req.params.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: "Product not found" });
  res.json(result.rows[0]);
});
app.delete("/api/admin/products/:id", requireAdmin, async (req, res) => {
  const result = await pool.query("DELETE FROM products WHERE id=$1 RETURNING id", [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: "Product not found" });
  res.json({ message: "Product deleted" });
});
// Admin page: open by adding /admin to the website URL.
// Both /admin and /admin/ serve the same login page; APIs remain protected by requireAdmin.
app.get(["/admin", "/admin/"], (req, res) => {
  res.set("Cache-Control", "no-store, max-age=0");
  res.set("X-Robots-Tag", "noindex, nofollow");
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

const port = process.env.PORT || 3000;
if (process.env.NODE_ENV === "production" && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32 || process.env.SESSION_SECRET === "development-only-change-me")) {
  console.error("Startup blocked: set SESSION_SECRET to a random value of at least 32 characters in production.");
  process.exit(1);
}
initialize().then(() => app.listen(port, () => console.log(`Store running on port ${port}`)))
  .catch(err => { console.error("Startup failed:", err); process.exit(1); });
