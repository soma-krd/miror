"""Generate tray icons for DevPilot.

Creates PNG icons at multiple sizes suitable for:
  - macOS menu bar (22x22, template image — white with transparency)
  - Linux system tray (22x22, 24x24)
  - Windows system tray (16x16, 32x32)

The icon is a simple "control tower" glyph: a filled circle (representing
a running service) inside a rounded square outline, with two small status
dots on the right.
"""

from PIL import Image, ImageDraw
import os

OUTPUT_DIR = "/home/z/my-project/src-tauri/icons"
os.makedirs(OUTPUT_DIR, exist_ok=True)


def draw_icon(size: int, template: bool = False) -> Image.Image:
    """Draw the DevPilot tray icon at the given size.

    Args:
        size: pixel dimensions (square)
        template: if True, render in white-on-transparent (macOS template style)
                   if False, render in emerald-on-dark-slate (colored)
    """
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Scale factors relative to size
    pad = max(1, size // 8)
    inner_size = size - 2 * pad

    if template:
        # macOS template: pure white with alpha
        fg = (255, 255, 255, 255)
        accent = (255, 255, 255, 180)
    else:
        # Colored: emerald on dark slate
        bg = (16, 24, 39, 230)  # slate-900 with slight transparency
        fg = (16, 185, 129, 255)  # emerald-500
        accent = (245, 158, 11, 255)  # amber-500
        # Background rounded square
        draw.rounded_rectangle(
            [pad, pad, pad + inner_size, pad + inner_size],
            radius=max(2, inner_size // 5),
            fill=bg,
        )

    # Main circle (running indicator) — left side
    circle_diameter = int(inner_size * 0.45)
    cx = pad + int(inner_size * 0.35)
    cy = pad + int(inner_size * 0.5)
    draw.ellipse(
        [cx - circle_diameter // 2, cy - circle_diameter // 2,
         cx + circle_diameter // 2, cy + circle_diameter // 2],
        fill=fg,
    )

    # Two small status dots on the right
    dot_r = max(1, int(inner_size * 0.07))
    for i, offset in enumerate([0.7, 0.85]):
        dx = pad + int(inner_size * offset)
        dy_top = pad + int(inner_size * 0.35)
        dy_bot = pad + int(inner_size * 0.65)
        draw.ellipse([dx - dot_r, dy_top - dot_r, dx + dot_r, dy_top + dot_r], fill=fg)
        draw.ellipse([dx - dot_r, dy_bot - dot_r, dx + dot_r, dy_bot + dot_r], fill=accent)

    return img


# Generate all sizes
sizes = [
    (16, "tray-icon-16.png", False),
    (22, "tray-icon-22.png", False),       # macOS menu bar standard
    (32, "tray-icon-32.png", False),
    (48, "tray-icon-48.png", False),
    (64, "tray-icon-64.png", False),
    (22, "tray-icon-template.png", True),   # macOS template variant
]

for size, name, template in sizes:
    img = draw_icon(size, template)
    path = os.path.join(OUTPUT_DIR, name)
    img.save(path)
    print(f"  generated {name} ({size}x{size}, template={template})")

# Also generate the main app icon at 1024x1024 for Tauri's icon generator
app_icon = Image.new("RGBA", (1024, 1024), (16, 24, 39, 255))
draw = ImageDraw.Draw(app_icon)
# Large emerald circle
draw.ellipse([256, 256, 768, 768], fill=(16, 185, 129, 255))
# Inner dark circle
draw.ellipse([340, 340, 684, 684], fill=(16, 24, 39, 255))
# Center dot
draw.ellipse([440, 440, 584, 584], fill=(16, 185, 129, 255))
app_icon.save(os.path.join(OUTPUT_DIR, "app-icon-1024.png"))
print(f"  generated app-icon-1024.png (source for cargo tauri icon)")

print(f"\nAll icons saved to {OUTPUT_DIR}")
