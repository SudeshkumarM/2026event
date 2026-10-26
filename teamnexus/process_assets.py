import numpy as np
from PIL import Image, ImageFilter

green_img_path = r"C:\Users\ADMIN\.gemini\antigravity-ide\brain\f5126fcc-5845-43c0-9851-c5dc607e9b31\fps_gun_only_1792921058561.jpg"
landscape_path = r"C:\Users\ADMIN\.gemini\antigravity-ide\brain\f5126fcc-5845-43c0-9851-c5dc607e9b31\fps_desert_landscape_1792920991503.jpg"

target_weapon_png = r"d:\2026event-main - Copy\teamnexus\frontend\public\assets\weapon_fps.png"
target_landscape_jpg = r"d:\2026event-main - Copy\teamnexus\frontend\public\assets\fps_desert_landscape.jpg"

# 1. Process weapon green screen
img = Image.open(green_img_path).convert("RGBA")
arr = np.array(img, dtype=np.float32)

r = arr[:, :, 0]
g = arr[:, :, 1]
b = arr[:, :, 2]

# Chroma green detection
# The background is bright green: g is high, r and b are much lower
is_green = (g > 150) & (g > r * 1.35) & (g > b * 1.35)

# Calculate smooth alpha
# If definitely green, alpha = 0. If definitely weapon, alpha = 255.
# For edge pixels (transition zone), smooth falloff
green_diff = g - np.maximum(r, b)
# Where green_diff is large (> 60), it's green background
# Where green_diff <= 15, it's definitely weapon
alpha = np.clip(1.0 - (green_diff - 15) / 55.0, 0.0, 1.0)
# But force 1.0 where not green at all
alpha[~is_green] = 1.0
alpha[is_green & (green_diff > 70)] = 0.0

# Despill: reduce green spill on border pixels
spill_mask = (g > np.maximum(r, b)) & (alpha > 0)
arr[spill_mask, 1] = np.maximum(arr[spill_mask, 0], arr[spill_mask, 2]) * 0.95

# Set alpha channel
arr[:, :, 3] = alpha * 255.0
weapon_rgba = Image.fromarray(arr.astype(np.uint8))

# Save weapon transparent PNG
weapon_rgba.save(target_weapon_png, format="PNG")
print(f"Saved weapon PNG: {target_weapon_png}, size: {weapon_rgba.size}")

# 2. Save landscape JPG
landscape = Image.open(landscape_path)
landscape.save(target_landscape_jpg, quality=95)
print(f"Saved landscape JPG: {target_landscape_jpg}, size: {landscape.size}")
