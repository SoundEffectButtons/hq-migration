# Fix "Example Domain" – Manual tunnel setup

When "Preparing dev preview" never finishes, Shopify never gets a tunnel URL, so the app iframe still loads the old URL (example.com). Do this once:

## Step 1: Install Cloudflare Tunnel (one-time)

```bash
brew install cloudflare/cloudflare/cloudflared
```

(Or download from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/)

## Step 2: Start your app

In **Terminal 1**:

```bash
cd /Users/rohitthakur/highquality/ext/custom-scale-app
shopify app dev
```

Wait until you see:
- `React Router | ➜  Local:   http://localhost:XXXXX/`
- `proxy | Proxy server started on port XXXXX`

Note the **proxy port** (e.g. 50940).

## Step 3: Start tunnel (Terminal 2)

Open a **second terminal**. Use the **proxy port** from Step 2:

```bash
cloudflared tunnel --url http://localhost:50940
```

You’ll get a line like:
```
Your quick Tunnel has been created! Visit it at:
https://something-random-here.trycloudflare.com
```

Copy that `https://....trycloudflare.com` URL (no path).

## Step 4: Update Shopify Partners

1. Go to: **https://partners.shopify.com** → **Apps** → **CustomScale-app**
2. Open **Configuration** (or **App setup** / **URLs**).
3. Set:
   - **App URL:** `https://YOUR-URL.trycloudflare.com` (the URL from Step 3)
   - **Allowed redirection URL(s):** add  
     `https://YOUR-URL.trycloudflare.com/auth/callback`
4. **Save**.

## Step 5: Use the same URL in dev (optional)

So the CLI and your config use the same URL, update `shopify.app.toml`:

- `application_url = "https://YOUR-URL.trycloudflare.com"`
- `redirect_urls = [ "https://YOUR-URL.trycloudflare.com/auth/callback" ]`

(Use the same URL you put in Partners.)

## Step 6: Open the app in Admin

In Shopify Admin go to: **Apps** → **CustomScale-app**.

You should see **Product Editor Manager** instead of "Example Domain".

---

**Next time:**  
Keep `shopify app dev` running in Terminal 1. In Terminal 2 run `cloudflared tunnel --url http://localhost:PROXY_PORT` (same proxy port as before). Use the **same** tunnel URL in Partners if it didn’t change; if it’s a new URL, update Partners and `shopify.app.toml` again.
