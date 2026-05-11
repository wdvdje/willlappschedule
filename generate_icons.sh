#!/bin/bash

# Generate TimeScape Planner Pro app icons from SVG
# This script creates all required macOS icon sizes

SVG_FILE="TimeScape_Icon_Design.svg"
ICON_DIR="TimeScapeMac/TimeScape Planner Pro/TimeScape Planner Pro/Assets.xcassets/AppIcon.appiconset"

# Create icon sizes (macOS requires 1x and 2x variants)
sizes=(
    "16"
    "32"
    "128"
    "256"
    "512"
)

echo "Generating TimeScape icons from SVG..."

for size in "${sizes[@]}"; do
    # 1x version
    magick convert -background none -size "${size}x${size}" "$SVG_FILE" -resize "${size}x${size}" -gravity center -extent "${size}x${size}" "$ICON_DIR/icon_${size}x${size}.png"
    echo "✓ Created icon_${size}x${size}.png"
    
    # 2x version (double resolution)
    size2=$((size * 2))
    magick convert -background none -size "${size2}x${size2}" "$SVG_FILE" -resize "${size2}x${size2}" -gravity center -extent "${size2}x${size2}" "$ICON_DIR/icon_${size}x${size}@2x.png"
    echo "✓ Created icon_${size}x${size}@2x.png"
done

echo ""
echo "✅ All icons generated successfully!"
echo "The icons are ready in: $ICON_DIR"
echo ""
echo "Next steps:"
echo "1. Open TimeScape Planner Pro.xcodeproj in Xcode"
echo "2. Build and run the app"
echo "3. The new icon will appear in the Dock and Finder"
