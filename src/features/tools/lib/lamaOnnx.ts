import * as ort from 'onnxruntime-web'

const MODEL_SIZE = 512

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

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
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

function imageToBchw(canvas: HTMLCanvasElement): Float32Array {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas_unavailable')
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const area = canvas.width * canvas.height
  const tensor = new Float32Array(area * 3)
  for (let i = 0; i < area; i++) {
    const o = i * 4
    tensor[i] = data[o]! / 255
    tensor[area + i] = data[o + 1]! / 255
    tensor[area * 2 + i] = data[o + 2]! / 255
  }
  return tensor
}

/** Mask: opaque/white pixels → 1 (inpaint), transparent/black → 0. */
function maskToTensor(canvas: HTMLCanvasElement): Float32Array {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas_unavailable')
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const area = canvas.width * canvas.height
  const tensor = new Float32Array(area)
  for (let i = 0; i < area; i++) {
    const o = i * 4
    const a = data[o + 3]!
    const lum = (data[o]! + data[o + 1]! + data[o + 2]!) / 3
    tensor[i] = a > 8 || lum > 24 ? 1 : 0
  }
  return tensor
}

function tensorToRgbCanvas(tensor: Float32Array, width: number, height: number): HTMLCanvasElement {
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas_unavailable')
  const out = ctx.createImageData(width, height)
  const area = width * height
  let maxValue = 0
  for (let i = 0; i < tensor.length; i++) maxValue = Math.max(maxValue, tensor[i] ?? 0)
  const scale = maxValue <= 1.5 ? 255 : 1
  for (let i = 0; i < area; i++) {
    out.data[i * 4] = clamp(Math.round((tensor[i] ?? 0) * scale), 0, 255)
    out.data[i * 4 + 1] = clamp(Math.round((tensor[area + i] ?? 0) * scale), 0, 255)
    out.data[i * 4 + 2] = clamp(Math.round((tensor[area * 2 + i] ?? 0) * scale), 0, 255)
    out.data[i * 4 + 3] = 255
  }
  ctx.putImageData(out, 0, 0)
  return canvas
}

function hasMaskPixels(tensor: Float32Array): boolean {
  for (let i = 0; i < tensor.length; i++) {
    if ((tensor[i] ?? 0) > 0.5) return true
  }
  return false
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

/**
 * LaMa ONNX inpainting (Carve/lama_fp32, 512²).
 * maskDataUrl: paint mask (opaque = remove). Only masked pixels are written back.
 */
export async function removeWatermarkWithLama(
  imageDataUrl: string,
  maskDataUrl: string,
  modelBytes: Uint8Array,
  cacheKey: string,
): Promise<string> {
  const img = await loadImage(imageDataUrl)
  const maskImg = await loadImage(maskDataUrl)
  const tw = img.naturalWidth || img.width
  const th = img.naturalHeight || img.height

  const modelImage = createCanvas(MODEL_SIZE, MODEL_SIZE)
  const modelMask = createCanvas(MODEL_SIZE, MODEL_SIZE)
  {
    const ictx = modelImage.getContext('2d')!
    ictx.fillStyle = '#ffffff'
    ictx.fillRect(0, 0, MODEL_SIZE, MODEL_SIZE)
    ictx.drawImage(img, 0, 0, tw, th, 0, 0, MODEL_SIZE, MODEL_SIZE)

    const mctx = modelMask.getContext('2d')!
    mctx.clearRect(0, 0, MODEL_SIZE, MODEL_SIZE)
    mctx.drawImage(maskImg, 0, 0, maskImg.naturalWidth || maskImg.width, maskImg.naturalHeight || maskImg.height, 0, 0, MODEL_SIZE, MODEL_SIZE)
  }

  const imageTensor = imageToBchw(modelImage)
  const maskTensor = maskToTensor(modelMask)
  if (!hasMaskPixels(maskTensor)) {
    throw new Error('mask_empty')
  }

  const session = await getSession(cacheKey, modelBytes)
  const imageName =
    session.inputNames.find((n) => /image/i.test(n)) ??
    session.inputNames.find((n) => /input/i.test(n)) ??
    session.inputNames[0] ??
    'image'
  const maskName =
    session.inputNames.find((n) => /mask/i.test(n)) ?? session.inputNames[1] ?? 'mask'
  const feeds: Record<string, ort.Tensor> = {
    [imageName]: new ort.Tensor('float32', imageTensor, [1, 3, MODEL_SIZE, MODEL_SIZE]),
    [maskName]: new ort.Tensor('float32', maskTensor, [1, 1, MODEL_SIZE, MODEL_SIZE]),
  }

  const results = await session.run(feeds)
  const outName = session.outputNames[0]
  const outTensor = outName ? results[outName] : Object.values(results)[0]
  if (!outTensor) throw new Error('onnx_no_output')

  const restored = tensorToRgbCanvas(outTensor.data as Float32Array, MODEL_SIZE, MODEL_SIZE)

  // Upscale restored + mask to original size, blend only masked area (feathered).
  const restoredFull = createCanvas(tw, th)
  restoredFull.getContext('2d')!.drawImage(restored, 0, 0, tw, th)

  const maskFull = createCanvas(tw, th)
  {
    const ctx = maskFull.getContext('2d')!
    ctx.clearRect(0, 0, tw, th)
    ctx.drawImage(maskImg, 0, 0, tw, th)
  }
  const feather = createCanvas(tw, th)
  {
    const ctx = feather.getContext('2d')!
    ctx.filter = 'blur(10px)'
    ctx.drawImage(maskFull, 0, 0)
    ctx.filter = 'none'
  }

  const out = createCanvas(tw, th)
  const octx = out.getContext('2d')!
  octx.drawImage(img, 0, 0, tw, th)

  const maskedPatch = createCanvas(tw, th)
  {
    const ctx = maskedPatch.getContext('2d')!
    ctx.drawImage(restoredFull, 0, 0)
    ctx.globalCompositeOperation = 'destination-in'
    ctx.drawImage(feather, 0, 0)
  }
  octx.drawImage(maskedPatch, 0, 0)
  return out.toDataURL('image/png')
}
