import numpy as np
from PIL import Image

def process_clouds():
    cloud1_src = r"C:\Users\ADMIN\.gemini\antigravity-ide\brain\f5126fcc-5845-43c0-9851-c5dc607e9b31\fps_cumulus_cloud_1792921145644.jpg"
    cloud2_src = r"C:\Users\ADMIN\.gemini\antigravity-ide\brain\f5126fcc-5845-43c0-9851-c5dc607e9b31\fps_stratus_cloud_1792921179652.jpg"
    
    out_dir = r"d:\2026event-main - Copy\teamnexus\frontend\public\assets"
    
    for idx, src in enumerate([cloud1_src, cloud2_src], 1):
        img = Image.open(src).convert("RGB")
        arr = np.array(img, dtype=np.float32)
        # Luminance as alpha
        lum = 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]
        # Smooth threshold for black background
        alpha = np.clip((lum - 12.0) / 180.0, 0.0, 1.0) * 255.0
        
        # Make cloud pure white with natural alpha shading
        out_arr = np.zeros((arr.shape[0], arr.shape[1], 4), dtype=np.uint8)
        out_arr[:, :, 0] = np.clip(arr[:, :, 0] + 30, 0, 255).astype(np.uint8)
        out_arr[:, :, 1] = np.clip(arr[:, :, 1] + 30, 0, 255).astype(np.uint8)
        out_arr[:, :, 2] = np.clip(arr[:, :, 2] + 40, 0, 255).astype(np.uint8)
        out_arr[:, :, 3] = alpha.astype(np.uint8)
        
        cloud_png = Image.fromarray(out_arr)
        out_path = f"{out_dir}\\cloud_{idx}.png"
        cloud_png.save(out_path, format="PNG")
        print(f"Saved cloud {idx} -> {out_path}")

def refine_weapon():
    green_img_path = r"C:\Users\ADMIN\.gemini\antigravity-ide\brain\f5126fcc-5845-43c0-9851-c5dc607e9b31\fps_gun_only_1792921058561.jpg"
    out_path = r"d:\2026event-main - Copy\teamnexus\frontend\public\assets\weapon_fps.png"
    
    img = Image.open(green_img_path).convert("RGBA")
    arr = np.array(img, dtype=np.float32)
    
    r = arr[:, :, 0]
    g = arr[:, :, 1]
    b = arr[:, :, 2]
    
    # Accurate chroma key
    # Green background has high G, much lower R and B
    is_pure_green = (g > 140) & (g > r + 40) & (g > b + 40)
    
    # Calculate difference
    diff = g - np.maximum(r, b)
    
    alpha = np.ones((arr.shape[0], arr.shape[1]), dtype=np.float32)
    # Background is 0
    alpha[is_pure_green] = np.clip(1.0 - (diff[is_pure_green] - 20) / 40.0, 0.0, 1.0)
    alpha[diff > 65] = 0.0
    
    # Despill: remove green cast from edges
    spill = (g > np.maximum(r, b)) & (alpha > 0.05)
    arr[spill, 1] = np.maximum(arr[spill, 0], arr[spill, 2]) * 0.92
    
    arr[:, :, 3] = alpha * 255.0
    weapon_img = Image.fromarray(arr.astype(np.uint8))
    weapon_img.save(out_path, format="PNG")
    print(f"Refined weapon PNG saved to {out_path}")

if __name__ == "__main__":
    process_clouds()
    refine_weapon()
