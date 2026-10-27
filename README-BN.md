# Imart Store — Customer Accounts + USDT TRC20

## Added
- Customer registration and login (passwords hashed with bcrypt)
- Checkout requires login and collects phone + full delivery address
- Minimum 5 total product units per order to submit for delivery confirmation
- USDT TRC20 payment instructions and transaction hash entry
- Admin can manually mark payment as Paid / Rejected and update delivery status
- Customer can save multiple delivery addresses, reuse a saved address at checkout, and delete old addresses
- Saved addresses are private to the logged-in customer in PostgreSQL
- Customer can see their own order and payment status

## Saved delivery address
- Customer login করার পর checkout-এ address, recipient name এবং phone দিলে “Save this address” checked থাকলে address database-এ save হবে।
- পরের order-এ saved address dropdown থেকে নির্বাচন করলে তথ্য auto-fill হবে। Customer চাইলে saved address delete করতে পারবে।
- এই feature-এর জন্য Google Maps/API বা GPS দরকার নেই; এটি customer-এর আগে দেওয়া address পুনরায় ব্যবহার করে।

## Admin Panel (`/admin`)
- Admin page: `https://YOUR-SITE.onrender.com/admin`
- Admin login uses `ADMIN_EMAIL` and `ADMIN_PASSWORD` environment variables to create the first admin account at startup if that email is not already in the `admins` table.
- Render Environment → add `ADMIN_EMAIL`, `ADMIN_PASSWORD` (use a unique long password), and `SESSION_SECRET` (random 32+ character secret). Do not put these values in GitHub or share them in screenshots.
- The admin HTML page can show the login form publicly, but order/product APIs check the server-side admin session on every protected request. Knowing `/admin` does not grant admin access.
- Admin login is rate-limited in this single-instance starter. For multi-instance production, use a shared rate-limit store and conduct a security review.
- If an admin account already exists, changing `ADMIN_PASSWORD` alone does not reset its database password. Do not delete database rows unless you understand the consequences; ask for a safe password-reset migration if needed.

## TRC20 setup (must do before checkout can work)
1. Create/use your own receiving wallet and confirm it supports USDT on TRON (TRC20).
2. In hosting Environment Variables set `TRC20_WALLET_ADDRESS` to the public receiving address only.
3. Never add seed phrase/private key to the website, source code or environment variables.
4. Customer sends payment on the correct network and enters transaction hash. Admin must independently verify transaction on a reputable TRON explorer before setting payment to Paid. Do not trust a submitted hash alone.
5. This is manual verification, not automatic blockchain payment verification. Do not mark delivery confirmed until payment and delivery conditions are checked.

## Deploy
- Build: `npm install`
- Start: `npm start`
- Required environment variables: `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `NODE_ENV=production`, `TRC20_WALLET_ADDRESS`.
- Never commit `.env` or secrets to GitHub. In Render, set `NODE_ENV=production` and a random `SESSION_SECRET` of at least 32 characters.
- Free hosting can sleep and database plans may expire; verify provider limits and arrange backups.

## Important
Demo product prices and 70% LESS badge are placeholders. Confirm truthful regular/sale prices, inventory, warranty, shipping terms and local legal/tax requirements before real sales. This starter has no automated payment gateway or full production security audit.


## Admin পেজের সরাসরি লিংক

Deploy হওয়ার পর ওয়েবসাইটের URL-এর শেষে `/admin` যোগ করলেই Admin Login পেজ খুলবে। উদাহরণ: `https://your-site.onrender.com/admin`। `/admin/`-ও একই পেজ খুলবে। Admin API-তে server-side session/authorization বাধ্যতামূলক।


## Premium Black + Silver, Wishlist ও Reviews আপডেট

- নতুন ডিজাইন `public/index.html` ও `public/style.css`-এ।
- Wishlist এবং customer review API `server.js`-এ যোগ করা হয়েছে।
- `customer_wishlist` ও `product_reviews` টেবিল `CREATE TABLE IF NOT EXISTS` দিয়ে তৈরি হয়; পুরোনো customer/order/address/product/admin টেবিল ড্রপ করা হয় না।
- Wishlist account-specific; সাইন-ইন ছাড়া সংরক্ষণ করা যায় না।
- Review শুধু তখনই পোস্ট করা যায়, যখন ঐ কাস্টমারের ঐ পণ্যের অর্ডার Admin-এর দ্বারা `Paid` হিসেবে যাচাই করা হয়েছে। প্রতি কাস্টমার/পণ্যে একটি review।
- পুরোনো অর্ডার, account, saved address, Admin Panel (`/admin`), minimum 5-unit order rule এবং TRC20 manual verification flow রাখা হয়েছে।

### Database migration safety

1. Render PostgreSQL-এর backup/snapshot আগে তৈরি করুন (যদি আপনার প্ল্যানে সুবিধা থাকে)।
2. `database/schema.sql`-এ নতুন additive `CREATE TABLE IF NOT EXISTS` অংশ আছে। বর্তমান `server.js` startup-এও একই টেবিলগুলো নিরাপদভাবে তৈরি হবে।
3. বিদ্যমান database মুছবেন না, নতুন empty database-এ DATABASE_URL বদলাবেন না, এবং `DROP TABLE` চালাবেন না।
4. Deploy শেষে homepage, login, `/admin`, existing orders, saved addresses, wishlist এবং reviews পরীক্ষা করুন।

### Android GitHub update

1. ZIP extract করুন।
2. GitHub repository-তে `public/index.html`, `public/style.css`, `public/app.js`, `server.js`, `database/schema.sql`, `README-BN.md`-এর একই path-এ ফাইলগুলো replace করুন।
3. `package.json`-এ নতুন dependency লাগেনি; node_modules upload করবেন না।
4. Commit changes দিন এবং Render deploy শেষ হওয়া পর্যন্ত অপেক্ষা করুন।
5. Render Environment Variables-এ বর্তমান `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `TRC20_WALLET_ADDRESS` পরিবর্তন করবেন না যদি না সেগুলোর সঠিক মান আপনার কাছে থাকে। কোনো secret GitHub-এ দেবেন না।
