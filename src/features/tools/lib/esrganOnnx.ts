import * as ort from 'onnxruntime-web'

const TILE = 256
const OVERLAP = 16
const SCALE = 4

let ortReady = false
let sessionCache: { key: string; session: ort.InferenceSession } | null = null

function ensureOrtConfigured(): void {
  if (ortReady) return
  ort.env.wasm.numThreads = 1
  ort.env.wasm.proxy = false
  const base = `${window.location.origin}/ort/`
  ort.env.wasm.wasmPaths = {
    wasm: `${base}ort-wasm-simd-threaded.wasm`,
    mjs: `${base}ort-wasm-simd-threaded.mjs`,
  }
  ortReady = true
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image_load_failed'))
    img.src = dataUrl
  })
}

function createCanvas(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  return canvas
}

function canvasToTensor(canvas: HTMLCanvasElement): ort.Tensor {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas_unavailable')
  const { width, height } = canvas
  const { data } = ctx.getImageData(0, 0, width, height)
  const area = width * height
  const tensor = new Float32Array(area * 3)
  for (let i = 0; i < area; i++) {
    const o = i * 4
    tensor[i] = data[o]! / 255
    tensor[area + i] = data[o + 1]! / 255
    tensor[area * 2 + i] = data[o + 2]! / 255
  }
  return new ort.Tensor('float32', tensor, [1, 3, height, width])
}

function tensorToCanvas(tensor: ort.Tensor): HTMLCanvasElement {
  const dims = tensor.dims.map(Number)
  const height = dims[2] ?? 0
  const width = dims[3] ?? 0
  if (!width || !height) throw new Error('onnx_bad_dims')
  const raw = tensor.data as Float32Array
  const area = width * height
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')!
  const out = ctx.createImageData(width, height)
  let maxValue = 0
  for (let i = 0; i < raw.length; i++) maxValue = Math.max(maxValue, raw[i] ?? 0)
  const scale = maxValue <= 1.5 ? 255 : 1
  for (let i = 0; i < area; i++) {
    out.data[i * 4] = Math.min(255, Math.max(0, Math.round((raw[i] ?? 0) * scale)))
    out.data[i * 4 + 1] = Math.min(255, Math.max(0, Math.round((raw[area + i] ?? 0) * scale)))
    out.data[i * 4 + 2] = Math.min(255, Math.max(0, Math.round((raw[area * 2 + i] ?? 0) * scale)))
    out.data[i * 4 + 3] = 255
  }
  ctx.putImageData(out, 0, 0)
  return canvas
}

async function getSession(cacheKey: string, modelBytes: Uint8Array): Promise<ort.InferenceSession> {
  ensureOrtConfigured()
  if (sessionCache?.key === cacheKey) return sessionCache.session
  const session = await ort.InferenceSession.create(toArrayBuffer(modelBytes), {
    executionProviders: ['wasm'],
  })
  sessionCache = { key: cacheKey, session }
  return session
}

async function runTile(
  session: ort.InferenceSession,
  tileCanvas: HTMLCanvasElement,
): Promise<HTMLCanvasElement> {
  const input = canvasToTensor(tileCanvas)
  const inputName = session.inputNames[0] ?? 'input'
  const results = await session.run({ [inputName]: input })
  const outName = session.outputNames[0]
  const outTensor = outName ? results[outName] : Object.values(results)[0]
  if (!outTensor) throw new Error('onnx_no_output')
  return tensorToCanvas(outTensor)
}

async function upscaleCanvas(
  session: ort.InferenceSession,
  source: HTMLCanvasElement,
): Promise<HTMLCanvasElement> {
  const sw = source.width
  const sh = source.height
  const out = createCanvas(sw * SCALE, sh * SCALE)
  const octx = out.getContext('2d')!
  const step = TILE - OVERLAP * 2
  for (let y = 0; y < sh; y += step) {
    for (let x = 0; x < sw; x += step) {
      const x0 = Math.max(0, x - OVERLAP)
      const y0 = Math.max(0, y - OVERLAP)
      const x1 = Math.min(sw, x + TILE + OVERLAP)
      const y1 = Math.min(sh, y + TILE + OVERLAP)
      const tw = x1 - x0
      const th = y1 - y0
      const tile = createCanvas(tw, th)
      tile.getContext('2d')!.drawImage(source, x0, y0, tw, th, 0, 0, tw, th)
      const restored = await runTile(session, tile)
      const padX = (x0 === 0 ? 0 : OVERLAP) * SCALE
      const padY = (y0 === 0 ? 0 : OVERLAP) * SCALE
      const cropW = Math.min(restored.width - padX * 2, (x + step > sw ? sw - x : step) * SCALE)
      const cropH = Math.min(restored.height - padY * 2, (y + step > sh ? sh - y : step) * SCALE)
      octx.drawImage(
        restored,
        padX,
        padY,
        cropW,
        cropH,
        x * SCALE,
        y * SCALE,
        cropW,
        cropH,
      )
    }
  }
  return out
}

/** Real-ESRGAN ONNX super-resolution (4×). Supports tiled inference for large images. */
export async function upscaleWithEsrgan(
  imageDataUrl: string,
  modelBytes: Uint8Array,
  cacheKey: string,
  targetScale = 4,
): Promise<string> {
  if (targetScale !== 4) {
    throw new Error('esrgan_scale_4_only')
  }
  const img = await loadImage(imageDataUrl)
  const sw = img.naturalWidth || img.width
  const sh = img.naturalHeight || img.height
  const source = createCanvas(sw, sh)
  source.getContext('2d')!.drawImage(img, 0, 0, sw, sh)
  const session = await getSession(cacheKey, modelBytes)
  const upscaled =
    sw <= TILE && sh <= TILE ? await runTile(session, source) : await upscaleCanvas(session, source)
  return upscaled.toDataURL('image/png')
}
