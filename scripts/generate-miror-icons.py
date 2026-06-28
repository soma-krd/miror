"""
Miror — brand asset generator

Generates the full icon set from the source logo at project root:
  miror-logo.png

Outputs match BRAND-GUIDE.md inventory under src-tauri/icons/ and public/.

Usage:
  python3 scripts/generate-miror-icons.py
  cd src-tauri && cargo tauri icon icons/app-icon-1024.png
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SOURCE_LOGO = ROOT / "miror-logo.png"
OUTPUT_DIR = ROOT / "src-tauri" / "icons"
PUBLIC_DIR = ROOT / "public"

# Brand palette (BRAND-GUIDE.md)
SLATE_900 = (15, 23, 42, 255)
BG_TOLERANCE = 40
CORNER_RADIUS_RATIO = 0.2  # iOS/macOS rounded-square


def ensure_source() -> None:
    if not SOURCE_LOGO.exists():
        print(f"ERROR: Source logo not found: {SOURCE_LOGO}", file=sys.stderr)
        sys.exit(1)


def load_logo_rgba() -> Image.Image:
    return Image.open(SOURCE_LOGO).convert("RGBA")


def detect_background(img: Image.Image) -> tuple[int, int, int]:
    arr = img.load()
    w, h = img.size
    samples = [arr[0, 0][:3], arr[w - 1, 0][:3], arr[0, h - 1][:3], arr[w - 1, h - 1][:3]]
    return tuple(int(sum(c[i] for c in samples) / len(samples)) for i in range(3))


def resize_square(img: Image.Image, size: int) -> Image.Image:
    if img.size == (size, size):
        return img.copy()
    return img.resize((size, size), Image.LANCZOS)


def apply_rounded_mask(img: Image.Image, radius_ratio: float = CORNER_RADIUS_RATIO) -> Image.Image:
    """Apply iOS/macOS-style rounded corners per brand guide."""
    size = img.size[0]
    radius = int(size * radius_ratio)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size, size], radius=radius, fill=255)
    out = img.copy()
    out.putalpha(mask)
    return out


def extract_symbol(img: Image.Image, bg: tuple[int, int, int], tolerance: int = BG_TOLERANCE) -> Image.Image:
    """Extract the M mark onto a transparent background."""
    rgba = img.convert("RGBA")
    pixels = rgba.load()
    w, h = rgba.size
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out_pixels = out.load()

    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            diff = abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2])
            if diff > tolerance:
                out_pixels[x, y] = (r, g, b, a)

    bbox = out.getbbox()
    if bbox:
        out = out.crop(bbox)
    return out


def fit_symbol(symbol: Image.Image, size: int, padding_ratio: float = 0.12) -> Image.Image:
    """Scale symbol to fit inside a square canvas with padding."""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pad = max(1, int(size * padding_ratio))
    inner = size - 2 * pad
    sym = symbol.copy()
    sym.thumbnail((inner, inner), Image.LANCZOS)
    x = (size - sym.width) // 2
    y = (size - sym.height) // 2
    canvas.paste(sym, (x, y), sym)
    return canvas


def to_template(symbol_rgba: Image.Image) -> Image.Image:
    """macOS template: pure white glyph, alpha from symbol."""
    arr = symbol_rgba.split()
    alpha = arr[3]
    white = Image.new("RGBA", symbol_rgba.size, (255, 255, 255, 255))
    white.putalpha(alpha)
    return white


def sharpen_small_icon(img: Image.Image, size: int) -> Image.Image:
    """Light sharpen for tiny tray sizes."""
    if size <= 32:
        return img.filter(ImageFilter.UnsharpMask(radius=0.6, percent=120, threshold=2))
    return img


def save_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, format="PNG", optimize=True)
    print(f"  {path.relative_to(ROOT)}")


def png_to_b64(img: Image.Image) -> str:
    import base64
    import io

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def write_embedded_svg(img: Image.Image, svg_path: Path, view_size: int, label: str) -> None:
    """Write a minimal SVG wrapper embedding a PNG (for favicon / sidebar)."""
    data = png_to_b64(img)
    svg = f"""<!-- Miror — {label} (generated from miror-logo.png) -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 {view_size} {view_size}">
  <image width="{view_size}" height="{view_size}" href="data:image/png;base64,{data}"/>
</svg>
"""
    svg_path.write_text(svg, encoding="utf-8")
    print(f"  {svg_path.relative_to(ROOT)}")


def write_sidebar_svg(symbol_img: Image.Image, svg_path: Path) -> None:
    """Sidebar: symbol + Miror wordmark per brand guide."""
    data = png_to_b64(symbol_img)
    svg = f"""<!-- Miror — Sidebar logo (generated from miror-logo.png) -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 180 32" fill="none">
  <image x="0" y="0" width="32" height="32" href="data:image/png;base64,{data}"/>
  <text x="40" y="22" font-family="'Geist Sans', 'Inter', system-ui, sans-serif" font-size="18" font-weight="700" fill="#F1F5F9" letter-spacing="-0.5">Miror</text>
</svg>
"""
    svg_path.write_text(svg, encoding="utf-8")
    print(f"  {svg_path.relative_to(ROOT)}")


def main() -> None:
    ensure_source()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Source: {SOURCE_LOGO.relative_to(ROOT)}")
    print("Generating Miror brand assets...\n")

    source = load_logo_rgba()
    bg = detect_background(source)

    # --- App icons (1024 source + downscales) ---
    app_icon = resize_square(source, 1024)
    app_icon = apply_rounded_mask(app_icon)

    for size in [1024, 512, 256, 128, 64, 32]:
        scaled = app_icon if size == 1024 else app_icon.resize((size, size), Image.LANCZOS)
        save_png(scaled, OUTPUT_DIR / f"app-icon-{size}.png")

    save_png(app_icon, OUTPUT_DIR / "icon.png")

    # --- Tauri platform bundle icons (cargo tauri icon equivalent) ---
    platform_sizes = {
        "32x32.png": 32,
        "128x128.png": 128,
        "128x128@2x.png": 256,
    }
    for name, size in platform_sizes.items():
        save_png(app_icon.resize((size, size), Image.LANCZOS), OUTPUT_DIR / name)

    icns_path = OUTPUT_DIR / "icon.icns"
    app_icon.save(icns_path, format="ICNS")
    print(f"  {icns_path.relative_to(ROOT)}")

    square_logos = {
        "Square30x30Logo.png": 30,
        "Square44x44Logo.png": 44,
        "Square71x71Logo.png": 71,
        "Square89x89Logo.png": 89,
        "Square107x107Logo.png": 107,
        "Square142x142Logo.png": 142,
        "Square150x150Logo.png": 150,
        "Square284x284Logo.png": 284,
        "Square310x310Logo.png": 310,
        "StoreLogo.png": 50,
    }
    for name, size in square_logos.items():
        save_png(app_icon.resize((size, size), Image.LANCZOS), OUTPUT_DIR / name)

    # --- Windows .ico ---
    ico_sizes = [16, 32, 48, 64, 128, 256]
    ico_images = [app_icon.resize((s, s), Image.LANCZOS) for s in ico_sizes]
    ico_path = OUTPUT_DIR / "icon.ico"
    ico_images[0].save(
        ico_path,
        format="ICO",
        sizes=[(s, s) for s in ico_sizes],
        append_images=ico_images[1:],
    )
    print(f"  {ico_path.relative_to(ROOT)}")

    # --- Tray icons from extracted symbol ---
    symbol = extract_symbol(source, bg)
    tray_sizes = [16, 22, 32, 48, 64]

    for size in tray_sizes:
        colored = fit_symbol(symbol, size)
        colored = sharpen_small_icon(colored, size)
        save_png(colored, OUTPUT_DIR / f"tray-icon-{size}.png")

        template = to_template(colored)
        save_png(template, OUTPUT_DIR / f"tray-icon-{size}-template.png")

    # Default tray aliases (brand guide)
    fit_symbol(symbol, 22).save(OUTPUT_DIR / "tray-icon-template.png", format="PNG", optimize=True)
    print("  src-tauri/icons/tray-icon-template.png")

    # --- Public web assets ---
    favicon_512 = app_icon.resize((512, 512), Image.LANCZOS)
    favicon_32 = app_icon.resize((32, 32), Image.LANCZOS)
    save_png(favicon_512, PUBLIC_DIR / "miror-icon-512.png")
    save_png(favicon_32, PUBLIC_DIR / "miror-icon-32.png")

    # Proper favicon.ico for legacy browsers
    fav_ico_sizes = [16, 32, 48]
    fav_ico = [favicon_32.resize((s, s), Image.LANCZOS) for s in fav_ico_sizes]
    fav_ico[0].save(
        PUBLIC_DIR / "favicon.ico",
        format="ICO",
        sizes=[(s, s) for s in fav_ico_sizes],
        append_images=fav_ico[1:],
    )
    print("  public/favicon.ico")

    symbol_32 = fit_symbol(symbol, 32)
    save_png(symbol_32, OUTPUT_DIR / "miror-symbol-32.png")
    save_png(symbol_32, PUBLIC_DIR / "miror-symbol-32.png")

    write_embedded_svg(favicon_32, PUBLIC_DIR / "miror-favicon.svg", 32, "Favicon")
    write_embedded_svg(symbol_32, OUTPUT_DIR / "miror-symbol.svg", 32, "Brand symbol")
    write_embedded_svg(app_icon.resize((200, 200), Image.LANCZOS), OUTPUT_DIR / "miror-logo.svg", 200, "Logo mark")
    write_sidebar_svg(symbol_32, PUBLIC_DIR / "miror-sidebar-logo.svg")

    # Copy source into icons for reference
    save_png(resize_square(source, 1024), OUTPUT_DIR / "miror-logo-source.png")

    print(f"\nDone. Raster assets in {OUTPUT_DIR.relative_to(ROOT)}/")
    print("Next: cd src-tauri && cargo tauri icon icons/app-icon-1024.png")


if __name__ == "__main__":
    main()
