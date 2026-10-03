#!/bin/bash

# Create webp directory if it doesn't exist
mkdir -p webp

# Convert all JPEG/JPG/PNG images in the current directory to WebP
for img in *.jpg *.jpeg *.png *.JPG *.JPEG; do
    if [ -f "$img" ]; then
        # Get filename without extension
        filename="${img%.*}"
        
        echo "Converting $img to WebP..."
        cwebp -q 80 "$img" -o "webp/${filename}.webp"
    fi
done

echo "Conversion complete! WebP images are in the 'webp' directory."