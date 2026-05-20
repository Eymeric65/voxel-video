import { mulberry32 } from '../utils/prng'

export class NoiseGrid {
  private p: number[]
  private values: number[]
  private gradients: Array<[number, number]>

  constructor(seed = 42) {
    const random = mulberry32(seed)

    this.p = Array.from({ length: 256 }, (_, index) => index)
    for (let index = this.p.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1))
      ;[this.p[index], this.p[swapIndex]] = [this.p[swapIndex], this.p[index]]
    }
    this.p = [...this.p, ...this.p]

    this.values = Array.from({ length: 256 }, () => random() * 2 - 1)
    this.gradients = [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]
  }

  getValue(x: number, y: number): number {
    return this.values[this.p[this.p[x & 255] + (y & 255)]]
  }

  getGradient(x: number, y: number): [number, number] {
    const index = this.p[this.p[x & 255] + (y & 255)] % 8
    return this.gradients[index]
  }
}
