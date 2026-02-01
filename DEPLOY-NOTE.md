# Deploy was stuck – cart-pricing temporarily removed

**What happened:** `shopify app deploy` was hanging at "Bundling theme extension custom-cloth-editor..." because the **cart-pricing** function build never finished (`shopify app function build` hangs).

**What we did:** The `cart-pricing` extension was moved to `cart-pricing-backup/` (outside `extensions/`) so deploy only runs the theme extension and can complete.

**Deploy again:**
```bash
cd /Users/rohitthakur/highquality/ext/custom-scale-app
shopify app deploy
```
This should finish in 1–2 minutes with only the **custom-cloth-editor** theme extension.

---

## Restore cart-pricing later

When you want the cart-pricing function back:

1. Move the folder back:
   ```bash
   mv cart-pricing-backup extensions/cart-pricing
   ```

2. Fix the function build (it may need to be run from the app root or with network):
   ```bash
   cd extensions/cart-pricing
   npm install
   npm run build
   ```
   If it still hangs, try from the app root: `shopify app function build --path extensions/cart-pricing`

3. Run `shopify app deploy` again.

Your theme extension and admin app will work without the function; the function is only for cart price calculation.
