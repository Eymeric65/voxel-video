import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

interface ThreeDVisualizerProps {
  heightMap: Float32Array | null
  rawPixels: Uint8ClampedArray | null
  width: number
  height: number
  heightScale: number
}

export function ThreeDVisualizer({ heightMap, rawPixels, width, height, heightScale }: ThreeDVisualizerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<{
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    renderer: THREE.WebGLRenderer
    controls: OrbitControls
    mesh?: THREE.Mesh
    texture?: THREE.DataTexture
  } | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const scene = new THREE.Scene()
    
    // Create a simple gradient skybox/background
    const canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 512
    const context = canvas.getContext('2d')
    if (context) {
      const gradient = context.createLinearGradient(0, 0, 0, 512)
      gradient.addColorStop(0, '#0a1a2f')
      gradient.addColorStop(0.4, '#1e4877')
      gradient.addColorStop(0.7, '#4584b4')
      gradient.addColorStop(1, '#a1d9ff')
      context.fillStyle = gradient
      context.fillRect(0, 0, 2, 512)
      const backgroundTexture = new THREE.CanvasTexture(canvas)
      scene.background = backgroundTexture
    }

    const camera = new THREE.PerspectiveCamera(75, containerRef.current.clientWidth / containerRef.current.clientHeight, 0.1, 5000)
    
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.3
    
    if (containerRef.current.firstChild) {
      containerRef.current.removeChild(containerRef.current.firstChild)
    }
    containerRef.current.appendChild(renderer.domElement)

    scene.fog = new THREE.FogExp2(0x4584b4, 0.0005)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05

    const ambientLight = new THREE.AmbientLight(0xddeeff, 0.7)
    scene.add(ambientLight)

    const sunLight = new THREE.DirectionalLight(0xfff5e0, 2.2)
    sunLight.position.set(5, 10, 5)
    scene.add(sunLight)

    const fillLight = new THREE.DirectionalLight(0xddeeff, 0.5)
    fillLight.position.set(-5, 2, -5)
    scene.add(fillLight)

    sceneRef.current = { scene, camera, renderer, controls }

    const animate = () => {
      requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    const handleResize = () => {
      if (!containerRef.current || !sceneRef.current) return
      const { clientWidth, clientHeight } = containerRef.current
      sceneRef.current.camera.aspect = clientWidth / clientHeight
      sceneRef.current.camera.updateProjectionMatrix()
      sceneRef.current.renderer.setSize(clientWidth, clientHeight)
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      renderer.dispose()
      if (containerRef.current) {
        containerRef.current.removeChild(renderer.domElement)
      }
    }
  }, [])

  useEffect(() => {
    if (!sceneRef.current || !heightMap || !rawPixels || width === 0 || height === 0) return

    const { scene, mesh, texture } = sceneRef.current

    if (mesh) {
      scene.remove(mesh)
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    }
    if (texture) {
      texture.dispose()
    }

    const geometry = new THREE.PlaneGeometry(width, height, width - 1, height - 1)
    geometry.rotateX(-Math.PI / 2)

    const vertices = geometry.attributes.position.array
    for (let i = 0; i < heightMap.length; i++) {
      vertices[i * 3 + 1] = heightMap[i] * heightScale * (width / 5)
    }
    geometry.attributes.position.needsUpdate = true
    geometry.computeVertexNormals()

    const dataTexture = new THREE.DataTexture(
      rawPixels,
      width,
      height,
      THREE.RGBAFormat,
      THREE.UnsignedByteType
    )
    dataTexture.colorSpace = THREE.SRGBColorSpace
    dataTexture.flipY = true
    dataTexture.minFilter = THREE.NearestFilter
    dataTexture.magFilter = THREE.NearestFilter
    dataTexture.needsUpdate = true

    const material = new THREE.MeshStandardMaterial({
      map: dataTexture,
      roughness: 0.6, 
      metalness: 0.15,
      transparent: true,
    })

    material.onBeforeCompile = (shader) => {
      shader.uniforms.uMapSize = { value: new THREE.Vector2(width, height) };

      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
         varying vec2 vUvMask;`
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
         vUvMask = uv;`
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
         varying vec2 vUvMask;
         uniform vec2 uMapSize;

         float h21(vec2 p) {
             return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
         }

         float noise(vec2 p) {
             vec2 i = floor(p);
             vec2 f = fract(p);
             f = f*f*(3.0-2.0*f);
             float a = h21(i);
             float b = h21(i + vec2(1.0, 0.0));
             float c = h21(i + vec2(0.0, 1.0));
             float d = h21(i + vec2(1.0, 1.0));
             return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
         }`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `
        vec2 warpedUv = vUvMask;
        float n = noise(vUvMask * 40.0) * 0.015; 
        warpedUv += vec2(n, n);
        vec4 sampledColor = texture2D(map, warpedUv);
        diffuseColor *= sampledColor;
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
         vec2 center = vUvMask - 0.5;
         float dist = length(center) * 2.0;
         float mask = 1.0 - smoothstep(0.6, 1.0, dist);
         vec3 waterColor = vec3(30.0/255.0, 60.0/255.0, 130.0/255.0);
         float isDeepWater = smoothstep(0.15, 0.0, distance(gl_FragColor.rgb, waterColor));
         vec3 hazeColor = vec3(0.27, 0.51, 0.7);
         float hazeFactor = smoothstep(0.8, 1.0, dist);
         gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeColor, hazeFactor * (0.3 + isDeepWater * 0.7));
         gl_FragColor.a *= mask;`
      );
    };

    const newMesh = new THREE.Mesh(geometry, material)
    scene.add(newMesh)
    sceneRef.current.mesh = newMesh
    sceneRef.current.texture = dataTexture

    sceneRef.current.controls.target.set(0, 0, 0)
    const distance = width * 0.7
    sceneRef.current.camera.position.set(distance, distance * 0.6, distance)
    sceneRef.current.controls.update()

  }, [heightMap, rawPixels, width, height])

  useEffect(() => {
    if (!sceneRef.current || !sceneRef.current.mesh || !heightMap) return
    const mesh = sceneRef.current.mesh
    const vertices = mesh.geometry.attributes.position.array
    for (let i = 0; i < heightMap.length; i++) {
      const x = i % width
      const y = Math.floor(i / width)
      const nx = (x / (width - 1)) - 0.5
      const ny = (y / (height - 1)) - 0.5
      const dist = Math.sqrt(nx * nx + ny * ny) * 2.0
      const circularMask = 1.0 - THREE.MathUtils.smoothstep(dist, 0.7, 1.0)
      vertices[i * 3 + 1] = heightMap[i] * heightScale * (width / 5) * circularMask
    }
    mesh.geometry.attributes.position.needsUpdate = true
    mesh.geometry.computeVertexNormals()
  }, [heightScale])

  return <div ref={containerRef} style={{ width: '100%', height: '100%', borderRadius: '18px', overflow: 'hidden' }} />
}
