# iMart (no npm install needed)

Needs Node 22.13 or newer. Nothing to install, no PostgreSQL: data is saved in `data.db`.

    node server.js

Open http://localhost:3000. Admin: /admin (the password prints in the terminal, or set ADMIN_EMAIL and ADMIN_PASSWORD).
Set TRC20_WALLET_ADDRESS to your public USDT (TRC20) address. Never put a seed phrase or private key anywhere.

Before selling: log in as admin, tap Edit on each phone and enter the real price, stock and photo path (put photos in public/img).
Check each USDT payment in a TRON explorer before marking the order Paid.
