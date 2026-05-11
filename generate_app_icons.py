#!/usr/bin/env python3
"""
Generate TimeScape Planner Pro app icons for macOS
Creates all required icon sizes from a programmatic design
"""

from PIL import Image, ImageDraw, ImageFilter
import os

def create_icon(size: int) -> Image.Image:
    """Create a glassy Big Sur-style TimeScape icon at the specified size."""

    # Draw at higher resolution and downsample for cleaner curves.
    scale = 4
    w = size * scale
    h = size * scale

    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)

    def lerp(a: int, b: int, t: float) -> int:
        return int(a + (b - a) * t)

    # Rich blue diagonal gradient background.
    top = (106, 182, 255)
    mid = (72, 126, 255)
    bottom = (42, 64, 194)
    for y in range(h):
        for x in range(w):
            t = ((x / max(w - 1, 1)) * 0.40) + ((y / max(h - 1, 1)) * 0.60)
            t = min(max(t, 0.0), 1.0)
            if t < 0.5:
                tt = t / 0.5
                r = lerp(top[0], mid[0], tt)
                g = lerp(top[1], mid[1], tt)
                b = lerp(top[2], mid[2], tt)
            else:
                tt = (t - 0.5) / 0.5
                r = lerp(mid[0], bottom[0], tt)
                g = lerp(mid[1], bottom[1], tt)
                b = lerp(mid[2], bottom[2], tt)
            draw.point((x, y), fill=(r, g, b, 255))

    # Soft atmospheric light blobs.
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    gdraw.ellipse((int(w * -0.14), int(h * -0.20), int(w * 0.68), int(h * 0.50)), fill=(216, 239, 255, 120))
    gdraw.ellipse((int(w * 0.34), int(h * 0.45), int(w * 1.05), int(h * 1.08)), fill=(104, 156, 255, 105))
    gdraw.ellipse((int(w * 0.12), int(h * 0.62), int(w * 0.70), int(h * 1.12)), fill=(66, 112, 240, 95))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=max(10, size // 4)))
    canvas = Image.alpha_composite(canvas, glow)

    # Clip to rounded-square icon mask.
    mask = Image.new("L", (w, h), 0)
    mdraw = ImageDraw.Draw(mask)
    corner = int(w * 0.224)
    mdraw.rounded_rectangle((0, 0, w - 1, h - 1), radius=corner, fill=255)

    clipped = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    clipped.paste(canvas, (0, 0), mask)
    canvas = clipped
    draw = ImageDraw.Draw(canvas)

    # Layer 1: translucent back plate.
    back_plate = (
        int(w * 0.18),
        int(h * 0.20),
        int(w * 0.82),
        int(h * 0.82)
    )
    back_radius = int(w * 0.11)

    back_shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    bsd = ImageDraw.Draw(back_shadow)
    bsd.rounded_rectangle(
        (back_plate[0], back_plate[1] + int(h * 0.02), back_plate[2], back_plate[3] + int(h * 0.02)),
        radius=back_radius,
        fill=(8, 20, 56, 85)
    )
    back_shadow = back_shadow.filter(ImageFilter.GaussianBlur(radius=max(12, size // 3)))
    canvas = Image.alpha_composite(canvas, back_shadow)
    draw = ImageDraw.Draw(canvas)

    draw.rounded_rectangle(back_plate, radius=back_radius, fill=(226, 241, 255, 82))
    draw.rounded_rectangle(back_plate, radius=back_radius, outline=(255, 255, 255, 115), width=max(3, size // 26))

    # Layer 2: front floating card.
    card = (
        int(w * 0.13),
        int(h * 0.16),
        int(w * 0.87),
        int(h * 0.84)
    )
    radius = int(w * 0.10)

    front_shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    fsd = ImageDraw.Draw(front_shadow)
    fsd.rounded_rectangle(
        (card[0], card[1] + int(h * 0.014), card[2], card[3] + int(h * 0.014)),
        radius=radius,
        fill=(8, 16, 48, 92)
    )
    front_shadow = front_shadow.filter(ImageFilter.GaussianBlur(radius=max(10, size // 4)))
    canvas = Image.alpha_composite(canvas, front_shadow)
    draw = ImageDraw.Draw(canvas)

    draw.rounded_rectangle(card, radius=radius, fill=(243, 249, 255, 236))
    draw.rounded_rectangle(card, radius=radius, outline=(255, 255, 255, 170), width=max(3, size // 22))

    # Gloss strip across the front card.
    gloss_strip = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gsd = ImageDraw.Draw(gloss_strip)
    gsd.rounded_rectangle(
        (card[0] + int(w * 0.01), card[1] + int(h * 0.01), card[2] - int(w * 0.01), card[1] + int(h * 0.16)),
        radius=int(radius * 0.75),
        fill=(255, 255, 255, 75)
    )
    gloss_strip = gloss_strip.filter(ImageFilter.GaussianBlur(radius=max(6, size // 6)))
    canvas = Image.alpha_composite(canvas, gloss_strip)
    draw = ImageDraw.Draw(canvas)

    # Calendar top strip and binder tabs.
    top_bar_h = int((card[3] - card[1]) * 0.24)
    top_bar = (card[0], card[1], card[2], card[1] + top_bar_h)
    draw.rounded_rectangle(top_bar, radius=radius, fill=(79, 125, 248, 235))
    draw.rectangle((card[0], card[1] + top_bar_h - int(size * 0.22), card[2], card[1] + top_bar_h), fill=(79, 125, 248, 235))

    tab_w = int((card[2] - card[0]) * 0.16)
    tab_h = int(top_bar_h * 0.52)
    left_tab_x = card[0] + int((card[2] - card[0]) * 0.22)
    right_tab_x = card[0] + int((card[2] - card[0]) * 0.62)
    tab_y = card[1] - int(tab_h * 0.36)

    draw.rounded_rectangle((left_tab_x, tab_y, left_tab_x + tab_w, tab_y + tab_h), radius=int(tab_h * 0.42), fill=(236, 244, 255, 255))
    draw.rounded_rectangle((right_tab_x, tab_y, right_tab_x + tab_w, tab_y + tab_h), radius=int(tab_h * 0.42), fill=(236, 244, 255, 255))

    # Clean schedule lines.
    body_top = card[1] + top_bar_h + int(size * 0.30)
    line_gap = int((card[3] - body_top) * 0.22)
    line_thickness = max(4, size // 24)
    left_pad = card[0] + int((card[2] - card[0]) * 0.13)
    right_pad = card[2] - int((card[2] - card[0]) * 0.13)

    for i in range(3):
        y = body_top + (i * line_gap)
        draw.rounded_rectangle(
            (left_pad, y, right_pad, y + line_thickness),
            radius=int(line_thickness / 2),
            fill=(164, 181, 220, 220)
        )

    # Glassy accent orb.
    dot_r = int(size * 0.88)
    dot_cx = card[2] - int((card[2] - card[0]) * 0.14)
    dot_cy = card[3] - int((card[3] - card[1]) * 0.17)
    draw.ellipse((dot_cx - dot_r, dot_cy - dot_r, dot_cx + dot_r, dot_cy + dot_r), fill=(109, 166, 255, 252))
    draw.ellipse((dot_cx - int(dot_r * 0.58), dot_cy - int(dot_r * 0.58), dot_cx + int(dot_r * 0.58), dot_cy + int(dot_r * 0.58)), fill=(214, 235, 255, 245))

    orb_gloss = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ogd = ImageDraw.Draw(orb_gloss)
    ogd.ellipse(
        (
            dot_cx - int(dot_r * 0.92),
            dot_cy - int(dot_r * 1.04),
            dot_cx + int(dot_r * 0.22),
            dot_cy - int(dot_r * 0.12)
        ),
        fill=(255, 255, 255, 120)
    )
    orb_gloss = orb_gloss.filter(ImageFilter.GaussianBlur(radius=max(3, size // 8)))
    canvas = Image.alpha_composite(canvas, orb_gloss)
    draw = ImageDraw.Draw(canvas)

    # Overall gloss pass.
    gloss = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gloss_draw = ImageDraw.Draw(gloss)
    gloss_draw.ellipse((int(w * -0.22), int(h * -0.34), int(w * 1.04), int(h * 0.46)), fill=(255, 255, 255, 60))
    gloss = gloss.filter(ImageFilter.GaussianBlur(radius=max(10, size // 4)))
    canvas = Image.alpha_composite(canvas, gloss)

    # Gentle outer rim highlight.
    draw.rounded_rectangle(
        (1, 1, w - 2, h - 2),
        radius=corner,
        outline=(255, 255, 255, 108),
        width=max(3, size // 26)
    )

    return canvas.resize((size, size), resample=Image.Resampling.LANCZOS)

def generate_icons():
    """Generate all required macOS app icon sizes"""
    
    icon_dir = "TimeScapeMac/TimeScape Planner Pro/TimeScape Planner Pro/Assets.xcassets/AppIcon.appiconset"
    
    # Create directory if it doesn't exist
    os.makedirs(icon_dir, exist_ok=True)
    
    # macOS icon sizes (1x and 2x variants)
    sizes = [16, 32, 128, 256, 512]
    
    print("🎨 Generating TimeScape Planner Pro app icons...")
    print()
    
    for size in sizes:
        # 1x version
        icon_1x = create_icon(size)
        filename_1x = f"icon_{size}x{size}.png"
        path_1x = os.path.join(icon_dir, filename_1x)
        icon_1x.save(path_1x, 'PNG')
        print(f"✓ Created {filename_1x}")
        
        # 2x version (double resolution)
        size_2x = size * 2
        icon_2x = create_icon(size_2x)
        filename_2x = f"icon_{size}x{size}@2x.png"
        path_2x = os.path.join(icon_dir, filename_2x)
        icon_2x.save(path_2x, 'PNG')
        print(f"✓ Created {filename_2x}")
    
    print()
    print("✅ All icons generated successfully!")
    print(f"📁 Icons saved to: {icon_dir}")
    print()
    print("📋 Next steps:")
    print("   1. Open TimeScape Planner Pro.xcodeproj in Xcode")
    print("   2. In Xcode, select Assets.xcassets > AppIcon")
    print("   3. Drag the generated PNG files to the corresponding slots")
    print("   4. Build and run (⌘R)")
    print("   5. The new icon will appear in the Dock and Finder")

if __name__ == "__main__":
    generate_icons()
