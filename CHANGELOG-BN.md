# Imart Store — আপডেট নোট (2026-10-27)

## এই আপডেটে
- Premium Black + Silver responsive storefront design
- Product cards, improved search and clearer stock/price display
- Account-based Wishlist API and UI
- Customer reviews and star ratings
- Review submission restricted to a customer with a matching order marked `Paid` by Admin
- Existing `/admin`, customer login, saved addresses, cart/order submission, minimum 5-unit rule and TRC20 manual verification flow retained

## Database safety
- `server.js` creates `customer_wishlist` and `product_reviews` using `CREATE TABLE IF NOT EXISTS` during startup.
- Optional migration file: `database/migrations_20261027_wishlist_reviews.sql`.
- Migration is additive. Do not delete the existing database or run DROP TABLE commands.
- Before deployment, create a Render PostgreSQL backup/snapshot if available and retain current environment variables.

## Limitations to know
- TRC20 transaction hashes are still manually verified by the store Admin; this update does not add automatic blockchain verification.
- The customer can submit only one review per product, and only after an Admin marks a matching order's payment status as `Paid`.
- The source files have passed Node.js syntax checks. Live database/deployment testing must be completed on your Render instance.
