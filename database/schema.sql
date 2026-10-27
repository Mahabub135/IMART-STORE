CREATE TABLE IF NOT EXISTS customers (id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS admins (id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS products (id SERIAL PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'iPhone', description TEXT DEFAULT '', price NUMERIC(12,2) NOT NULL CHECK(price>=0), original_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(original_price>=0), stock INTEGER NOT NULL DEFAULT 0 CHECK(stock>=0), image_url TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS orders (id SERIAL PRIMARY KEY, customer_id INTEGER REFERENCES customers(id), customer_name TEXT NOT NULL, phone TEXT NOT NULL, address TEXT NOT NULL, items JSONB NOT NULL, total NUMERIC(12,2) NOT NULL, payment_method TEXT NOT NULL DEFAULT 'USDT TRC20', payment_tx_hash TEXT DEFAULT '', payment_status TEXT NOT NULL DEFAULT 'Pending verification' CHECK(payment_status IN ('Pending verification','Paid','Rejected')), status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Confirmed','Shipped','Delivered','Cancelled')), created_at TIMESTAMPTZ DEFAULT NOW());

-- Additive migration for wishlist and verified product reviews. Existing customer, order,
-- address, product and admin data are not deleted or modified.
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
