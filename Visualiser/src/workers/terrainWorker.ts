/// <reference lib="webworker" />

import { Environment } from '../core/environment'
import { TerrainTuning } from '../core/terrainTuning'

interface GenerateRequest {
  type: 'generate'
  requestId: number
  seed: number
  size: number
  tuning: Partial<TerrainTuning>
}

interface WorkerResultMessage {
  type: 'result'
  requestId: number
  payload: {
    width: number
    height: number
    heightMapBuffer: ArrayBuffer
    shadedPixelsBuffer: ArrayBuffer
    rawPixelsBuffer: ArrayBuffer
    perlinContribBuffer: ArrayBuffer
    valueContribBuffer: ArrayBuffer
  }
}

interface WorkerErrorMessage {
  type: 'error'
  requestId?: number
  message: string
}

self.postMessage({ type: 'ready' } as const)

self.onmessage = (event: MessageEvent<GenerateRequest>) => {
  const message = event.data

  if (message.type !== 'generate') {
    return
  }

  try {
    const environment = new Environment(message.size, message.seed)
    const tuning = new TerrainTuning(message.tuning)
    const data = environment.generateTerrainData(message.seed, message.size, tuning)

    const result: WorkerResultMessage = {
      type: 'result',
      requestId: message.requestId,
      payload: {
        width: data.width,
        height: data.height,
        heightMapBuffer: data.heightMapBuffer,
        shadedPixelsBuffer: data.shadedPixelsBuffer,
        rawPixelsBuffer: data.rawPixelsBuffer,
        perlinContribBuffer: data.perlinContribBuffer,
        valueContribBuffer: data.valueContribBuffer,
      },
    }

    self.postMessage(result, [
      data.heightMapBuffer,
      data.shadedPixelsBuffer,
      data.rawPixelsBuffer,
      data.perlinContribBuffer,
      data.valueContribBuffer,
    ])
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'Erreur inconnue dans le worker.'
    const errorMessage: WorkerErrorMessage = {
      type: 'error',
      requestId: message.requestId,
      message: messageText,
    }
    self.postMessage(errorMessage)
  }
}

export {}
