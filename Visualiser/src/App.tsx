import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { TerrainTuning } from './core/terrainTuning'

import { ThreeDVisualizer } from './components/ThreeDVisualizer'

type TerrainRenderResult = {
  width: number
  height: number
  heightMapBuffer: ArrayBuffer
  shadedPixelsBuffer: ArrayBuffer
  rawPixelsBuffer: ArrayBuffer
}

type WorkerResponse =
  | { type: 'ready' }
  | { type: 'result'; requestId: number; payload: TerrainRenderResult }
  | { type: 'error'; requestId?: number; message: string }

const defaultSeed = 1028
const defaultSize = 512

function createImageDataFromBuffer(buffer: ArrayBuffer, width: number, height: number) {
  return new ImageData(new Uint8ClampedArray(buffer), width, height)
}

function drawCanvas(canvas: HTMLCanvasElement | null, buffer: ArrayBuffer, width: number, height: number) {
  if (!canvas) {
    return
  }

  const context = canvas.getContext('2d')
  if (!context) {
    return
  }

  canvas.width = width
  canvas.height = height
  context.putImageData(createImageDataFromBuffer(buffer, width, height), 0, 0)
}

function App() {
  const workerRef = useRef<Worker | null>(null)
  const generationTokenRef = useRef(0)

  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const rawCanvasRef = useRef<HTMLCanvasElement | null>(null)

  const [seed, setSeed] = useState(String(defaultSeed))
  const [size, setSize] = useState(String(defaultSize))
  const [heightScale, setHeightScale] = useState(0.5)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [statusMessage, setStatusMessage] = useState('Prépare la génération du terrain.')
  const [terrain, setTerrain] = useState<TerrainRenderResult | null>(null)

  useEffect(() => {
    const worker = new Worker(new URL('./workers/terrainWorker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.type === 'ready') {
        return
      }

      if (event.data.type === 'error') {
        setStatus('error')
        setStatusMessage(event.data.message)
        return
      }

      if (event.data.type === 'result') {
        if (event.data.requestId !== generationTokenRef.current) {
          return
        }

        setTerrain(event.data.payload)
        setStatus('ready')
        setStatusMessage(`Terrain généré: ${event.data.payload.width} × ${event.data.payload.height}`)
      }
    }

    worker.onerror = (error) => {
      setStatus('error')
      setStatusMessage(error.message || 'Erreur inattendue dans le worker.')
    }

    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!terrain) {
      return
    }

    drawCanvas(mainCanvasRef.current, terrain.shadedPixelsBuffer, terrain.width, terrain.height)
    drawCanvas(rawCanvasRef.current, terrain.rawPixelsBuffer, terrain.width, terrain.height)
  }, [terrain])

  // stats calculation removed to fix unused variable error
  const generateTerrain = () => {
    const parsedSeed = Number(seed)
    const parsedSize = Number(size)

    if (!Number.isInteger(parsedSeed) || !Number.isInteger(parsedSize) || parsedSize < 64 || parsedSize > 1024) {
      setStatus('error')
      setStatusMessage('Choisis un seed entier et une taille entre 64 et 1024.')
      return
    }

    const worker = workerRef.current
    if (!worker) {
      setStatus('error')
      setStatusMessage('Le worker de génération n’est pas prêt.')
      return
    }

    generationTokenRef.current += 1
    const requestId = generationTokenRef.current

    setStatus('loading')
    setStatusMessage(`Génération du terrain ${parsedSize} × ${parsedSize}...`)

    const tuning = new TerrainTuning()
    worker.postMessage({
      type: 'generate',
      requestId,
      seed: parsedSeed,
      size: parsedSize,
      tuning,
    })
  }

  useEffect(() => {
    if (workerRef.current) {
      generateTerrain()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const terrainData = useMemo(() => {
    if (!terrain) return null
    return {
      heightMap: new Float32Array(terrain.heightMapBuffer),
      rawPixels: new Uint8ClampedArray(terrain.rawPixelsBuffer),
      width: terrain.width,
      height: terrain.height
    }
  }, [terrain])

  return (
    <div className="app-shell">
      <aside className="control-panel">
        <div className="social-links">
          <a href="https://www.youtube.com/@eymericchauchat" target="_blank" rel="noopener noreferrer" className="youtube-button">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
            Watch on YouTube
          </a>
          <div className="secondary-links">
            <a href="https://ko-fi.com/eymericchauchat" target="_blank" rel="noopener noreferrer">Ko-fi</a>
            <a href="https://chauquest.com/" target="_blank" rel="noopener noreferrer">Blog</a>
          </div>
        </div>

        <div className="panel-copy">
          <p className="eyebrow">Procedural island visualiser</p>
          <h1>Terrain Builder</h1>
          <p className="intro">
            Le terrain est généré directement dans le navigateur à partir du port TypeScript de{' '}
            <span>main.py</span>. Le worker calcule la heightmap et les biomes, puis l’interface affiche une
            vue 3D interactive ainsi que les rendus 2D.
          </p>
        </div>

        <div className="controls">
          <label>
            Seed
            <input type="number" value={seed} onChange={(event) => setSeed(event.target.value)} />
          </label>

          <label>
            Size
            <input
              type="number"
              min="64"
              max="1024"
              step="64"
              value={size}
              onChange={(event) => setSize(event.target.value)}
            />
          </label>

          <label>
            Height Scale
            <input
              type="range"
              min="0.05"
              max="2.5"
              step="0.05"
              value={heightScale}
              onChange={(event) => setHeightScale(Number(event.target.value))}
            />
          </label>

          <button className="generate-button" type="button" onClick={generateTerrain}>
            Generate Terrain
          </button>
        </div>

        <p className="hint">
          La vue 3D utilise la heightmap post-processée. En dessous, vous retrouvez le rendu ombré (environment.png)
          et les biomes bruts (environment_raw.png).
        </p>

        <p className="status-line">{statusMessage}</p>
      </aside>

      <main className="viewer-panel">
        <section className="hero-map">
          <div className="map-frame">
            {terrainData ? (
              <ThreeDVisualizer
                heightMap={terrainData.heightMap}
                rawPixels={terrainData.rawPixels}
                width={terrainData.width}
                height={terrainData.height}
                heightScale={heightScale}
              />
            ) : null}

            <div className="map-overlay-info">
              <p>3D Terrain Visualizer</p>
              <strong>{terrain ? `${terrain.width} × ${terrain.height}` : 'No data'}</strong>
            </div>

            {status !== 'ready' ? (
              <div className="loading-overlay">
                <span>{status === 'error' ? 'Generation failed' : 'Generating terrain'}</span>
                <strong>{statusMessage}</strong>
              </div>
            ) : null}
          </div>
        </section>

        <section className="preview-grid">
          <article className="preview-card">
            <div className="preview-labels">
              <span>Shaded terrain</span>
              <strong>environment.png</strong>
            </div>
            <div className="preview-canvas-wrapper">
              <canvas ref={mainCanvasRef} className="preview-canvas" />
              {status === 'loading' && <div className="mini-loading-shimmer" />}
            </div>
          </article>

          <article className="preview-card">
            <div className="preview-labels">
              <span>Raw biomes</span>
              <strong>environment_raw.png</strong>
            </div>
            <div className="preview-canvas-wrapper">
              <canvas ref={rawCanvasRef} className="preview-canvas" />
              {status === 'loading' && <div className="mini-loading-shimmer" />}
            </div>
          </article>
        </section>

      </main>
    </div>
  )
}

export default App

