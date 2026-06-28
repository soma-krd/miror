"""
Mir — brand asset generator

Generates a cohesive icon set for the Mir app:
  - App icon (1024x1024 source for cargo tauri icon)
  - Tray icons (16/22/32/48/64 px, colored + template)
  - SVG logo (symbol + wordmark)
  - SVG favicon
  - Windows .ico

BRAND SYSTEM
============
Name:     Mir
Metaphor: Command module for local dev (named after the modular space station)
Symbol:   Hexagonal command module + run chevron + status dot
          - Hexagon = the module/container (stability, structure)
          - Chevron ▸ = "run" / terminal prompt (action, forward motion)
          - Status dot = live service indicator (awareness, monitoring)

Palette:
  Slate-900    #0F172A   background (deep space)
  Slate-800    #1E293B   surface
  Emerald-500  #10B981   primary (running / active)
  Emerald-400  #34D399   primary-bright (highlights)
  Amber-400    #FBBF24   accent (starting / warning)
  Red-500      #EF4444   error
  Slate-100    #F1F5F9   text (foreground)

Typography:
  Geist Sans Bold — wordmark + headings
  Geist Sans Regular — body
  Geist Mono — logs, code, telemetry
"""

from PIL import Image, ImageDraw, ImageFont
import math
import os
import struct

OUTPUT_DIR = "/home/z/my-project/src-tauri/icons"
PUBLIC_DIR = "/home/z/my-project/public"
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(PUBLIC_DIR, exist_ok=True)

# --- Brand palette ---------------------------------------------------------
SLATE_900 = (15, 23, 42, 255)
SLATE_800 = (30, 41, 59, 255)
SLATE_700 = (51, 65, 85, 255)
EMERALD_500 = (16, 185, 129, 255)
EMERALD_400 = (52, 211, 153, 255)
EMERALD_600 = (5, 150, 105, 255)
AMBER_400 = (251, 191, 36, 255)
WHITE = (255, 255, 255, 255)
WHITE_80 = (255, 255, 255, 204)


def hexagon_vertices(cx, cy, r, flat_top=True):
    """Return 6 vertices of a hexagon centered at (cx, cy) with radius r."""
    verts = []
    for i in range(6):
        if flat_top:
            angle = math.radians(60 * i)
        else:
            angle = math.radians(60 * i + 30)
        verts.append((cx + r * math.cos(angle), cy + r * math.sin(angle)))
    return verts


def draw_hexagon_outline(draw, cx, cy, r, color, width):
    """Draw a hexagon outline with the given line width."""
    verts = hexagon_vertices(cx, cy, r)
    # Draw thick line segments with round joins
    for i in range(6):
        x1, y1 = verts[i]
        x2, y2 = verts[(i + 1) % 6]
        draw.line([x1, y1, x2, y2], fill=color, width=width)
    # Round joins — draw circles at each vertex
    dot_r = width // 2
    for vx, vy in verts:
        draw.ellipse([vx - dot_r, vy - dot_r, vx + dot_r, vy + dot_r], fill=color)


def draw_chevron(draw, cx, cy, size, color, thickness):
    """Draw a bold right-pointing chevron ▸ centered at (cx, cy).
    size = total width of the chevron
    thickness = stroke width
    """
    # Chevron defined by 7 points (filled polygon for bold look)
    h = size * 0.55  # height
    w = size * 0.45  # width of the open side
    tip = size * 0.30  # how far the point extends
    t = thickness  # stroke thickness

    # Points (clockwise from top-left outer)
    points = [
        (cx - w/2, cy - h/2),              # top-left outer
        (cx - w/2 + t, cy - h/2),          # top-left inner
        (cx + tip - t, cy),                # center inner (tip side)
        (cx - w/2 + t, cy + h/2),          # bottom-left inner
        (cx - w/2, cy + h/2),              # bottom-left outer
        (cx - w/2 + t + t*0.6, cy),        # center outer (open side) — creates the chevron notch
    ]
    # Actually, let's define it more carefully as a filled shape
    # The chevron is like ">": two strokes meeting at a point on the right
    # Filled version: a polygon with 6 vertices
    points = [
        (cx - w/2, cy - h/2),           # 0: top-left
        (cx - w/2 + t, cy - h/2),       # 1: top-left-inner
        (cx + tip - t*0.5, cy - t/2),   # 2: upper-mid-inner (near tip)
        (cx + tip, cy),                 # 3: tip
        (cx + tip - t*0.5, cy + t/2),   # 4: lower-mid-inner
        (cx - w/2 + t, cy + h/2),       # 5: bottom-left-inner
        (cx - w/2, cy + h/2),           # 6: bottom-left
        (cx - w/2 + t + t*0.5, cy),     # 7: mid-left (notch)
    ]
    draw.polygon(points, fill=color)


def draw_status_dot(draw, cx, cy, r, color):
    """Draw a small filled circle (status indicator)."""
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)


# --- App icon (1024x1024 source) ------------------------------------------

def render_app_icon(size):
    """Render the full-color app icon at the given size.
    Slate rounded-square background + emerald hexagon + white chevron + amber dot.
    """
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Background: rounded square with gradient
    # Simple two-tone gradient (top-left lighter, bottom-right darker)
    grad = Image.new("RGBA", (size, size), SLATE_900)
    grad_draw = ImageDraw.Draw(grad)
    # Overlay a slightly lighter rectangle in the top-left for subtle gradient
    for i in range(size):
        alpha = int(15 * (1 - i / size))
        grad_draw.line([(0, i), (size, i)], fill=(30, 41, 59, alpha))
    img = Image.alpha_composite(img, grad)
    draw = ImageDraw.Draw(img)

    # Rounded square mask for the background
    radius = size // 5  # iOS/macOS-style rounding
    mask = Image.new("L", (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([0, 0, size, size], radius=radius, fill=255)
    img.putalpha(mask)

    # --- Hexagon (command module) ---
    cx, cy = size // 2, size // 2
    hex_r = int(size * 0.34)
    hex_width = max(2, int(size * 0.025))

    # Hexagon fill (subtle emerald tint)
    verts = hexagon_vertices(cx, cy, hex_r - hex_width)
    overlay = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)
    overlay_draw.polygon(verts, fill=(16, 185, 129, 25))
    img = Image.alpha_composite(img, overlay)
    draw = ImageDraw.Draw(img)

    # Hexagon outline (emerald)
    draw_hexagon_outline(draw, cx, cy, hex_r, EMERALD_500, hex_width)

    # --- Chevron (run prompt) ---
    chevron_size = int(size * 0.22)
    # Nudge chevron slightly left so it's centered in the hexagon's visual space
    draw_chevron(draw, cx - int(size * 0.02), cy, chevron_size, WHITE, max(2, int(size * 0.04)))

    # --- Status dot (amber, upper-right interior) ---
    dot_offset = int(hex_r * 0.55)
    dot_r = max(2, int(size * 0.022))
    draw_status_dot(draw, cx + dot_offset, cy - dot_offset, dot_r, AMBER_400)
    # Subtle glow ring
    glow_r = dot_r + max(1, int(size * 0.008))
    draw_status_dot(draw, cx + dot_offset, cy - dot_offset, glow_r, (251, 191, 36, 60))

    return img


# --- Tray icon (template — white on transparent) --------------------------

def render_tray_icon_template(size):
    """macOS template image: pure white with alpha, no background.
    macOS auto-renders template images as black in light mode, white in dark mode.
    """
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    cx, cy = size // 2, size // 2
    hex_r = int(size * 0.42)
    hex_width = max(1, int(size * 0.08))

    # Hexagon outline (white)
    draw_hexagon_outline(draw, cx, cy, hex_r, WHITE, hex_width)

    # Chevron (white)
    chevron_size = int(size * 0.28)
    draw_chevron(draw, cx - int(size * 0.02), cy, chevron_size, WHITE, max(1, int(size * 0.10)))

    return img


# --- Tray icon (colored — for Linux/Windows) -------------------------------

def render_tray_icon_colored(size):
    """Colored tray icon for Linux/Windows: emerald glyph on transparent."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    cx, cy = size // 2, size // 2
    hex_r = int(size * 0.42)
    hex_width = max(1, int(size * 0.08))

    # Hexagon outline (emerald)
    draw_hexagon_outline(draw, cx, cy, hex_r, EMERALD_500, hex_width)

    # Chevron (emerald-bright)
    chevron_size = int(size * 0.28)
    draw_chevron(draw, cx - int(size * 0.02), cy, chevron_size, EMERALD_400, max(1, int(size * 0.10)))

    # Status dot (amber)
    dot_offset = int(hex_r * 0.55)
    dot_r = max(1, int(size * 0.06))
    draw_status_dot(draw, cx + dot_offset, cy - dot_offset, dot_r, AMBER_400)

    return img


# --- Generate all PNG assets -----------------------------------------------

def main():
    print("Generating Mir brand assets...")

    # 1. App icon (1024x1024 source)
    app_icon = render_app_icon(1024)
    app_icon.save(os.path.join(OUTPUT_DIR, "app-icon-1024.png"))
    print("  app-icon-1024.png (1024x1024)")

    # Also save smaller app icon sizes for direct use
    for s in [512, 256, 128, 64, 32]:
        scaled = app_icon.resize((s, s), Image.LANCZOS)
        scaled.save(os.path.join(OUTPUT_DIR, f"app-icon-{s}.png"))
        print(f"  app-icon-{s}.png ({s}x{s})")

    # 2. Tray icons — template (macOS)
    for s in [16, 22, 32, 48, 64]:
        icon = render_tray_icon_template(s)
        if s == 22:
            icon.save(os.path.join(OUTPUT_DIR, "tray-icon-template.png"))
        icon.save(os.path.join(OUTPUT_DIR, f"tray-icon-{s}-template.png"))
    print("  tray-icon-{16,22,32,48,64}-template.png (macOS template)")

    # 3. Tray icons — colored (Linux/Windows)
    for s in [16, 22, 32, 48, 64]:
        icon = render_tray_icon_colored(s)
        icon.save(os.path.join(OUTPUT_DIR, f"tray-icon-{s}.png"))
    print("  tray-icon-{16,22,32,48,64}.png (colored)")

    # 4. Copy the 22px colored as the default tray icon
    render_tray_icon_colored(22).save(os.path.join(OUTPUT_DIR, "tray-icon-22.png"))
    # Copy the 22px template as the macOS default
    render_tray_icon_template(22).save(os.path.join(OUTPUT_DIR, "tray-icon-template.png"))

    # 5. Generate Windows .ico (multi-size)
    ico_sizes = [16, 32, 48, 64, 128, 256]
    ico_images = [app_icon.resize((s, s), Image.LANCZOS) for s in ico_sizes]
    ico_images[0].save(
        os.path.join(OUTPUT_DIR, "icon.ico"),
        format="ICO",
        sizes=[(s, s) for s in ico_sizes],
        append_images=ico_images[1:],
    )
    print("  icon.ico (Windows multi-size)")

    # 6. Save app icon as icon.png (Tauri default name)
    app_icon.save(os.path.join(OUTPUT_DIR, "icon.png"))
    print("  icon.png (Tauri source)")

    print(f"\nAll raster assets saved to {OUTPUT_DIR}")
    print("Next: generate SVG logo + favicon + wordmark")


if __name__ == "__main__":
    main()
