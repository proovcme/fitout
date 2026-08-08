#!/usr/bin/env python3
"""Convert a chroma-green sprite atlas to transparent RGBA with green despill."""
from argparse import ArgumentParser
from pathlib import Path
from PIL import Image


def main():
    parser = ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--transparent-threshold", type=float, default=18)
    parser.add_argument("--opaque-threshold", type=float, default=150)
    parser.add_argument("--force", action="store_true")
    args, _ = parser.parse_known_args()
    if args.output.exists() and not args.force:
        raise SystemExit(f"Output exists: {args.output}")
    image = Image.open(args.input).convert("RGBA")
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, _ = pixels[x, y]
            distance = ((r - 0) ** 2 + (g - 255) ** 2 + (b - 0) ** 2) ** 0.5
            if distance <= args.transparent_threshold:
                alpha = 0
            elif distance >= args.opaque_threshold:
                alpha = 255
            else:
                alpha = round(255 * (distance - args.transparent_threshold) / (args.opaque_threshold - args.transparent_threshold))
            if alpha < 255 and g > max(r, b):
                g = min(g, max(r, b) + round((g - max(r, b)) * alpha / 255))
            pixels[x, y] = (r, g, b, alpha)
    image.save(args.output)
    print(f"Removed chroma key -> {args.output}")


if __name__ == "__main__":
    main()
