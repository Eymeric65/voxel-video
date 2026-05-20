export class TerrainTuning {
  water_line = 0.17
  shallow_water_line = 0.3
  shore_line = 0.4
  grass_line = 0.65
  rock_line = 0.74
  snow_line = 0.86
  mountain_start = 0.72
  mountain_end = 0.96
  value_strength = 0.3
  base_strength = 0.82
  land_bias = 0.05

  constructor(init?: Partial<TerrainTuning>) {
    Object.assign(this, init)
  }
}
