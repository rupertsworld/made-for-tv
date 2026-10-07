"""Generate the grain textures laid over the Zen Ink wallpaper gradients.

Each texture is a 256-pixel square of monochrome noise, tiled over the
gradient at 128 CSS pixels, so one texture pixel covers one device pixel on a
2x display. Every pixel is white or black at a low opacity: white lightens the
gradient, black darkens it, and the average stays the same. A grey noise
would instead pull the gradient towards grey and wash it out.

The opacity is worked out against a typical colour of the gradient so that the
grain moves each pixel by about GRAIN_LEVELS on the 0-255 scale.

Requires Pillow. Run from any directory: python3 make-grain.py
"""
from pathlib import Path

from PIL import Image

SIZE = 256
GRAIN_LEVELS = 1.0  # standard deviation of the change, in 8-bit levels
ASSETS = Path(__file__).resolve().parent / "assets"

# Each texture and a typical 8-bit value of the gradient beneath it.
TEXTURES = {"grain-light.png": 200, "grain-dark.png": 45}


def texture(base):
    # Pillow draws Gaussian noise centred on 128; a wide spread is scaled down
    # to keep fractions of a level.
    spread = 32
    noise = Image.effect_noise((SIZE, SIZE), spread).get_flattened_data()
    pixels = []
    for value in noise:
        change = (value - 128) / spread * GRAIN_LEVELS
        if change >= 0:
            pixels.append((255, round(255 * change / (255 - base))))
        else:
            pixels.append((0, round(255 * -change / base)))
    image = Image.new("LA", (SIZE, SIZE))
    image.putdata(pixels)
    return image


if __name__ == "__main__":
    ASSETS.mkdir(exist_ok=True)
    for name, base in TEXTURES.items():
        texture(base).save(ASSETS / name, optimize=True)
        print(ASSETS / name)
