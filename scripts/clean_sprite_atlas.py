#!/usr/bin/env python3
"""Remove small disconnected image-generation debris from sprite atlas cells."""
from argparse import ArgumentParser
from collections import deque
from pathlib import Path
from PIL import Image


def clean_cell(image, bounds, alpha_threshold=18, min_ratio=0.004):
    left, top, right, bottom = bounds
    crop = image.crop(bounds)
    alpha = crop.getchannel("A")
    width, height = crop.size
    pixels = alpha.load()
    visited = bytearray(width * height)
    components = []
    for y in range(height):
        for x in range(width):
            index = y * width + x
            if visited[index] or pixels[x, y] <= alpha_threshold:
                continue
            queue = deque([(x, y)])
            visited[index] = 1
            component = []
            while queue:
                px, py = queue.popleft()
                component.append((px, py))
                for nx, ny in ((px - 1, py), (px + 1, py), (px, py - 1), (px, py + 1)):
                    if 0 <= nx < width and 0 <= ny < height:
                        neighbour = ny * width + nx
                        if not visited[neighbour] and pixels[nx, ny] > alpha_threshold:
                            visited[neighbour] = 1
                            queue.append((nx, ny))
            components.append(component)
    if not components:
        return 0
    largest = max(len(component) for component in components)
    minimum = max(10, int(largest * min_ratio))
    removed = 0
    rgba = crop.load()
    for component in components:
        if len(component) >= minimum:
            continue
        for x, y in component:
            rgba[x, y] = (0, 0, 0, 0)
            removed += 1
    image.paste(crop, (left, top))
    return removed


def main():
    parser = ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("--columns", type=int, required=True)
    parser.add_argument("--rows", type=int, required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    image = Image.open(args.input).convert("RGBA")
    removed = 0
    for row in range(args.rows):
        for column in range(args.columns):
            bounds = (
                round(column * image.width / args.columns),
                round(row * image.height / args.rows),
                round((column + 1) * image.width / args.columns),
                round((row + 1) * image.height / args.rows),
            )
            removed += clean_cell(image, bounds)
    output = args.output or args.input
    image.save(output)
    print(f"Cleaned {removed} debris pixels -> {output}")


if __name__ == "__main__":
    main()
