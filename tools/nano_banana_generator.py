#!/usr/bin/env python3
"""
Nano Banana Pro Image Generator
===============================
Uses Google's Gemini 3 Pro Image (flagship) for high-quality product image generation.
Supports reference images from competitors to generate accurate product photos.

Features:
- Gemini 3 Pro Image with 2K/4K output
- Multi-reference image support (up to 14 images)
- Competitor image search and download
- Product presets for common items
- Direct Shopify upload

Usage:
    # Generate with preset
    python nano_banana_generator.py --preset mylar-bags --output images/

    # Generate with reference images
    python nano_banana_generator.py "Black mylar bag" --reference ref1.jpg ref2.jpg

    # Search competitors and generate
    python nano_banana_generator.py --preset mylar-bags --search-competitors

    # Test API
    python nano_banana_generator.py --test
"""

import argparse
import base64
import json
import os
import re
import sys
import time
import urllib.parse
from pathlib import Path
from typing import Optional, List

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
# Nano Banana Pro (Gemini 3 Pro Image) is the flagship model
MODELS = {
    # FLAGSHIP: Gemini 3 Pro Image Preview - Highest quality (DEFAULT)
    "gemini": {
        "id": "gemini-3-pro-image-preview",
        "endpoint": "generateContent",
        "type": "gemini",
        "image_size": "2K",  # Supports 1K, 2K, 4K
        "description": "Nano Banana Pro (Gemini 3 Pro) - FLAGSHIP model, 2K output"
    },
    # Alias for flagship
    "gemini-pro": {
        "id": "gemini-3-pro-image-preview",
        "endpoint": "generateContent",
        "type": "gemini",
        "image_size": "2K",
        "description": "Nano Banana Pro (Gemini 3 Pro) - FLAGSHIP model, 2K output"
    },
    # 4K version for maximum quality
    "gemini-4k": {
        "id": "gemini-3-pro-image-preview",
        "endpoint": "generateContent",
        "type": "gemini",
        "image_size": "4K",
        "description": "Nano Banana Pro 4K - Maximum resolution output"
    },
    # Fast/budget option
    "gemini-flash": {
        "id": "gemini-2.5-flash-image",
        "endpoint": "generateContent",
        "type": "gemini",
        "image_size": None,
        "description": "Gemini 2.5 Flash Image - Fast, budget-friendly"
    },
    # Legacy alias for backwards compatibility
    "gemini-2.5": {
        "id": "gemini-2.5-flash-image",
        "endpoint": "generateContent",
        "type": "gemini",
        "image_size": None,
        "description": "Gemini 2.5 Flash Image (legacy alias)"
    },
    # Imagen models (require billing)
    "imagen3": {
        "id": "imagen-3.0-generate-002",
        "endpoint": "predict",
        "type": "imagen",
        "description": "Imagen 3 - High quality (requires billing)"
    },
    "imagen4": {
        "id": "imagen-4.0-generate-001",
        "endpoint": "predict",
        "type": "imagen",
        "description": "Imagen 4 Standard (requires billing)"
    },
    "imagen4-ultra": {
        "id": "imagen-4.0-ultra-generate-001",
        "endpoint": "predict",
        "type": "imagen",
        "description": "Imagen 4 Ultra - Maximum quality (requires billing)"
    },
}

# Default model is the flagship Nano Banana Pro
DEFAULT_MODEL = "gemini"

# Supported aspect ratios
ASPECT_RATIOS = ["1:1", "3:4", "4:3", "9:16", "16:9"]

# Image sizes for Imagen
IMAGE_SIZES = ["1024x1024", "1536x1536", "2048x2048"]

# =============================================================================
# PRODUCT PRESETS - Pre-configured settings for specific products
# =============================================================================
PRODUCT_PRESETS = {
    "mylar-bags": {
        "name": "Oil Slick Mylar Bags",
        "product_id": 10049313440024,
        "search_terms": [
            "black matte mylar bag flat pouch",
            "mylar smell proof bag flat",
            "heat seal mylar pouch black matte",
            "food grade mylar bag black"
        ],
        "variants": [
            {"size": "3x4.5", "name": "3x4.5 inches", "finish": "Black"},
            {"size": "3x4.5", "name": "3x4.5 inches", "finish": "Black w/ Clear Window"},
            {"size": "3.6x5", "name": "3.6x5 inches", "finish": "Black"},
            {"size": "3.6x5", "name": "3.6x5 inches", "finish": "Black w/ Clear Window"},
            {"size": "4x6.5", "name": "4x6.5 inches", "finish": "Black"},
            {"size": "4x6.5", "name": "4x6.5 inches", "finish": "Black w/ Clear Window"},
            {"size": "5x8", "name": "5x8 inches", "finish": "Black"},
            {"size": "5x8", "name": "5x8 inches", "finish": "Black w/ Clear Window"},
            {"size": "6x9", "name": "6x9 inches", "finish": "Black"},
            {"size": "9x2.5", "name": "9x2.5 Preroll Size", "finish": "Black"},
        ],
        "base_prompt": """Flat rectangular matte black mylar bag pouch, {size}, heat-seal closure at top edge.
The bag is lying completely flat on a pure white background, photographed from directly above (bird's eye view).
This is a FLAT 2D pouch - NOT a stand-up pouch, NOT 3D, NOT inflated.
{finish_detail}
Professional product photography, e-commerce style, studio lighting.
CRITICAL: No text, no labels, no logos, no branding anywhere on the bag or in the image.""",
        "finish_prompts": {
            "Black": "Completely matte black opaque surface with no windows or transparent areas.",
            "Black w/ Clear Window": "Matte black with a clear transparent window on the front showing the inside of the empty bag."
        },
        "aspect_ratio": "1:1",
        "num_images": 4
    },
    "glass-jars": {
        "name": "Oil Slick Glass Jars",
        "product_id": None,  # Set when product exists
        "search_terms": [
            "glass concentrate jar black lid",
            "small glass jar cosmetic black cap",
            "5ml glass jar black lid"
        ],
        "variants": [
            {"size": "5ml", "name": "5ml Mini"},
            {"size": "9ml", "name": "9ml Standard"},
        ],
        "base_prompt": """Clear glass jar with black screw-top lid, {size} capacity.
Professional product photography on white background.
CRITICAL: No text, no labels, no logos.""",
        "aspect_ratio": "1:1",
        "num_images": 2
    }
}


def search_competitor_images(search_terms: List[str], max_images: int = 6) -> List[dict]:
    """
    Search for competitor product images using DuckDuckGo image search.
    Returns list of image URLs that can be used as references.

    Args:
        search_terms: List of search queries
        max_images: Maximum number of images to return (max 6 for high-fidelity reference)

    Returns:
        List of dicts with 'url', 'title', 'source'
    """
    print(f"\n[Nano Banana Pro] Searching for competitor reference images...")

    images = []
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }

    for term in search_terms[:3]:  # Limit to 3 search terms
        if len(images) >= max_images:
            break

        try:
            # Use DuckDuckGo image search
            search_url = f"https://duckduckgo.com/?q={urllib.parse.quote(term)}&iax=images&ia=images"
            print(f"  Searching: {term}")

            # DuckDuckGo requires a token, so we'll use their API endpoint
            token_url = "https://duckduckgo.com/"
            token_resp = requests.get(token_url, headers=headers, timeout=10)

            # Extract vqd token
            vqd_match = re.search(r'vqd=([^&]+)', token_resp.text)
            if not vqd_match:
                vqd_match = re.search(r"vqd='([^']+)'", token_resp.text)

            if vqd_match:
                vqd = vqd_match.group(1)
                api_url = f"https://duckduckgo.com/i.js?q={urllib.parse.quote(term)}&vqd={vqd}&p=1"

                img_resp = requests.get(api_url, headers=headers, timeout=10)
                if img_resp.status_code == 200:
                    try:
                        data = img_resp.json()
                        for result in data.get("results", [])[:3]:
                            if len(images) < max_images:
                                images.append({
                                    "url": result.get("image"),
                                    "thumbnail": result.get("thumbnail"),
                                    "title": result.get("title", ""),
                                    "source": result.get("source", "")
                                })
                    except:
                        pass

            time.sleep(1)  # Rate limiting

        except Exception as e:
            print(f"  Warning: Search failed for '{term}': {e}")
            continue

    print(f"  Found {len(images)} reference images")
    return images


def download_reference_images(image_urls: List[str], output_dir: str = "./reference_images") -> List[str]:
    """
    Download reference images to local files.

    Args:
        image_urls: List of image URLs to download
        output_dir: Directory to save images

    Returns:
        List of local file paths
    """
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    downloaded = []
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }

    for i, url in enumerate(image_urls):
        try:
            print(f"  Downloading reference {i+1}/{len(image_urls)}...")
            resp = requests.get(url, headers=headers, timeout=30)

            if resp.status_code == 200:
                # Determine extension from content type
                content_type = resp.headers.get("content-type", "image/jpeg")
                ext = "jpg" if "jpeg" in content_type else "png" if "png" in content_type else "jpg"

                filepath = output_path / f"reference_{i+1}.{ext}"
                with open(filepath, "wb") as f:
                    f.write(resp.content)

                downloaded.append(str(filepath))
                print(f"    ✓ Saved: {filepath}")

            time.sleep(0.5)

        except Exception as e:
            print(f"    ✗ Failed to download: {e}")

    return downloaded


def load_reference_images(image_paths: List[str]) -> List[dict]:
    """
    Load reference images and convert to base64 for API.

    Args:
        image_paths: List of local file paths

    Returns:
        List of dicts with 'mime_type' and 'data' (base64)
    """
    images = []

    for path in image_paths[:6]:  # Max 6 high-fidelity reference images
        try:
            with open(path, "rb") as f:
                data = base64.b64encode(f.read()).decode("utf-8")

            # Determine MIME type
            ext = Path(path).suffix.lower()
            mime_type = {
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".png": "image/png",
                ".webp": "image/webp",
                ".gif": "image/gif"
            }.get(ext, "image/jpeg")

            images.append({
                "mime_type": mime_type,
                "data": data
            })
            print(f"  Loaded reference: {path}")

        except Exception as e:
            print(f"  Warning: Could not load {path}: {e}")

    return images


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
    image_size: str = None,
    reference_images: List[dict] = None,
    verbose: bool = True
) -> dict:
    """Generate image using Gemini model with native image output.

    Args:
        prompt: Text description of image to generate
        model_id: Gemini model ID
        aspect_ratio: Image aspect ratio (1:1, 16:9, etc.)
        image_size: Output resolution - "1K", "2K", or "4K" (Gemini 3 Pro only)
        reference_images: List of reference images (dicts with 'mime_type' and 'data')
        verbose: Print progress messages
    """

    endpoint = f"{BASE_URL}/models/{model_id}:generateContent"

    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": API_KEY
    }

    # Build the prompt with reference image context
    if reference_images:
        enhanced_prompt = f"""You are given {len(reference_images)} reference images of similar products from competitors.
Study these reference images carefully to understand:
- The exact product type and shape
- How the product is photographed (angle, lighting, positioning)
- The realistic appearance and materials

Now generate a NEW professional e-commerce product photograph based on this description:

{prompt}

CRITICAL REQUIREMENTS:
- The generated image must match the STYLE and QUALITY of the reference images
- Photorealistic rendering - must look like a real photograph, not AI-generated
- Clean pure white background (#FFFFFF)
- Professional studio lighting with soft shadows
- Sharp focus, extremely high detail
- Commercial quality suitable for online retail
- ABSOLUTELY NO text, watermarks, labels, or logos anywhere in the image
- Product should be the sole focus
- Match the realistic appearance seen in the reference images"""
    else:
        enhanced_prompt = f"""Generate a professional e-commerce product photograph.

{prompt}

CRITICAL REQUIREMENTS:
- Photorealistic rendering - must look like a real photograph
- Clean pure white background (#FFFFFF)
- Professional studio lighting with soft shadows
- Sharp focus, extremely high detail
- Commercial quality suitable for online retail
- ABSOLUTELY NO text, watermarks, labels, or logos anywhere in the image
- Product should be the sole focus
- Accurate representation of the product's real-world appearance"""

    # Build parts list - reference images first, then prompt
    parts = []

    # Add reference images if provided (Gemini 3 Pro supports up to 14)
    if reference_images:
        for i, ref_img in enumerate(reference_images[:6]):  # Max 6 for high-fidelity
            parts.append({
                "inline_data": {
                    "mime_type": ref_img["mime_type"],
                    "data": ref_img["data"]
                }
            })
        if verbose:
            print(f"[Nano Banana Pro] Using {len(reference_images[:6])} reference images")

    # Add the text prompt
    parts.append({"text": enhanced_prompt})

    # Build imageConfig based on model capabilities
    image_config = {"aspectRatio": aspect_ratio}

    # Add image size for Gemini 3 Pro (supports 1K, 2K, 4K)
    if image_size and "gemini-3" in model_id:
        image_config["imageSize"] = image_size

    # Payload format for Gemini 3 Pro and 2.5+ models
    payload = {
        "contents": [{
            "parts": parts
        }],
        "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"],
            "imageConfig": image_config
        }
    }

    if verbose:
        print(f"[Nano Banana Pro] Using model: {model_id}")
        print(f"[Nano Banana Pro] Aspect ratio: {aspect_ratio}")
        if image_size:
            print(f"[Nano Banana Pro] Output resolution: {image_size}")
        print(f"[Nano Banana Pro] Generating image with advanced reasoning...")

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
    reference_images: List[dict] = None,
    verbose: bool = True
) -> dict:
    """
    Generate an image using the specified model.

    Args:
        prompt: Text description of the image to generate
        model: Model key from MODELS dict (default: gemini = Nano Banana Pro)
        aspect_ratio: Image aspect ratio
        output_path: Path to save the generated image
        reference_images: List of reference images (dicts with 'mime_type' and 'data')
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
    image_size = model_config.get("image_size")  # 1K, 2K, 4K for Gemini 3 Pro

    if verbose:
        print(f"\n{'='*60}")
        print(f"[Nano Banana Pro] {model_config['description']}")
        print(f"[Nano Banana Pro] Aspect Ratio: {aspect_ratio}")
        if image_size:
            print(f"[Nano Banana Pro] Output Resolution: {image_size}")
        if reference_images:
            print(f"[Nano Banana Pro] Reference Images: {len(reference_images)}")
        print(f"[Nano Banana Pro] Prompt: {prompt[:100]}...")
        print(f"{'='*60}")

    # Generate based on model type
    if model_type == "gemini":
        result = generate_image_gemini(prompt, model_id, aspect_ratio, image_size, reference_images, verbose)
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


def generate_from_preset(
    preset_name: str,
    search_competitors: bool = True,
    upload_to_shopify_product: bool = False,
    model: str = "gemini",
    output_dir: str = "./generated_images",
    num_images_per_variant: int = 1
) -> dict:
    """
    Generate product images using a preset configuration.
    Automatically searches for competitor images and uses them as references.

    Args:
        preset_name: Name of the preset (e.g., 'mylar-bags')
        search_competitors: Whether to search for competitor reference images
        upload_to_shopify_product: Whether to upload images to Shopify
        model: Model to use (default: gemini = Nano Banana Pro)
        output_dir: Directory to save generated images
        num_images_per_variant: Number of images to generate per variant

    Returns:
        dict with results for each variant
    """
    if preset_name not in PRODUCT_PRESETS:
        available = ", ".join(PRODUCT_PRESETS.keys())
        return {"success": False, "error": f"Unknown preset '{preset_name}'. Available: {available}"}

    preset = PRODUCT_PRESETS[preset_name]
    print(f"\n{'='*70}")
    print(f"  NANO BANANA PRO - PRESET: {preset['name']}")
    print(f"{'='*70}")

    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    # Step 1: Search for competitor reference images
    reference_images = []
    if search_competitors:
        print(f"\n[Step 1/4] Searching for competitor reference images...")
        competitor_results = search_competitor_images(preset["search_terms"], max_images=6)

        if competitor_results:
            # Download the reference images
            image_urls = [img["url"] for img in competitor_results if img.get("url")]
            if image_urls:
                downloaded_paths = download_reference_images(image_urls, output_dir=f"{output_dir}/references")
                if downloaded_paths:
                    reference_images = load_reference_images(downloaded_paths)
                    print(f"  ✓ Loaded {len(reference_images)} reference images")
        else:
            print("  ⚠ No competitor images found, proceeding without references")
    else:
        print(f"\n[Step 1/4] Skipping competitor search (disabled)")

    # Step 2: Generate images for each variant
    print(f"\n[Step 2/4] Generating product images...")
    results = {"preset": preset_name, "variants": [], "success": True}

    variants = preset.get("variants", [{"size": "standard", "name": "Standard"}])
    aspect_ratio = preset.get("aspect_ratio", "1:1")

    for i, variant in enumerate(variants):
        print(f"\n  Variant {i+1}/{len(variants)}: {variant.get('name', variant.get('size', 'Unknown'))}")

        # Build the prompt from preset
        base_prompt = preset["base_prompt"]

        # Replace placeholders
        prompt = base_prompt.format(
            size=variant.get("size", ""),
            name=variant.get("name", ""),
            finish_detail=preset.get("finish_prompts", {}).get(variant.get("finish", ""), "")
        )

        variant_results = []
        for img_num in range(num_images_per_variant):
            # Generate unique filename
            safe_name = f"{variant.get('size', 'std')}_{variant.get('finish', 'default')}".replace(" ", "_").replace("/", "-")
            filename = f"{preset_name}_{safe_name}_{img_num+1}.png"
            filepath = output_path / filename

            result = generate_image(
                prompt=prompt,
                model=model,
                aspect_ratio=aspect_ratio,
                output_path=str(filepath),
                reference_images=reference_images if reference_images else None
            )

            if result["success"]:
                result["filepath"] = str(filepath)
                result["variant"] = variant
                variant_results.append(result)
                print(f"    ✓ Generated: {filename}")
            else:
                print(f"    ✗ Failed: {result.get('error', 'Unknown error')}")
                results["success"] = False

            time.sleep(2)  # Rate limiting between images

        results["variants"].append({
            "variant": variant,
            "images": variant_results
        })

    # Step 3: Upload to Shopify if requested
    if upload_to_shopify_product and preset.get("product_id"):
        print(f"\n[Step 3/4] Uploading to Shopify product {preset['product_id']}...")

        for variant_data in results["variants"]:
            for img_result in variant_data["images"]:
                if img_result.get("filepath"):
                    upload_result = upload_to_shopify(
                        img_result["filepath"],
                        preset["product_id"],
                        alt_text=f"{preset['name']} - {variant_data['variant'].get('name', '')}"
                    )
                    if upload_result["success"]:
                        print(f"    ✓ Uploaded: {img_result['filepath']}")
                    else:
                        print(f"    ✗ Upload failed: {upload_result.get('error', 'Unknown')}")
    else:
        print(f"\n[Step 3/4] Skipping Shopify upload")

    # Step 4: Summary
    print(f"\n[Step 4/4] Generation Complete!")
    total_generated = sum(len(v["images"]) for v in results["variants"])
    print(f"  Total images generated: {total_generated}")
    print(f"  Output directory: {output_dir}")

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
║           NANO BANANA PRO - SETUP INSTRUCTIONS               ║
║        Powered by Google Gemini 3 Pro Image (Flagship)       ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Your API key needs the Generative Language API enabled.     ║
║                                                              ║
║  QUICK SETUP:                                                ║
║  1. Go to: https://aistudio.google.com/apikey                ║
║  2. Click "Create API Key" or use existing one               ║
║  3. The key should work automatically with Gemini models     ║
║                                                              ║
║  AVAILABLE MODELS (Updated Jan 2026):                        ║
║                                                              ║
║  ★ FLAGSHIP (DEFAULT):                                       ║
║  - gemini     : Nano Banana Pro (Gemini 3 Pro) 2K output     ║
║  - gemini-pro : Same as above (alias)                        ║
║  - gemini-4k  : Nano Banana Pro with 4K output (max quality) ║
║                                                              ║
║  BUDGET/FAST:                                                ║
║  - gemini-flash: Gemini 2.5 Flash (faster, cheaper)          ║
║                                                              ║
║  IMAGEN (requires billing):                                  ║
║  - imagen3      : Imagen 3                                   ║
║  - imagen4      : Imagen 4 Standard                          ║
║  - imagen4-ultra: Imagen 4 Ultra                             ║
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
        description="Nano Banana Pro Image Generator - Gemini 3 Pro for product images",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Generate with preset (recommended - auto-finds competitor images)
  python nano_banana_generator.py --preset mylar-bags

  # Generate with preset and upload to Shopify
  python nano_banana_generator.py --preset mylar-bags --upload

  # Generate single image with custom prompt
  python nano_banana_generator.py "Black mylar bag 4x6 inches" --output bag.png

  # Generate with reference images
  python nano_banana_generator.py "Black mylar bag" --reference ref1.jpg ref2.jpg

  # Test API key
  python nano_banana_generator.py --test

Available Presets: mylar-bags, glass-jars
        """
    )
    parser.add_argument("prompt", nargs="?", help="Image generation prompt (not needed with --preset)")
    parser.add_argument("--output", "-o", help="Output file/directory path", default="./generated_images")
    parser.add_argument("--model", "-m", choices=list(MODELS.keys()), default="gemini",
                        help="Model to use (default: gemini = Nano Banana Pro)")
    parser.add_argument("--aspect", "-a", choices=ASPECT_RATIOS, default="1:1",
                        help="Aspect ratio (default: 1:1)")
    parser.add_argument("--preset", "-p", choices=list(PRODUCT_PRESETS.keys()),
                        help="Use a product preset (auto-configures everything)")
    parser.add_argument("--reference", "-r", nargs="+",
                        help="Reference image files to use for generation")
    parser.add_argument("--search-competitors", action="store_true",
                        help="Search for competitor images to use as references")
    parser.add_argument("--upload", action="store_true",
                        help="Upload generated images to Shopify")
    parser.add_argument("--num-images", "-n", type=int, default=1,
                        help="Number of images per variant (default: 1)")
    parser.add_argument("--test", action="store_true", help="Test API key")
    parser.add_argument("--help-setup", action="store_true", help="Show setup instructions")
    parser.add_argument("--quiet", "-q", action="store_true", help="Suppress progress messages")
    parser.add_argument("--list-models", action="store_true", help="List available models")
    parser.add_argument("--list-presets", action="store_true", help="List available presets")

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

    if args.list_presets:
        print("\nAvailable Product Presets:")
        print("-" * 60)
        for key, config in PRODUCT_PRESETS.items():
            print(f"  {key:15} - {config['name']}")
            print(f"                  Product ID: {config.get('product_id', 'Not set')}")
            print(f"                  Variants: {len(config.get('variants', []))}")
        print()
        sys.exit(0)

    if args.test:
        result = test_api_key(verbose=True)
        sys.exit(0 if result["success"] else 1)

    # Preset mode - fully automated
    if args.preset:
        result = generate_from_preset(
            preset_name=args.preset,
            search_competitors=True,  # Always search for competitors
            upload_to_shopify_product=args.upload,
            model=args.model,
            output_dir=args.output,
            num_images_per_variant=args.num_images
        )
        sys.exit(0 if result.get("success") else 1)

    # Manual mode - requires prompt
    if not args.prompt:
        parser.print_help()
        print("\nError: prompt is required (or use --preset for automated mode)")
        sys.exit(1)

    # Load reference images if provided
    reference_images = None
    if args.reference:
        print(f"\n[Nano Banana Pro] Loading {len(args.reference)} reference images...")
        reference_images = load_reference_images(args.reference)
    elif args.search_competitors:
        print(f"\n[Nano Banana Pro] Searching for competitor reference images...")
        # Extract search terms from prompt
        search_terms = [args.prompt[:100]]
        competitor_results = search_competitor_images(search_terms, max_images=4)
        if competitor_results:
            image_urls = [img["url"] for img in competitor_results if img.get("url")]
            downloaded_paths = download_reference_images(image_urls)
            if downloaded_paths:
                reference_images = load_reference_images(downloaded_paths)

    result = generate_image(
        prompt=args.prompt,
        model=args.model,
        aspect_ratio=args.aspect,
        output_path=args.output if args.output.endswith('.png') else f"{args.output}/custom_image.png",
        reference_images=reference_images,
        verbose=not args.quiet
    )

    if result["success"]:
        print(f"\n✓ Success! Image saved to: {result.get('path', 'N/A')}")
    else:
        print(f"\n✗ Error: {result['error']}")
        if "403" in str(result.get("error", "")):
            print("\nRun with --help-setup for instructions on fixing API permissions.")
        sys.exit(1)
