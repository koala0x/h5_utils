import JSZip from 'jszip'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

export type PdfToEpubOptions = {
  title: string
  language?: string
  onProgress?: (current: number, total: number) => void
}

function escapeXml(input: string) {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function makeUuidLike() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  const hex = Array.from(bytes, toHex).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`
}

function xhtmlTemplate(title: string, bodyHtml: string) {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <title>${escapeXml(title)}</title>
    <meta http-equiv="Content-Type" content="application/xhtml+xml; charset=utf-8" />
    <link rel="stylesheet" type="text/css" href="styles.css" />
  </head>
  <body>
    ${bodyHtml}
  </body>
</html>`
}

function normalizeText(text: string) {
  const trimmed = text.replaceAll('\u0000', '').replaceAll('\r', '')
  const lines = trimmed
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  return lines.join('\n')
}

function textToParagraphsXhtml(text: string) {
  const safe = escapeXml(normalizeText(text))
  if (!safe) return '<p></p>'
  const paragraphs = safe
    .split('\n')
    .map((line) => `<p>${line}</p>`)
    .join('\n')
  return paragraphs
}

export async function convertPdfFileToEpubBlob(pdfFile: File, options: PdfToEpubOptions): Promise<Blob> {
  const title = options.title?.trim() || pdfFile.name.replace(/\.pdf$/i, '') || 'Untitled'
  const language = options.language?.trim() || 'zh'
  const bookId = makeUuidLike()

  const fileData = await pdfFile.arrayBuffer()
  const task = pdfjsLib.getDocument({ data: fileData })
  const pdf = await task.promise
  const total = pdf.numPages

  const zip = new JSZip()

  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })

  zip.folder('META-INF')?.file(
    'container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
  )

  const oebps = zip.folder('OEBPS')!
  oebps.file(
    'styles.css',
    `body{font-family:serif;line-height:1.6;margin:0;padding:1rem;}
h1{font-size:1.4rem;margin:0 0 1rem 0;}
p{margin:0 0 .75rem 0;word-break:break-word;}
img{max-width:100%;height:auto;}
.pageImg{display:block;margin:0 auto 1rem auto;}`,
  )

  const manifestItems: string[] = [
    `<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
    `<item id="css" href="styles.css" media-type="text/css"/>`,
  ]
  const spineItems: string[] = []
  const navPoints: string[] = []

  const images = oebps.folder('images')!

  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 1.6 })

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.floor(viewport.width))
    canvas.height = Math.max(1, Math.floor(viewport.height))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法创建 canvas 2D 上下文')

    await page.render({ canvas, canvasContext: ctx, viewport }).promise

    const imgBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) resolve(b)
          else reject(new Error('页面渲染失败：无法导出图片'))
        },
        'image/png',
        0.92,
      )
    })

    const imgId = `img${i}`
    const imgHref = `images/page-${i}.png`
    images.file(`page-${i}.png`, imgBlob)
    manifestItems.push(`<item id="${imgId}" href="${imgHref}" media-type="image/png"/>`)

    const textContent = await page.getTextContent()
    const parts: string[] = []
    for (const item of textContent.items) {
      if ('str' in item) {
        parts.push(String(item.str))
        parts.push((item as { hasEOL?: boolean }).hasEOL ? '\n' : ' ')
      }
    }
    const pageText = parts
      .join('')
      .replaceAll(/[ \t]+\n/g, '\n')
      .replaceAll(/[ \t]{2,}/g, ' ')
      .trim()

    const chapterId = `c${i}`
    const chapterHref = `chapter-${i}.xhtml`
    const chapterTitle = `第 ${i} 页`

    const titleBlock = i === 1 ? `<h1>${escapeXml(title)}</h1>\n` : ''
    const imgBlock = `<img class="pageImg" src="${escapeXml(imgHref)}" alt="${escapeXml(chapterTitle)}" />`
    const textBlock = pageText ? `\n${textToParagraphsXhtml(pageText)}` : ''

    oebps.file(chapterHref, xhtmlTemplate(chapterTitle, `${titleBlock}${imgBlock}${textBlock}`))

    manifestItems.push(`<item id="${chapterId}" href="${chapterHref}" media-type="application/xhtml+xml"/>`)
    spineItems.push(`<itemref idref="${chapterId}"/>`)
    navPoints.push(
      `<navPoint id="navPoint-${i}" playOrder="${i}">
  <navLabel><text>${escapeXml(chapterTitle)}</text></navLabel>
  <content src="${chapterHref}"/>
</navPoint>`,
    )

    options.onProgress?.(i, total)
  }

  oebps.file(
    'toc.ncx',
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN"
  "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${escapeXml(bookId)}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXml(title)}</text></docTitle>
  <navMap>
${navPoints.join('\n')}
  </navMap>
</ncx>`,
  )

  oebps.file(
    'content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:language>${escapeXml(language)}</dc:language>
    <dc:identifier id="BookId" opf:scheme="UUID">urn:uuid:${escapeXml(bookId)}</dc:identifier>
  </metadata>
  <manifest>
${manifestItems.join('\n')}
  </manifest>
  <spine toc="ncx">
${spineItems.join('\n')}
  </spine>
</package>`,
  )

  return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip', streamFiles: true })
}
