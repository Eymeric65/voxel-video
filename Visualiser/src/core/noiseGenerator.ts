import { lerp, smoothstep } from '../utils/math'
import { NoiseGrid } from './noiseGrid'

export type NoiseFunction = (x: number, y: number) => number

export class NoiseGenerator {
  private grid: NoiseGrid

  constructor(seed = 42) {
    this.grid = new NoiseGrid(seed)
  }

  valueNoise(x: number, y: number): number {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const xf = x - xi
    const yf = y - yi

    const u = smoothstep(0, 1, xf)
    const v = smoothstep(0, 1, yf)

    const c00 = this.grid.getValue(xi, yi)
    const c10 = this.grid.getValue(xi + 1, yi)
    const c01 = this.grid.getValue(xi, yi + 1)
    const c11 = this.grid.getValue(xi + 1, yi + 1)

    const x1 = lerp(c00, c10, u)
    const x2 = lerp(c01, c11, u)
    return lerp(x1, x2, v)
  }

  perlinNoise(x: number, y: number): number {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const xf = x - xi
    const yf = y - yi

    const u = smoothstep(0, 1, xf)
    const v = smoothstep(0, 1, yf)

    const g00 = this.grid.getGradient(xi, yi)
    const g10 = this.grid.getGradient(xi + 1, yi)
    const g01 = this.grid.getGradient(xi, yi + 1)
    const g11 = this.grid.getGradient(xi + 1, yi + 1)

    const n00 = g00[0] * xf + g00[1] * yf
    const n10 = g10[0] * (xf - 1) + g10[1] * yf
    const n01 = g01[0] * xf + g01[1] * (yf - 1)
    const n11 = g11[0] * (xf - 1) + g11[1] * (yf - 1)

    const x1 = lerp(n00, n10, u)
    const x2 = lerp(n01, n11, u)
    return lerp(x1, x2, v)
  }

  fbm(func: NoiseFunction, x: number, y: number, octaves = 4): number {
    let total = 0
    let frequency = 1
    let amplitude = 1
    let maxValue = 0

    for (let index = 0; index < octaves; index += 1) {
      total += func(x * frequency, y * frequency) * amplitude
      maxValue += amplitude
      amplitude *= 0.5
      frequency *= 2
    }

    const normalized = total / maxValue
    return (normalized + 1) * 0.5
  }
}
