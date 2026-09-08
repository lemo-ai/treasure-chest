import {
  isCustomEngineId,
  type CustomVisionEngine,
  type ImageSmartRunRequest,
  type ImageSmartRunResult,
  type ImageSmartTask,
} from '@shared'
import { denoiseImage, replaceBackgroundColor, resizeImage, upscaleImage } from './canvasOps'
import { denoiseWithNafnet } from './nafnetOnnx'
import { upscaleWithEsrgan } from './esrganOnnx'
import { removeBackgroundWithIsnet } from './isnetOnnx'
import { removeWatermarkWithLama } from './lamaOnnx'
import { removeBackgroundWithU2Net } from './u2netOnnx'

async function logActivity(
  level: 'info' | 'warn' | 'error',
  message: string,
  detail?: string,
): Promise<void> {
  try {
    await window.treasureChest.appendDebugActivity({
      scope: 'image.smart',
      level,
      message,
      detail,
    })
  } catch {
    /* ignore logging failures */
  }
}

async function loadImageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height })
    img.onerror = () => reject(new Error('image_load_failed'))
    img.src = dataUrl
  })
}

async function runLocalOnnxCutout(imageDataUrl: string, modelId: string): Promise<string> {
  await logActivity('info', 'Loading local ONNX weights…', modelId)
  const weight = await window.treasureChest.readImageVisionModelWeight(modelId)
  if (!weight.ok) {
    throw new Error(weight.error || 'onnx_not_found')
  }
  await logActivity('info', `ONNX loaded (${weight.fileName}), running…`, modelId)
  if (modelId === 'imgly-rembg') {
    return removeBackgroundWithIsnet(imageDataUrl, weight.data, `${modelId}:${weight.fileName}`)
  }
  return removeBackgroundWithU2Net(imageDataUrl, weight.data, `${modelId}:${weight.fileName}`)
}

async function runLocalLamaInpaint(
  imageDataUrl: string,
  maskDataUrl: string | undefined,
  modelId: string,
): Promise<string> {
  if (!maskDataUrl) {
    throw new Error('mask_required')
  }
  await logActivity('info', 'Loading LaMa ONNX weights…', modelId)
  const weight = await window.treasureChest.readImageVisionModelWeight(modelId)
  if (!weight.ok) {
    throw new Error(weight.error || 'onnx_not_found')
  }
  if (!weight.fileName.toLowerCase().endsWith('.onnx')) {
    throw new Error('lama_need_onnx')
  }
  await logActivity('info', `LaMa loaded (${weight.fileName}), inpainting…`, modelId)
  return removeWatermarkWithLama(
    imageDataUrl,
    maskDataUrl,
    weight.data,
    `${modelId}:${weight.fileName}`,
  )
}

function taskMatchesEngine(task: ImageSmartTask, engine: CustomVisionEngine): boolean {
  return (
    engine.task === task ||
    (task === 'background_replace' && engine.task === 'remove_background')
  )
}

async function resolveCustomEngine(modelId: string): Promise<CustomVisionEngine | null> {
  const settings = await window.treasureChest.getImageToolsSettings()
  return settings.customEngines.find((e) => e.id === modelId) ?? null
}

async function runCustomHttpEngine(
  engine: CustomVisionEngine,
  payload: ImageSmartRunRequest,
): Promise<string> {
  if (!engine.endpointUrl) throw new Error('endpoint_required')
  await logActivity('info', 'Calling custom HTTP engine…', engine.endpointUrl)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (engine.apiKey) {
    headers.Authorization = engine.apiKey.startsWith('Bearer ')
      ? engine.apiKey
      : `Bearer ${engine.apiKey}`
  }
  const res = await fetch(engine.endpointUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      task: payload.task,
      imageDataUrl: payload.imageDataUrl,
      maskDataUrl: payload.maskDataUrl,
      fillColor: payload.fillColor,
      scale: payload.scale,
      modelId: engine.id,
    }),
  })
  if (!res.ok) {
    throw new Error(`http_engine_${res.status}`)
  }
  const data = (await res.json()) as { imageDataUrl?: string; ok?: boolean; error?: string }
  if (data.error) throw new Error(data.error)
  if (!data.imageDataUrl) throw new Error('http_engine_no_image')
  return data.imageDataUrl
}

async function runCustomOnnxByTask(
  payload: ImageSmartRunRequest,
  modelId: string,
): Promise<string> {
  if (payload.task === 'remove_background') {
    return runLocalOnnxCutout(payload.imageDataUrl, modelId)
  }
  if (payload.task === 'background_replace') {
    const cutUrl = await runLocalOnnxCutout(payload.imageDataUrl, modelId)
    return replaceBackgroundColor(cutUrl, payload.fillColor || '#ffffff')
  }
  if (payload.task === 'remove_watermark') {
    return runLocalLamaInpaint(payload.imageDataUrl, payload.maskDataUrl, modelId)
  }
  if (payload.task === 'upscale') {
    const scale = (payload.scale ?? 2) as 2 | 3 | 4
    const weight = await window.treasureChest.readImageVisionModelWeight(modelId)
    if (!weight.ok || !weight.fileName.toLowerCase().endsWith('.onnx')) {
      throw new Error(weight.ok === false ? weight.error : 'onnx_not_found')
    }
    await logActivity('info', `Custom ESRGAN-style ONNX (${weight.fileName})…`, modelId)
    let imageDataUrl = await upscaleWithEsrgan(
      payload.imageDataUrl,
      weight.data,
      `${modelId}:${weight.fileName}`,
      4,
    )
    if (scale !== 4) {
      const img = await loadImageSize(payload.imageDataUrl)
      imageDataUrl = await resizeImage(imageDataUrl, img.w * scale, img.h * scale)
    }
    return imageDataUrl
  }
  if (payload.task === 'denoise') {
    const weight = await window.treasureChest.readImageVisionModelWeight(modelId)
    if (!weight.ok || !weight.fileName.toLowerCase().endsWith('.onnx')) {
      throw new Error(weight.ok === false ? weight.error : 'onnx_not_found')
    }
    await logActivity('info', `Custom NAFNet-style ONNX (${weight.fileName})…`, modelId)
    return denoiseWithNafnet(payload.imageDataUrl, weight.data, `${modelId}:${weight.fileName}`)
  }
  throw new Error('unsupported')
}

export async function runSmartInRenderer(
  payload: ImageSmartRunRequest,
): Promise<ImageSmartRunResult> {
  await logActivity('info', `Renderer smart start: ${payload.task}`, payload.modelId)

  const gate = await window.treasureChest.runImageSmart(payload)
  if (!gate.ok && gate.reason === 'model_not_installed') {
    await logActivity('warn', 'Renderer stopped: model not installed', gate.modelId)
    return gate
  }
  if (!gate.ok && gate.reason === 'unsupported') {
    await logActivity('warn', `Renderer stopped: unsupported (${gate.error})`, gate.modelId)
    return gate
  }
  if (!gate.ok) {
    await logActivity('error', `Renderer gate failed: ${gate.error}`, gate.modelId)
    return gate
  }

  const modelId = gate.modelId ?? payload.modelId ?? 'imgly-rembg'

  try {
    if (isCustomEngineId(modelId)) {
      const engine = await resolveCustomEngine(modelId)
      if (!engine || !engine.enabled || !taskMatchesEngine(payload.task, engine)) {
        return {
          ok: false,
          modelId,
          reason: 'model_not_installed',
          error: 'model_not_installed',
        }
      }
      if (engine.kind === 'http') {
        const imageDataUrl = await runCustomHttpEngine(engine, payload)
        await logActivity('info', 'Custom HTTP engine done', modelId)
        return { ok: true, modelId, imageDataUrl }
      }
      const imageDataUrl = await runCustomOnnxByTask(payload, modelId)
      await logActivity('info', 'Custom ONNX engine done', modelId)
      return { ok: true, modelId, imageDataUrl }
    }

    if (payload.task === 'remove_background') {
      await logActivity('info', 'Running local ONNX cutout…', modelId)
      const imageDataUrl = await runLocalOnnxCutout(payload.imageDataUrl, modelId)
      await logActivity('info', 'Background removal done', modelId)
      return { ok: true, modelId, imageDataUrl }
    }

    if (payload.task === 'background_replace') {
      const cutUrl = await runLocalOnnxCutout(payload.imageDataUrl, modelId)
      const filled = await replaceBackgroundColor(cutUrl, payload.fillColor || '#ffffff')
      await logActivity('info', 'Background replace done', modelId)
      return { ok: true, modelId, imageDataUrl: filled }
    }

    if (payload.task === 'remove_watermark') {
      const imageDataUrl = await runLocalLamaInpaint(
        payload.imageDataUrl,
        payload.maskDataUrl,
        modelId,
      )
      await logActivity('info', 'Watermark removal done', modelId)
      return { ok: true, modelId, imageDataUrl }
    }

    if (payload.task === 'upscale') {
      const scale = (payload.scale ?? 2) as 2 | 3 | 4
      if (modelId === 'realesrgan-x4' || modelId === 'waifu2x') {
        const weight = await window.treasureChest.readImageVisionModelWeight(modelId)
        if (weight.ok && weight.fileName.toLowerCase().endsWith('.onnx')) {
          await logActivity('info', `Running ESRGAN ONNX (${weight.fileName})…`, modelId)
          let imageDataUrl = await upscaleWithEsrgan(
            payload.imageDataUrl,
            weight.data,
            `${modelId}:${weight.fileName}`,
            4,
          )
          if (scale !== 4) {
            const img = await loadImageSize(payload.imageDataUrl)
            imageDataUrl = await resizeImage(imageDataUrl, img.w * scale, img.h * scale)
          }
          await logActivity('info', 'ESRGAN upscale done', modelId)
          return { ok: true, modelId, imageDataUrl }
        }
      }
      const imageDataUrl = await upscaleImage(payload.imageDataUrl, scale)
      await logActivity('info', `Canvas upscale ${scale}x done`, modelId)
      return { ok: true, modelId, imageDataUrl }
    }

    if (payload.task === 'denoise') {
      if (modelId === 'nafnet') {
        const weight = await window.treasureChest.readImageVisionModelWeight(modelId)
        if (weight.ok && weight.fileName.toLowerCase().endsWith('.onnx')) {
          await logActivity('info', `Running NAFNet ONNX (${weight.fileName})…`, modelId)
          const imageDataUrl = await denoiseWithNafnet(
            payload.imageDataUrl,
            weight.data,
            `${modelId}:${weight.fileName}`,
          )
          await logActivity('info', 'NAFNet denoise done', modelId)
          return { ok: true, modelId, imageDataUrl }
        }
      }
      const imageDataUrl = await denoiseImage(payload.imageDataUrl)
      await logActivity('info', 'Canvas denoise done', modelId)
      return { ok: true, modelId, imageDataUrl }
    }

    await logActivity('warn', 'No renderer handler for task', payload.task)
    return {
      ok: false,
      modelId,
      reason: 'unsupported',
      error: 'unsupported',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : undefined
    await logActivity('error', `Smart render failed: ${message}`, stack?.slice(0, 800))
    return {
      ok: false,
      modelId,
      reason: 'model_error',
      error: message,
    }
  }
}
