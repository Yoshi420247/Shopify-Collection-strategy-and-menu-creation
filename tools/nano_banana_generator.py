#!/usr/bin/env python3
"""
Nano Banana Image Generator
===========================
Uses Google's Gemini/Imagen models for high-quality product image generation.

Supported Models:
- gemini-2.0-flash-exp (Gemini 2.0 with image output - recommended)
- imagen-3.0-generate-002 (Imagen 3)
- imagen-4.0-ultra-generate-001 (Imagen 4 Ultra - highest quality)

SETUP REQUIRED:
1. Go to https://aistudio.google.com/apikey
2. Create or use an existing API key
3. The API key must have "Generative Language API" enabled
4. For Imagen models, billing must be enabled on your Google Cloud project

Usage:
    python nano_banana_generator.py "Product description prompt" --output image.png
    python nano_banana_generator.py "Product description prompt" --aspect 1:1 --model gemini
    python nano_banana_generator.py --test  # Test API key
"""

import argparse
import base64
import json
import os
import sys
import time
from pathlib import Path
from typing import Optional

try:
    import requests
except ImportError:
    print("Installing requests...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "requests", "-q"])
    import requests

# Configuration - Set these environment variables:
# GOOGLE_API_KEY - Your Google AI API key from https://aistudio.google.com/apikey
# SHOPIFY_ACCESS_TOKEN - Your Shopify Admin API access token
# SHOPIFY_STORE - Your Shopify store domain (e.g., mystore.myshopify.com)
API_KEY = os.environ.get("GOOGLE_API_KEY", "")
BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

# Model configurations - Updated January 2026
# Note: gemini-2.0-flash-exp was retired. Using latest models.
MODELS = {
    # Gemini 2.5 Flash Image - Production-ready (recommended)
    "gemini": {
        "id": "gemini-2.5-flash-image",
        "endpoint": "generateContent",
        "type": "gemini",
        "description": "Gemini 2.5 Flash Image - Fast, production-ready (recommended)"
    },
    # Gemini 3 Pro Image Preview - Highest quality
    "gemini-pro": {
        "id": "gemini-3-pro-image-preview",
        "endpoint": "generateContent",
        "type": "gemini",
        "description": "Gemini 3 Pro Image Preview - Professional asset production"
    },
    # Legacy alias for backwards compatibility
    "gemini-2.5": {
        "id": "gemini-2.5-flash-image",
        "endpoint": "generateContent",
        "type": "gemini",
        "description": "Gemini 2.5 Flash Image (alias)"
    },
    # Imagen models (require billing)
    "imagen3": {
        "id": "imagen-3.0-generate-002",
        "endpoint": "predict",
        "type": "imagen",
        "description": "Imagen 3 - High quality"
    },
    "imagen4": {
        "id": "imagen-4.0-generate-001",
        "endpoint": "predict",
        "type": "imagen",
        "description": "Imagen 4 Standard"
    },
    "imagen4-ultra": {
        "id": "imagen-4.0-ultra-generate-001",
        "endpoint": "predict",
        "type": "imagen",
        "description": "Imagen 4 Ultra - Maximum quality"
    },
}

# Supported aspect ratios
ASPECT_RATIOS = ["1:1", "3:4", "4:3", "9:16", "16:9"]

# Image sizes for Imagen
IMAGE_SIZES = ["1024x1024", "1536x1536", "2048x2048"]


def test_api_key(verbose: bool = True) -> dict:
    """Test if the API key is valid and has required permissions."""

    if not API_KEY:
        if verbose:
            print("[Nano Banana] ERROR: GOOGLE_API_KEY environment variable not set")
            print("Set it with: export GOOGLE_API_KEY='your-api-key'")
        return {"success": False, "error": "GOOGLE_API_KEY not set"}

    if verbose:
        print(f"[Nano Banana] Testing API key: {API_KEY[:20]}...")

    # Test with a simple text generation using latest model
    endpoint = f"{BASE_URL}/models/gemini-2.5-flash-image:generateContent"
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": API_KEY
    }

    payload = {
        "contents": [{
            "parts": [{"text": "Say 'API key working' in exactly 3 words"}]
        }]
    }

    try:
        response = requests.post(endpoint, headers=headers, json=payload, timeout=30)

        if response.status_code == 200:
            if verbose:
                print("[Nano Banana] ✓ API key is valid!")
                print("[Nano Banana] ✓ Generative Language API is enabled")
            return {"success": True, "message": "API key valid"}
        elif response.status_code == 403:
            error_info = """
API Key Permission Error (403)
==============================
Your API key doesn't have the required permissions.

To fix this:
1. Go to https://aistudio.google.com/apikey
2. Create a new API key OR
3. Go to Google Cloud Console > APIs & Services > Enabled APIs
4. Enable "Generative Language API"
5. If using Imagen models, enable billing on your project

Current key: {key}
""".format(key=API_KEY[:30] + "...")
            if verbose:
                print(error_info)
            return {"success": False, "error": "Permission denied (403)", "help": error_info}
        else:
            if verbose:
                print(f"[Nano Banana] API Error: {response.status_code}")
            return {"success": False, "error": f"API error: {response.status_code}"}

    except Exception as e:
        if verbose:
            print(f"[Nano Banana] Connection error: {e}")
        return {"success": False, "error": str(e)}


def generate_image_gemini(
    prompt: str,
    model_id: str,
    aspect_ratio: str = "1:1",
    verbose: bool = True
) -> dict:
    """Generate image using Gemini model with native image output."""

    endpoint = f"{BASE_URL}/models/{model_id}:generateContent"

    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": API_KEY
    }

    # Enhanced prompt for product photography
    enhanced_prompt = f"""Generate a professional e-commerce product photograph.

{prompt}

Style requirements:
- Clean white or soft gradient background
- Professional studio lighting
- Sharp focus, high detail
- Commercial quality suitable for online retail
- No text, watermarks, or logos
- Photorealistic rendering"""

    # Updated payload format for Gemini 2.5+ models
    payload = {
        "contents": [{
            "parts": [{"text": enhanced_prompt}]
        }],
        "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"],
            "imageConfig": {
                "aspectRatio": aspect_ratio
            }
        }
    }

    if verbose:
        print(f"[Nano Banana] Using model: {model_id}")
        print(f"[Nano Banana] Aspect ratio: {aspect_ratio}")
        print(f"[Nano Banana] Generating image...")

    try:
        response = requests.post(endpoint, headers=headers, json=payload, timeout=180)

        if response.status_code != 200:
            return {"success": False, "error": f"API error {response.status_code}: {response.text[:500]}"}

        result = response.json()
        candidates = result.get("candidates", [])

        if not candidates:
            return {"success": False, "error": "No response candidates"}

        parts = candidates[0].get("content", {}).get("parts", [])

        image_data = None
        text_response = None

        for part in parts:
            # Handle both camelCase (inlineData) and snake_case (inline_data) formats
            inline_data = part.get("inlineData") or part.get("inline_data")
            if inline_data:
                image_data = inline_data.get("data")
            elif "text" in part:
                text_response = part["text"]

        if image_data:
            return {
                "success": True,
                "image_data": image_data,
                "text": text_response,
                "model": model_id
            }
        else:
            return {
                "success": False,
                "error": "No image in response",
                "text": text_response
            }

    except Exception as e:
        return {"success": False, "error": str(e)}


def generate_image_imagen(
    prompt: str,
    model_id: str,
    aspect_ratio: str = "1:1",
    num_images: int = 1,
    verbose: bool = True
) -> dict:
    """Generate image using Imagen model."""

    endpoint = f"{BASE_URL}/models/{model_id}:predict"

    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": API_KEY
    }

    # Enhanced prompt for product photography
    enhanced_prompt = f"""Professional e-commerce product photograph, studio lighting, white background, sharp focus, commercial quality: {prompt}"""

    payload = {
        "instances": [{"prompt": enhanced_prompt}],
        "parameters": {
            "sampleCount": num_images,
            "aspectRatio": aspect_ratio
        }
    }

    if verbose:
        print(f"[Nano Banana] Using Imagen model: {model_id}")
        print(f"[Nano Banana] Generating {num_images} image(s)...")

    try:
        response = requests.post(endpoint, headers=headers, json=payload, timeout=120)

        if response.status_code != 200:
            return {"success": False, "error": f"API error {response.status_code}: {response.text[:500]}"}

        result = response.json()
        predictions = result.get("predictions", [])

        if not predictions:
            return {"success": False, "error": "No predictions in response"}

        images = []
        for pred in predictions:
            if "bytesBase64Encoded" in pred:
                images.append(pred["bytesBase64Encoded"])

        if images:
            return {
                "success": True,
                "image_data": images[0],
                "all_images": images,
                "model": model_id
            }
        else:
            return {"success": False, "error": "No images in response"}

    except Exception as e:
        return {"success": False, "error": str(e)}


def generate_image(
    prompt: str,
    model: str = "gemini",
    aspect_ratio: str = "1:1",
    output_path: Optional[str] = None,
    verbose: bool = True
) -> dict:
    """
    Generate an image using the specified model.

    Args:
        prompt: Text description of the image to generate
        model: Model key from MODELS dict
        aspect_ratio: Image aspect ratio
        output_path: Path to save the generated image
        verbose: Print progress messages

    Returns:
        dict with 'success', 'image_data', 'path', 'error'
    """

    if model not in MODELS:
        available = ", ".join(MODELS.keys())
        return {"success": False, "error": f"Unknown model '{model}'. Available: {available}"}

    model_config = MODELS[model]
    model_id = model_config["id"]
    model_type = model_config["type"]

    if verbose:
        print(f"[Nano Banana] Model: {model_config['description']}")
        print(f"[Nano Banana] Aspect Ratio: {aspect_ratio}")
        print(f"[Nano Banana] Prompt: {prompt[:80]}...")

    # Generate based on model type
    if model_type == "gemini":
        result = generate_image_gemini(prompt, model_id, aspect_ratio, verbose)
    else:
        result = generate_image_imagen(prompt, model_id, aspect_ratio, 1, verbose)

    # Save image if successful and path provided
    if result["success"] and output_path and result.get("image_data"):
        try:
            saved_path = Path(output_path)
            saved_path.parent.mkdir(parents=True, exist_ok=True)

            with open(saved_path, "wb") as f:
                f.write(base64.b64decode(result["image_data"]))

            result["path"] = str(saved_path)
            if verbose:
                print(f"[Nano Banana] ✓ Saved to: {saved_path}")
        except Exception as e:
            result["save_error"] = str(e)

    if result["success"] and verbose:
        print("[Nano Banana] ✓ Generation complete!")

    return result


def generate_product_images(
    product_name: str,
    product_description: str,
    variants: Optional[list] = None,
    model: str = "gemini",
    output_dir: str = "./generated_images",
    aspect_ratio: str = "1:1"
) -> list:
    """Generate product images for e-commerce."""

    results = []
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    base_prompt = f"""{product_name}. {product_description}
Professional product photography, clean white background, studio lighting, sharp detail, e-commerce quality."""

    print(f"\n{'='*60}")
    print(f"Generating images for: {product_name}")
    print(f"{'='*60}")

    # Main product image
    filename = product_name.replace(" ", "_").replace("/", "-")[:50]
    main_result = generate_image(
        prompt=base_prompt,
        model=model,
        aspect_ratio=aspect_ratio,
        output_path=output_path / f"{filename}_main.png"
    )
    results.append({"type": "main", "result": main_result})

    # Variant images
    if variants:
        for variant in variants:
            time.sleep(2)  # Rate limiting
            variant_prompt = f"{base_prompt} Variant: {variant}"

            variant_result = generate_image(
                prompt=variant_prompt,
                model=model,
                aspect_ratio=aspect_ratio,
                output_path=output_path / f"{filename}_{variant.replace(' ', '_')}.png"
            )
            results.append({"type": f"variant_{variant}", "result": variant_result})

    return results


def upload_to_shopify(
    image_path: str,
    product_id: int,
    shopify_store: str = None,
    access_token: str = None,
    position: int = 1,
    alt_text: str = ""
) -> dict:
    """Upload a generated image to Shopify product."""

    # Get credentials from environment if not provided
    shopify_store = shopify_store or os.environ.get("SHOPIFY_STORE", "")
    access_token = access_token or os.environ.get("SHOPIFY_ACCESS_TOKEN", "")

    if not shopify_store or not access_token:
        return {
            "success": False,
            "error": "Missing SHOPIFY_STORE or SHOPIFY_ACCESS_TOKEN environment variables"
        }

    with open(image_path, "rb") as f:
        image_data = base64.b64encode(f.read()).decode("utf-8")

    endpoint = f"https://{shopify_store}/admin/api/2024-01/products/{product_id}/images.json"

    payload = {
        "image": {
            "attachment": image_data,
            "position": position,
            "alt": alt_text
        }
    }

    headers = {
        "X-Shopify-Access-Token": access_token,
        "Content-Type": "application/json"
    }

    response = requests.post(endpoint, headers=headers, json=payload, timeout=60)

    if response.status_code in [200, 201]:
        result = response.json()
        return {
            "success": True,
            "image_id": result["image"]["id"],
            "src": result["image"]["src"]
        }
    else:
        return {
            "success": False,
            "error": f"Shopify error {response.status_code}: {response.text[:200]}"
        }


def print_setup_help():
    """Print setup instructions."""
    print("""
╔══════════════════════════════════════════════════════════════╗
║              NANO BANANA - SETUP INSTRUCTIONS                ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Your API key needs the Generative Language API enabled.     ║
║                                                              ║
║  QUICK SETUP:                                                ║
║  1. Go to: https://aistudio.google.com/apikey                ║
║  2. Click "Create API Key" or use existing one               ║
║  3. The key should work automatically with Gemini models     ║
║                                                              ║
║  FOR IMAGEN MODELS (higher quality):                         ║
║  1. Go to: https://console.cloud.google.com                  ║
║  2. Enable billing on your project                           ║
║  3. Enable "Vertex AI API"                                   ║
║  4. Imagen 4 Ultra costs $0.06/image                         ║
║                                                              ║
║  AVAILABLE MODELS (Updated Jan 2026):                        ║
║  - gemini     : Gemini 2.5 Flash Image (~$0.04/img)          ║
║  - gemini-pro : Gemini 3 Pro Image Preview (best quality)    ║
║  - imagen3    : Imagen 3 (requires billing)                  ║
║  - imagen4    : Imagen 4 Standard (requires billing)         ║
║  - imagen4-ultra: Imagen 4 Ultra (highest quality)           ║
║                                                              ║
║  GITHUB SECRETS (for CI/CD):                                 ║
║  Store these secrets in your repo Settings > Secrets:        ║
║  - GOOGLE_API_KEY       : Your Google AI API key             ║
║  - SHOPIFY_STORE        : your-store.myshopify.com           ║
║  - SHOPIFY_ACCESS_TOKEN : Your Shopify Admin API token       ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
""")


# CLI interface
if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Nano Banana Image Generator - Google AI for product images",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python nano_banana_generator.py "Black mylar bags" --output bag.png
  python nano_banana_generator.py "Glass jar with lid" --model imagen4-ultra
  python nano_banana_generator.py --test
  python nano_banana_generator.py --help-setup
        """
    )
    parser.add_argument("prompt", nargs="?", help="Image generation prompt")
    parser.add_argument("--output", "-o", help="Output file path", default="generated_image.png")
    parser.add_argument("--model", "-m", choices=list(MODELS.keys()), default="gemini",
                        help="Model to use (default: gemini)")
    parser.add_argument("--aspect", "-a", choices=ASPECT_RATIOS, default="1:1",
                        help="Aspect ratio (default: 1:1)")
    parser.add_argument("--test", action="store_true", help="Test API key")
    parser.add_argument("--help-setup", action="store_true", help="Show setup instructions")
    parser.add_argument("--quiet", "-q", action="store_true", help="Suppress progress messages")
    parser.add_argument("--list-models", action="store_true", help="List available models")

    args = parser.parse_args()

    if args.help_setup:
        print_setup_help()
        sys.exit(0)

    if args.list_models:
        print("\nAvailable Models:")
        print("-" * 60)
        for key, config in MODELS.items():
            print(f"  {key:15} - {config['description']}")
        print()
        sys.exit(0)

    if args.test:
        result = test_api_key(verbose=True)
        sys.exit(0 if result["success"] else 1)

    if not args.prompt:
        parser.print_help()
        print("\nError: prompt is required (unless using --test or --help-setup)")
        sys.exit(1)

    result = generate_image(
        prompt=args.prompt,
        model=args.model,
        aspect_ratio=args.aspect,
        output_path=args.output,
        verbose=not args.quiet
    )

    if result["success"]:
        print(f"\n✓ Success! Image saved to: {result.get('path', 'N/A')}")
    else:
        print(f"\n✗ Error: {result['error']}")
        if "403" in str(result.get("error", "")):
            print("\nRun with --help-setup for instructions on fixing API permissions.")
        sys.exit(1)
