import { smoothstep } from '../utils/math'
import { NoiseGenerator } from './noiseGenerator'
import { TerrainTuning } from './terrainTuning'

export type Color = [number, number, number]

export type TerrainBuffers = {
  width: number
  height: number
  heightMapBuffer: ArrayBuffer
  shadedPixelsBuffer: ArrayBuffer
  rawPixelsBuffer: ArrayBuffer
}

export class Environment {
  private size: number
  private noiseGenerator: NoiseGenerator

  constructor(size: number, seed = 42) {
    this.size = size
    this.noiseGenerator = new NoiseGenerator(seed)
  }

  private getIslandMask(x: number, y: number): number {
    const nx = (x / this.size) * 2 - 1
    const ny = (y / this.size) * 2 - 1
    const coastNoise = this.noiseGenerator.fbm(
      this.noiseGenerator.perlinNoise.bind(this.noiseGenerator),
      (x / this.size) * 2,
      (y / this.size) * 2,
      3,
    )
    const dist = Math.sqrt(nx ** 2 + ny ** 2) + (coastNoise - 0.5) * 0.12
    return 1 - smoothstep(0.45, 0.98, dist)
  }

  private buildHeightMaps(tuning: TerrainTuning) {
    const width = this.size
    const height = this.size

    const terrainHeightMap = new Float32Array(width * height)
    const perlinContribMap = new Float32Array(width * height)
    const valueContribMap = new Float32Array(width * height)

    const perlinNoise = this.noiseGenerator.perlinNoise.bind(this.noiseGenerator)
    const valueNoise = this.noiseGenerator.valueNoise.bind(this.noiseGenerator)
    const scale = 4 / this.size

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x
        const pNoise = this.noiseGenerator.fbm(perlinNoise, x * scale, y * scale, 5)
        const vNoise = this.noiseGenerator.fbm(valueNoise, x * scale * 3, y * scale * 3, 4)
        const ridgeNoise = this.noiseGenerator.fbm(perlinNoise, x * scale * 0.45, y * scale * 0.45, 3)
        const mask = this.getIslandMask(x, y)

        const baseTerrain = smoothstep(0.28, 0.72, pNoise) * mask
        const mountainCore = smoothstep(tuning.mountain_start, tuning.mountain_end, mask)
        const valueGate = 0.35 + 0.65 * ridgeNoise
        const mountainRidge = vNoise * mountainCore * valueGate * mask * tuning.value_strength

        const finalHeight = Math.min(1, baseTerrain * tuning.base_strength + mountainRidge + mask * tuning.land_bias)

        terrainHeightMap[index] = finalHeight
        perlinContribMap[index] = Math.max(0, Math.min(1, baseTerrain))
        valueContribMap[index] = Math.max(0, Math.min(1, mountainCore * mask))
      }
    }

    return { terrainHeightMap, perlinContribMap, valueContribMap }
  }

  private postProcessSurface(terrainHeightMap: Float32Array, tuning: TerrainTuning): Float32Array {
    const width = this.size
    const height = this.size
    const postSurfaceHeightMap = new Float32Array(width * height)

    const sourceEdges = [
      0,
      tuning.shallow_water_line,
      tuning.shore_line,
      tuning.grass_line,
      tuning.rock_line,
      tuning.snow_line,
      1,
    ]

    const scales = [0, 0.25, 0.5, 1.25, 2, 2.5]
    const weightedLengths: number[] = []

    for (let index = 0; index < scales.length; index += 1) {
      const sourceLength = Math.max(1e-6, sourceEdges[index + 1] - sourceEdges[index])
      weightedLengths.push(sourceLength * scales[index])
    }

    const totalWeighted = weightedLengths.reduce((sum, value) => sum + value, 0)
    const targetEdges: number[] = [0]
    let acc = 0
    for (const weightedLength of weightedLengths) {
      acc += weightedLength / totalWeighted
      targetEdges.push(acc)
    }

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x
        const heightValue = Math.max(0, Math.min(1, terrainHeightMap[index]))

        let segment = 0
        for (let edgeIndex = 0; edgeIndex < sourceEdges.length - 1; edgeIndex += 1) {
          if (heightValue <= sourceEdges[edgeIndex + 1] || edgeIndex === sourceEdges.length - 2) {
            segment = edgeIndex
            break
          }
        }

        const srcA = sourceEdges[segment]
        const srcB = sourceEdges[segment + 1]
        const dstA = targetEdges[segment]
        const dstB = targetEdges[segment + 1]
        const t = (heightValue - srcA) / Math.max(1e-6, srcB - srcA)
        const remappedHeight = dstA + t * (dstB - dstA)

        postSurfaceHeightMap[index] = Math.max(0, Math.min(1, remappedHeight))
      }
    }

    return postSurfaceHeightMap
  }

  private classifyBiome(h: number, gradient: number, tuning: TerrainTuning): Color {
    const deepWater: Color = [30, 60, 130]
    const shallowWater: Color = [60, 160, 220]
    const sand: Color = [220, 200, 150]
    const grass: Color = [60, 150, 60]
    const dirt: Color = [120, 90, 60]
    const rock: Color = [130, 130, 130]
    const snow: Color = [245, 245, 255]

    if (h < tuning.water_line) {
      return deepWater
    }

    if (h < tuning.shallow_water_line) {
      return shallowWater
    }

    if (h < tuning.shore_line) {
      return sand
    }

    if (h < tuning.grass_line) {
      return gradient <= 0.02 ? grass : dirt
    }

    if (h < tuning.rock_line) {
      return gradient > 0.035 ? dirt : rock
    }

    if (h < tuning.snow_line) {
      return rock
    }

    return snow
  }

  private renderRawPixels(surfaceHeightMap: Float32Array, tuning: TerrainTuning): Uint8ClampedArray {
    const width = this.size
    const height = this.size
    const pixels = new Uint8ClampedArray(width * height * 4)

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x
        const h = surfaceHeightMap[index]

        const hx0 = surfaceHeightMap[y * width + Math.max(0, x - 1)]
        const hx1 = surfaceHeightMap[y * width + Math.min(width - 1, x + 1)]
        const hy0 = surfaceHeightMap[Math.max(0, y - 1) * width + x]
        const hy1 = surfaceHeightMap[Math.min(height - 1, y + 1) * width + x]
        const gradient = Math.max(Math.abs(hx1 - hx0), Math.abs(hy1 - hy0))

        const [r, g, b] = this.classifyBiome(h, gradient, tuning)
        const pixelIndex = index * 4
        pixels[pixelIndex] = r
        pixels[pixelIndex + 1] = g
        pixels[pixelIndex + 2] = b
        pixels[pixelIndex + 3] = 255
      }
    }

    return pixels
  }

  private applyShading(surfaceHeightMap: Float32Array, rawPixels: Uint8ClampedArray): Uint8ClampedArray {
    const width = this.size
    const height = this.size
    const shadedPixels = new Uint8ClampedArray(width * height * 4)

    const lightDirection: Color = [-1, 1, 0.9]
    const lightLength = Math.hypot(lightDirection[0], lightDirection[1], lightDirection[2])
    const lx = lightDirection[0] / lightLength
    const ly = lightDirection[1] / lightLength
    const lz = lightDirection[2] / lightLength

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x
        const pixelIndex = index * 4

        const hx0 = surfaceHeightMap[y * width + Math.max(0, x - 1)]
        const hx1 = surfaceHeightMap[y * width + Math.min(width - 1, x + 1)]
        const hy0 = surfaceHeightMap[Math.max(0, y - 1) * width + x]
        const hy1 = surfaceHeightMap[Math.min(height - 1, y + 1) * width + x]

        const dx = (hx1 - hx0) * width * 0.15
        const dy = (hy1 - hy0) * height * 0.15
        const normalLength = Math.hypot(dx, dy, 1)
        const nx = -dx / normalLength
        const ny = -dy / normalLength
        const nz = 1 / normalLength

        const diffuse = Math.max(0, nx * lx + ny * ly + nz * lz)
        const lightIntensity = 0.8 + diffuse * 0.4 // Increased from 0.6 + 0.3

        shadedPixels[pixelIndex] = Math.min(255, Math.floor(rawPixels[pixelIndex] * lightIntensity))
        shadedPixels[pixelIndex + 1] = Math.min(255, Math.floor(rawPixels[pixelIndex + 1] * lightIntensity))
        shadedPixels[pixelIndex + 2] = Math.min(255, Math.floor(rawPixels[pixelIndex + 2] * lightIntensity))
        shadedPixels[pixelIndex + 3] = 255
      }
    }

    return shadedPixels
  }

  generateTerrainData(seed: number, size: number, tuning: TerrainTuning): TerrainBuffers {
    this.size = size
    this.noiseGenerator = new NoiseGenerator(seed)

    const { terrainHeightMap } = this.buildHeightMaps(tuning)
    const postSurfaceHeightMap = this.postProcessSurface(terrainHeightMap, tuning)
    const rawPixels = this.renderRawPixels(terrainHeightMap, tuning)
    const shadedPixels = this.applyShading(postSurfaceHeightMap, rawPixels)

    return {
      width: this.size,
      height: this.size,
      heightMapBuffer: postSurfaceHeightMap.buffer as ArrayBuffer,
      shadedPixelsBuffer: shadedPixels.buffer as ArrayBuffer,
      rawPixelsBuffer: rawPixels.buffer as ArrayBuffer,
    }
  }
}
