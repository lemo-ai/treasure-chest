import type { ImageSmartRunRequest, ImageSmartRunResult } from '@shared'
import { denoiseImage, replaceBackgroundColor, upscaleImage } from './canvasOps'
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
      const scale = payload.scale ?? 2
      const imageDataUrl = await upscaleImage(payload.imageDataUrl, scale)
      await logActivity('info', `Canvas upscale ${scale}x done`, modelId)
      return { ok: true, modelId, imageDataUrl }
    }

    if (payload.task === 'denoise') {
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
