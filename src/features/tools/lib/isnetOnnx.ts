import * as ort from 'onnxruntime-web'

/** IMG.LY isnet_* preprocess: 1024², (px - 128) / 256 → BCHW. */
const INPUT_SIZE = 1024
const MEAN = 128
const STD = 256

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

function preprocess(img: HTMLImageElement): ort.Tensor {
  const canvas = document.createElement('canvas')
  canvas.width = INPUT_SIZE
  canvas.height = INPUT_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas_unavailable')
  ctx.drawImage(img, 0, 0, INPUT_SIZE, INPUT_SIZE)
  const { data } = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE)

  const plane = INPUT_SIZE * INPUT_SIZE
  const float32 = new Float32Array(3 * plane)
  for (let i = 0, p = 0; i < plane; i++, p += 4) {
    float32[i] = (data[p]! - MEAN) / STD
    float32[plane + i] = (data[p + 1]! - MEAN) / STD
    float32[2 * plane + i] = (data[p + 2]! - MEAN) / STD
  }
  return new ort.Tensor('float32', float32, [1, 3, INPUT_SIZE, INPUT_SIZE])
}

function extractMask(tensor: ort.Tensor): { data: Float32Array; width: number; height: number } {
  const dims = tensor.dims.map(Number)
  const raw = tensor.data as Float32Array
  let width = INPUT_SIZE
  let height = INPUT_SIZE
  let data = raw

  if (dims.length === 4) {
    height = dims[2] ?? INPUT_SIZE
    width = dims[3] ?? INPUT_SIZE
    const plane = height * width
    if ((dims[1] ?? 1) > 1) {
      data = raw.subarray(0, plane)
    }
  } else if (dims.length === 3) {
    height = dims[1] ?? INPUT_SIZE
    width = dims[2] ?? INPUT_SIZE
  } else if (dims.length === 2) {
    height = dims[0] ?? INPUT_SIZE
    width = dims[1] ?? INPUT_SIZE
  }

  // isnet mask is typically already in [0,1]; clamp only.
  return { data, width, height }
}

function maskToAlphaCanvas(
  mask: Float32Array,
  mw: number,
  mh: number,
  tw: number,
  th: number,
): HTMLCanvasElement {
  const src = document.createElement('canvas')
  src.width = mw
  src.height = mh
  const sctx = src.getContext('2d')
  if (!sctx) throw new Error('canvas_unavailable')
  const id = sctx.createImageData(mw, mh)
  for (let i = 0; i < mw * mh; i++) {
    const v = Math.max(0, Math.min(1, mask[i] ?? 0))
    const g = Math.round(v * 255)
    const o = i * 4
    id.data[o] = g
    id.data[o + 1] = g
    id.data[o + 2] = g
    id.data[o + 3] = 255
  }
  sctx.putImageData(id, 0, 0)

  const dst = document.createElement('canvas')
  dst.width = tw
  dst.height = th
  const dctx = dst.getContext('2d')
  if (!dctx) throw new Error('canvas_unavailable')
  dctx.imageSmoothingEnabled = true
  dctx.drawImage(src, 0, 0, tw, th)
  return dst
}

function composeCutout(img: HTMLImageElement, maskCanvas: HTMLCanvasElement): string {
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const ctx = out.getContext('2d')
  if (!ctx) throw new Error('canvas_unavailable')
  ctx.drawImage(img, 0, 0, w, h)
  const imageData = ctx.getImageData(0, 0, w, h)
  const maskData = maskCanvas.getContext('2d')!.getImageData(0, 0, w, h)
  for (let i = 0; i < imageData.data.length; i += 4) {
    imageData.data[i + 3] = maskData.data[i]!
  }
  ctx.putImageData(imageData, 0, 0)
  return out.toDataURL('image/png')
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

/** Local isnet (IMG.LY weights) matting → transparent PNG data URL. */
export async function removeBackgroundWithIsnet(
  imageDataUrl: string,
  modelBytes: Uint8Array,
  cacheKey: string,
): Promise<string> {
  const img = await loadImage(imageDataUrl)
  const session = await getSession(cacheKey, modelBytes)
  const input = preprocess(img)
  const inputName = session.inputNames[0] ?? 'input'
  const feeds: Record<string, ort.Tensor> = { [inputName]: input }
  const results = await session.run(feeds)
  const outName = session.outputNames[0] ?? 'output'
  const outTensor = results[outName]
  if (!outTensor) throw new Error('onnx_no_output')
  const { data, width, height } = extractMask(outTensor)
  const tw = img.naturalWidth || img.width
  const th = img.naturalHeight || img.height
  const maskCanvas = maskToAlphaCanvas(data, width, height, tw, th)
  return composeCutout(img, maskCanvas)
}
