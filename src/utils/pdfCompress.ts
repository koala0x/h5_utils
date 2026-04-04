import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { PDFDocument } from 'pdf-lib'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

export type PdfCompressOptions = {
  qualityPercent: number
  onProgress?: (current: number, total: number) => void
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

async function blobFromCanvas(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b)
        else reject(new Error('压缩失败：无法导出图片数据'))
      },
      'image/jpeg',
      quality,
    )
  })
}

export async function compressPdfFileToPdfBlob(pdfFile: File, options: PdfCompressOptions): Promise<Blob> {
  const fileData = await pdfFile.arrayBuffer()
  const task = pdfjsLib.getDocument({ data: fileData })
  const pdf = await task.promise
  const total = pdf.numPages

  const q = clamp(options.qualityPercent / 100, 0.1, 0.95)
  const renderScale = 0.7 + q * 1.4

  const out = await PDFDocument.create()

  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i)
    const baseViewport = page.getViewport({ scale: 1 })
    const renderViewport = page.getViewport({ scale: renderScale })

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.floor(renderViewport.width))
    canvas.height = Math.max(1, Math.floor(renderViewport.height))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('压缩失败：无法创建 canvas 2D 上下文')

    await page.render({ canvas, canvasContext: ctx, viewport: renderViewport }).promise

    const jpgBlob = await blobFromCanvas(canvas, q)
    const jpgBytes = new Uint8Array(await jpgBlob.arrayBuffer())
    const img = await out.embedJpg(jpgBytes)

    const outPage = out.addPage([baseViewport.width, baseViewport.height])
    outPage.drawImage(img, {
      x: 0,
      y: 0,
      width: baseViewport.width,
      height: baseViewport.height,
    })

    options.onProgress?.(i, total)
  }

  const bytes = await out.save()
  const safeBytes = Uint8Array.from(bytes)
  return new Blob([safeBytes], { type: 'application/pdf' })
}
