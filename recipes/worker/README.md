# Recipe Box helper (Cloudflare Worker)

Recipe Box runs entirely on your phone, so it needs a small helper in the cloud for two things:

1. **Importing recipe links.** Browsers won't let one website read another website's pages, so the Worker downloads the page for the app.
2. **Scanning cookbook photos.** The Worker sends the photo to an open-weight vision model (Qwen, Mistral, Gemma or Llama) that Cloudflare runs for you on **Workers AI**, and returns the recipe.

It's all on Cloudflare's free plan, only answers your Recipe Box, and doesn't store your photos.

## Setup (about 10 minutes, no coding)

### 1. Create the Worker
1. Sign in at [dash.cloudflare.com](https://dash.cloudflare.com).
2. In the left sidebar open **Compute (Workers)** → **Workers & Pages**, then **Create** → **Create Worker**. (Cloudflare renames menus now and then; look for "Workers".)
3. Name it `recipe-proxy` and click **Deploy**. This deploys a "Hello World" example.

### 2. Put in the Recipe Box code
1. Click **Edit code**.
2. Delete everything in the editor and paste in the whole of [`worker.js`](worker.js). Tip: on that page, tap **Raw**, then select all and copy.
3. Click **Deploy**.

### 3. Turn on AI (for photo scanning)
1. Go back to the Worker's page and open the **Settings** tab.
2. Under **Bindings**, click **Add** → **Workers AI**.
3. For the variable name, type `AI` (capital letters, exactly), then **Deploy** or **Save**.

### 4. Connect the app
1. Copy your Worker's address from its page. It looks like `https://recipe-proxy.<your-name>.workers.dev`.
2. In Recipe Box open **Settings → Recipe import**, paste the address and tap **Test**. You should see:
   - ✓ Recipe links: working
   - ✓ Photo scanning: ready

Now use **Add recipe → From a cookbook photo or text → Scan photo**.

### 5. (Optional) Lock it to your app
Anyone who finds your Worker's address could try to use your free AI allowance. To prevent that:
1. In the Worker's **Settings → Variables and Secrets**, click **Add**, choose type **Secret**, name it `APP_KEY`, and set any password-like value. Deploy.
2. In Recipe Box **Settings → App key**, enter the same value.

## Choosing a model

**Settings → Photo scanning model** lets you switch models. Try your trickiest cookbook page with each:

| Model | Notes |
|---|---|
| Qwen 3.8 27B (default) | Newest; strong at reading documents. It "thinks" first, so it can take 30–60 s. |
| Mistral Small 3.1 24B | Good all-rounder. |
| Gemma 3 12B | Smallest and fastest; may slip on hard layouts. |
| Llama 3.2 11B Vision | Meta requires a one-time license agreement before first use, and it reads one photo at a time. Skip unless the others struggle. |

## Cost and limits

Workers AI includes a free daily allowance, and occasional recipe scans should normally fit inside it. Check Cloudflare's current Workers AI pricing page for the exact numbers. If you run past the free allowance, scans stop working until the next day (unless you've added a paid plan). Link imports don't use AI and aren't affected.

## Updating

When Recipe Box gets a new `worker.js`, repeat step 2 (paste and deploy). Your AI binding and secret stay in place.

## Troubleshooting

- **"Photo scanning: this Worker has the old code"**: repeat step 2.
- **"add a Workers AI binding named AI"**: repeat step 3 and check the name is exactly `AI`.
- **"Wrong or missing app key"**: the key in the app must match the `APP_KEY` secret exactly.
- **A site won't import**: a few big sites block automated downloads. Use **Scan photo** on a screenshot, or copy the text.
- **Hosting the app somewhere else**: add that address to `ALLOWED_ORIGINS` at the top of `worker.js`.
