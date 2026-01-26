# GitHub Secrets Setup for Nano Banana Image Generator

This guide explains how to securely store API keys as GitHub secrets for the image generation workflow.

## Required Secrets

You need to add these 3 secrets to your GitHub repository:

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `GOOGLE_API_KEY` | Google AI API key from aistudio.google.com | `AIzaSyB...` |
| `SHOPIFY_STORE` | Your Shopify store domain | `oil-slick-pad.myshopify.com` |
| `SHOPIFY_ACCESS_TOKEN` | Shopify Admin API access token | `shpat_...` |

## Step-by-Step Instructions

### 1. Navigate to Repository Settings

1. Go to your GitHub repository: https://github.com/Yoshi420247/Shopify-Collection-strategy-and-menu-creation
2. Click **Settings** tab (top right)
3. In the left sidebar, click **Secrets and variables** → **Actions**

### 2. Add Each Secret

Click **New repository secret** and add each secret:

#### GOOGLE_API_KEY
- **Name:** `GOOGLE_API_KEY`
- **Secret:** Your Google AI API key (starts with `AIzaSy...`)
- Click **Add secret**

#### SHOPIFY_STORE
- **Name:** `SHOPIFY_STORE`
- **Secret:** `oil-slick-pad.myshopify.com`
- Click **Add secret**

#### SHOPIFY_ACCESS_TOKEN
- **Name:** `SHOPIFY_ACCESS_TOKEN`
- **Secret:** Your Shopify Admin API token (starts with `shpat_`)
- Click **Add secret**

### 3. Verify Secrets Are Set

After adding all secrets, you should see:
```
GOOGLE_API_KEY      Updated just now
SHOPIFY_ACCESS_TOKEN Updated just now
SHOPIFY_STORE       Updated just now
```

## Using the Image Generation Workflow

### Manual Trigger (GitHub Actions UI)

1. Go to **Actions** tab in your repository
2. Select **Generate Product Images** workflow
3. Click **Run workflow**
4. Fill in the inputs:
   - **prompt**: Describe the image (e.g., "Black matte mylar bag flat pouch 4x6 inches")
   - **model**: Choose `gemini` (fast) or `gemini-pro` (highest quality)
   - **aspect_ratio**: Usually `1:1` for product images
   - **product_id**: (Optional) Shopify product ID to auto-upload
   - **num_images**: Number of images to generate
5. Click **Run workflow**

### Example Prompts for Mylar Bags

```
Flat rectangular matte black mylar bag pouch, 4x6 inches, press-to-close seal strip at top,
lying flat on white background, professional product photography, no text or labels,
photorealistic, e-commerce style
```

```
Matte black mylar bag with clear window showing product inside, 5x8 inches, flat lay view,
professional studio lighting, white background, no text or branding
```

## Troubleshooting

### "API key not valid" Error
- Verify the key works at https://aistudio.google.com
- Check that "Generative Language API" is enabled
- Ensure no extra spaces when copying the key

### "Permission denied" Error
- Go to Google Cloud Console → APIs & Services
- Enable "Generative Language API"
- For Imagen models, enable billing

### Workflow Not Appearing
- Push the `.github/workflows/generate-images.yml` file to your repository
- Workflows only appear after the file is pushed to main/default branch

## Security Notes

- Never commit API keys directly to code
- GitHub secrets are encrypted and only exposed to workflow runs
- Secrets are masked in workflow logs
- Repository collaborators can use secrets but cannot view them
