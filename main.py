import math
import json
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Tuple, List, Callable

class NoiseGrid:
    """Precomputed random values and gradients for procedural noise generation."""
    def __init__(self, seed: int = 42):
        random.seed(seed)
        self.p = [i for i in range(256)]
        random.shuffle(self.p)
        self.p = self.p * 2
        
        # Random values for Value Noise between -1.0 and 1.0
        self.values = [random.uniform(-1.0, 1.0) for _ in range(256)]
        
        # Gradients for Perlin Noise
        self.gradients = [
            (1, 1), (-1, 1), (1, -1), (-1, -1),
            (1, 0), (-1, 0), (0, 1), (0, -1)
        ]

    def get_value(self, x: int, y: int) -> float:
        return self.values[self.p[self.p[x & 255] + (y & 255)]]

    def get_gradient(self, x: int, y: int) -> Tuple[float, float]:
        idx = self.p[self.p[x & 255] + (y & 255)] % 8
        return self.gradients[idx]

def smoothstep(edge0: float, edge1: float, x: float) -> float:
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)

def lerp(a: float, b: float, t: float) -> float:
    return a + t * (b - a)

# ---- Noise Generation ----

class NoiseGenerator:
    """Implements 2D Value and Perlin Noise algorithms."""
    def __init__(self, seed: int = 42):
        self.grid = NoiseGrid(seed)

    def value_noise(self, x: float, y: float) -> float:
        xi = int(math.floor(x))
        yi = int(math.floor(y))
        xf = x - xi
        yf = y - yi

        u = smoothstep(0.0, 1.0, xf)
        v = smoothstep(0.0, 1.0, yf)

        c00 = self.grid.get_value(xi, yi)
        c10 = self.grid.get_value(xi + 1, yi)
        c01 = self.grid.get_value(xi, yi + 1)
        c11 = self.grid.get_value(xi + 1, yi + 1)

        x1 = lerp(c00, c10, u)
        x2 = lerp(c01, c11, u)
        return lerp(x1, x2, v)

    def perlin_noise(self, x: float, y: float) -> float:
        xi = int(math.floor(x))
        yi = int(math.floor(y))
        xf = x - xi
        yf = y - yi

        u = smoothstep(0.0, 1.0, xf)
        v = smoothstep(0.0, 1.0, yf)

        g00 = self.grid.get_gradient(xi, yi)
        g10 = self.grid.get_gradient(xi + 1, yi)
        g01 = self.grid.get_gradient(xi, yi + 1)
        g11 = self.grid.get_gradient(xi + 1, yi + 1)

        # Dot products
        n00 = g00[0] * xf + g00[1] * yf
        n10 = g10[0] * (xf - 1) + g10[1] * yf
        n01 = g01[0] * xf + g01[1] * (yf - 1)
        n11 = g11[0] * (xf - 1) + g11[1] * (yf - 1)

        x1 = lerp(n00, n10, u)
        x2 = lerp(n01, n11, u)
        return lerp(x1, x2, v)

    def fbm(self, func: Callable[[float, float], float], x: float, y: float, octaves: int = 4) -> float:
        """Fractal Brownian Motion to add detail to the noise."""
        total = 0.0
        frequency = 1.0
        amplitude = 1.0
        max_value = 0.0
        for _ in range(octaves):
            total += func(x * frequency, y * frequency) * amplitude
            max_value += amplitude
            amplitude *= 0.5
            frequency *= 2.0
        
        # Normalize back to [0, 1] range rather than [-1, 1]
        val = total / max_value
        return (val + 1.0) * 0.5


# ---- Image Saving ----
import matplotlib.pyplot as plt
import numpy as np

def save_png(filename: str, width: int, height: int, pixels: List[Tuple[int, int, int]]):
    """Saves pixel data to a PNG file using Matplotlib."""
    array = np.array(pixels, dtype=np.uint8).reshape((height, width, 3))
    plt.imsave(filename, array)
    print(f"Saved: {filename}")

def to_grayscale(value: float) -> Tuple[int, int, int]:
    v = int(max(0.0, min(1.0, value)) * 255)
    return (v, v, v)


# ---- Environment Generation ----

@dataclass
class TerrainTuning:
    water_line: float = 0.17
    shallow_water_line: float =0.30
    shore_line: float = 0.4
    grass_line: float = 0.65
    rock_line: float = 0.74
    snow_line: float = 0.86
    mountain_start: float = 0.72
    mountain_end: float = 0.96
    value_strength: float = 0.18
    base_strength: float = 0.82
    land_bias: float = 0.05


class Environment:
    """Procedurally generates an island biome."""
    def __init__(self, size: int, seed: int = 42):
        self.size = size
        self.noise_gen = NoiseGenerator(seed)

    def get_island_mask(self, x: float, y: float) -> float:
        """Creates a softly irregular island mask."""
        nx = x / (self.size - 1) * 2.0 - 1.0
        ny = y / (self.size - 1) * 2.0 - 1.0
        coast_noise = self.noise_gen.fbm(
            self.noise_gen.perlin_noise,
            x / (self.size - 1) * 2.0,
            y / (self.size - 1) * 2.0,
            octaves=3,
        )
        dist = math.sqrt(nx**2 + ny**2) + (coast_noise - 0.5) * 0.12
        return 1.0 - smoothstep(0.45, 0.98, dist)

    def build_height_maps(self, tuning: TerrainTuning):
        width = self.size
        height = self.size

        terrain_height_map = [[0.0] * width for _ in range(height)]
        perlin_contrib_map = [[0.0] * width for _ in range(height)]
        value_contrib_map = [[0.0] * width for _ in range(height)]

        print("Generating height map...")
        for y in range(height):
            for x in range(width):
                scale = 4.0 / (self.size - 1)
                p_noise = self.noise_gen.fbm(self.noise_gen.perlin_noise, x * scale, y * scale, octaves=5)
                v_noise = self.noise_gen.fbm(self.noise_gen.value_noise, x * scale * 3.0, y * scale * 3.0, octaves=4)
                ridge_noise = self.noise_gen.fbm(self.noise_gen.perlin_noise, x * scale * 0.45, y * scale * 0.45, octaves=3)

                mask = self.get_island_mask(x, y)

                base_terrain = smoothstep(0.28, 0.72, p_noise) * mask
                # Define where the transition happens
                mountain_core = smoothstep(tuning.mountain_start, tuning.mountain_end, base_terrain)
                
                # Rocky Ridged Value Noise: forces sharp peaks
                v_noise_raw = self.noise_gen.fbm(self.noise_gen.value_noise, x * scale * 3.0, y * scale * 3.0, octaves=4)
                v_rocky = 1.0 - abs(v_noise_raw * 2.0 - 1.0)
                v_rocky = v_rocky * v_rocky  # Square it for extra sharpness
                
                # Target height for mountains: starts at base_terrain and adds rocky variation
                # Reduced multiplier to prevent clipping and extreme roughness
                rock_base = base_terrain * tuning.base_strength
                rock_target = rock_base + v_rocky * tuning.value_strength * 0.7

                # Interpolate between base Perlin and the rocky Value peaks
                combined_terrain = lerp(rock_base, rock_target, mountain_core)
                
                final_height = min(1.0, combined_terrain + mask * tuning.land_bias)
                
                terrain_height_map[y][x] = final_height
                
                # Contribution calculation
                eps = 1e-6
                total_raw = combined_terrain + (mask * tuning.land_bias)
                denom = max(eps, total_raw)
                perlin_contrib_map[y][x] = (base_terrain * tuning.base_strength * (1.0 - mountain_core)) / denom
                value_contrib_map[y][x] = (rock_target * mountain_core) / denom

        return terrain_height_map, perlin_contrib_map, value_contrib_map

    def post_process_surface(self, terrain_height_map, tuning: TerrainTuning):
        """Bijective piecewise-linear remap to compress/extend biome elevation bands."""
        width = self.size
        height = self.size
        post_surface_height_map = [[0.0] * width for _ in range(height)]

        # Source intervals (raw terrain space)
        source_edges = [
            0.0,
            tuning.shallow_water_line,
            tuning.shore_line,
            tuning.grass_line,
            tuning.rock_line,
            tuning.snow_line,
            1.0,
        ]

        # Interval scales: compress beach, keep medium on lowlands, extend rock and snow.
        scales = [0.00, 0.25, 0.5, 1.25, 2.0, 2.5]

        weighted_lengths = []
        for idx in range(len(scales)):
            src_len = max(1e-6, source_edges[idx + 1] - source_edges[idx])
            weighted_lengths.append(src_len * scales[idx])

        total_weighted = sum(weighted_lengths)
        target_edges = [0.0]
        acc = 0.0
        for w_len in weighted_lengths:
            acc += w_len / total_weighted
            target_edges.append(acc)

        for y in range(height):
            for x in range(width):
                h = max(0.0, min(1.0, terrain_height_map[y][x]))

                seg = 0
                for idx in range(len(source_edges) - 1):
                    if h <= source_edges[idx + 1] or idx == len(source_edges) - 2:
                        seg = idx
                        break

                src_a = source_edges[seg]
                src_b = source_edges[seg + 1]
                dst_a = target_edges[seg]
                dst_b = target_edges[seg + 1]
                t = (h - src_a) / max(1e-6, src_b - src_a)
                remapped_h = dst_a + t * (dst_b - dst_a)

                post_surface_height_map[y][x] = max(0.0, min(1.0, remapped_h))

        return post_surface_height_map

    def classify_biome(self, h: float, gradient: float, tuning: TerrainTuning) -> Tuple[int, int, int]:
        deep_water_c = (30, 60, 130)
        shallow_water_c = (60, 160, 220)
        sand_c = (220, 200, 150)
        grass_c = (60, 150, 60)
        dirt_c = (120, 90, 60)
        rock_c = (130, 130, 130)
        snow_c = (245, 245, 255)

        if h < tuning.water_line:
            return deep_water_c
        if h < tuning.shallow_water_line:
            return shallow_water_c
        if h < tuning.shore_line:
            return sand_c
        if h < tuning.grass_line:
            return grass_c if gradient <= 0.02 else dirt_c
        if h < tuning.rock_line:
            return dirt_c if gradient > 0.035 else rock_c
        if h < tuning.snow_line:
            return rock_c
        return snow_c

    def render_raw_pixels(self, surface_height_map, tuning: TerrainTuning):
        width = self.size
        height = self.size
        pixels = [(0, 0, 0)] * (width * height)

        for y in range(height):
            for x in range(width):
                h = surface_height_map[y][x]

                hx0 = surface_height_map[y][max(0, x - 1)]
                hx1 = surface_height_map[y][min(width - 1, x + 1)]
                hy0 = surface_height_map[max(0, y - 1)][x]
                hy1 = surface_height_map[min(height - 1, y + 1)][x]
                gradient = max(abs(hx1 - hx0), abs(hy1 - hy0))

                pixels[y * width + x] = self.classify_biome(h, gradient, tuning)

        return pixels

    def apply_shading(self, surface_height_map, raw_pixels):
        width = self.size
        height = self.size
        shaded_pixels = [(0, 0, 0)] * (width * height)

        light_dir = (-1.0, 1.0, 0.9)
        l_len = math.sqrt(light_dir[0]**2 + light_dir[1]**2 + light_dir[2]**2)
        lx, ly, lz = light_dir[0] / l_len, light_dir[1] / l_len, light_dir[2] / l_len

        for y in range(height):
            for x in range(width):
                idx = y * width + x
                color = raw_pixels[idx]

                hx0 = surface_height_map[y][max(0, x - 1)]
                hx1 = surface_height_map[y][min(width - 1, x + 1)]
                hy0 = surface_height_map[max(0, y - 1)][x]
                hy1 = surface_height_map[min(height - 1, y + 1)][x]

                dx = (hx1 - hx0) * width * 0.15
                dy = (hy1 - hy0) * height * 0.15
                n_len = math.sqrt(dx**2 + dy**2 + 1.0)
                nx, ny, nz = -dx / n_len, -dy / n_len, 1.0 / n_len

                diffuse = max(0.0, nx * lx + ny * ly + nz * lz)
                light_intensity = 0.6 + diffuse * 0.3

                shaded_pixels[idx] = (
                    min(255, int(color[0] * light_intensity)),
                    min(255, int(color[1] * light_intensity)),
                    min(255, int(color[2] * light_intensity)),
                )

        return shaded_pixels

    def export_terrain_data(self, height_map, color_pixels, export_size: int = 320):
        source_size = len(height_map)
        if source_size == 0:
            return

        step = (source_size - 1) / max(1, export_size - 1)
        terrain_heights: List[float] = []
        terrain_colors: List[int] = []

        for export_y in range(export_size):
            source_y = int(round(export_y * step))
            for export_x in range(export_size):
                source_x = int(round(export_x * step))
                source_index = source_y * source_size + source_x
                terrain_heights.append(round(height_map[source_y][source_x], 6))
                terrain_colors.extend(color_pixels[source_index])

        export_root = Path(__file__).resolve().parent / "Visualiser" / "public"
        export_root.mkdir(parents=True, exist_ok=True)
        export_path = export_root / "terrain-data.json"
        export_payload = {
            "width": export_size,
            "height": export_size,
            "heights": terrain_heights,
            "colors": terrain_colors,
        }
        export_path.write_text(json.dumps(export_payload, separators=(",", ":")))
        print(f"Saved: {export_path}")

    def generate(self):
        tuning = TerrainTuning()

        terrain_height_map, perlin_contrib_map, value_contrib_map = self.build_height_maps(tuning)

        post_surface_height_map = self.post_process_surface(terrain_height_map, tuning)

        raw_pixels = self.render_raw_pixels(terrain_height_map, tuning)

        shaded_pixels = self.apply_shading(post_surface_height_map, raw_pixels)

        print("Generating biomes and tracking noise contributions...")
        width = self.size
        height = self.size

        perlin_pixels = [(0, 0, 0)] * (width * height)
        value_pixels = [(0, 0, 0)] * (width * height)
        for y in range(height):
            for x in range(width):
                idx = y * width + x
                perlin_pixels[idx] = to_grayscale(perlin_contrib_map[y][x])
                value_pixels[idx] = to_grayscale(value_contrib_map[y][x])

        save_png("environment_raw.png", width, height, raw_pixels)
        save_png("environment.png", width, height, shaded_pixels)
        save_png("contribution_perlin.png", width, height, perlin_pixels)
        save_png("contribution_value.png", width, height, value_pixels)
        self.export_terrain_data(post_surface_height_map, shaded_pixels, export_size=width)

def main():
    print("Generating 2D Island...")
    # Generate 512x512 images - increase size if more detail is needed
    env = Environment(size=512, seed=8742)
    # gen 1 : 6810
    env.generate()
    print("Generation complete! Check the .png files in your directory.")

if __name__ == "__main__":
    main()
