<script setup lang="ts">
import { computed, ref } from 'vue'
import { convertPdfFileToEpubBlob } from './utils/pdfToEpub'
import { compressPdfFileToPdfBlob } from './utils/pdfCompress'
import logo from './assets/vue.svg'

type TabId = 'epub' | 'compress' | 'json'

const activeTab = ref<TabId>('epub')

const headerTitle = computed(() => {
  if (activeTab.value === 'epub') return 'PDF 转 EPUB'
  if (activeTab.value === 'compress') return 'PDF 压缩'
  return '格式化 JSON'
})

const headerSubtitle = computed(() => {
  if (activeTab.value === 'epub') return '上传 PDF，一键转换为 EPUB 并下载到本地'
  if (activeTab.value === 'compress') return '按百分比压缩 PDF（本地处理，压缩率越低越清晰）'
  return ''
})

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function isPdf(f: File) {
  if (f.type === 'application/pdf') return true
  return /\.pdf$/i.test(f.name)
}

function fileSizeMB(f: File) {
  return (f.size / 1024 / 1024).toFixed(2)
}

const epubFile = ref<File | null>(null)
const epubConverting = ref(false)
const epubProgress = ref<{ current: number; total: number } | null>(null)
const epubError = ref<string | null>(null)
const epubDragging = ref(false)
const epubFileInputEl = ref<HTMLInputElement | null>(null)
const epubTitle = ref('')

const epubCanConvert = computed(() => !!epubFile.value && !epubConverting.value)
const epubProgressPercent = computed(() => {
  if (!epubProgress.value || !epubProgress.value.total) return 0
  return Math.max(0, Math.min(100, Math.round((epubProgress.value.current / epubProgress.value.total) * 100)))
})

function setEpubFile(f: File | null) {
  epubError.value = null
  epubProgress.value = null
  epubFile.value = f
  epubTitle.value = f ? f.name.replace(/\.pdf$/i, '') : ''
}

function onPickEpub(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0] || null
  if (!f) return
  if (!isPdf(f)) {
    setEpubFile(null)
    epubError.value = '请选择 PDF 文件'
    return
  }
  setEpubFile(f)
}

function openEpubPicker() {
  epubFileInputEl.value?.click()
}

function clearEpubFile() {
  setEpubFile(null)
  if (epubFileInputEl.value) epubFileInputEl.value.value = ''
}

function onEpubDragOver() {
  epubDragging.value = true
}

function onEpubDragLeave() {
  epubDragging.value = false
}

function onEpubDrop(e: DragEvent) {
  epubDragging.value = false
  const f = e.dataTransfer?.files?.[0] || null
  if (!f) return
  if (!isPdf(f)) {
    setEpubFile(null)
    epubError.value = '拖拽的不是 PDF 文件'
    return
  }
  setEpubFile(f)
}

async function onConvert() {
  if (!epubFile.value || epubConverting.value) return
  epubConverting.value = true
  epubError.value = null
  epubProgress.value = { current: 0, total: 0 }

  try {
    const blob = await convertPdfFileToEpubBlob(epubFile.value, {
      title: epubTitle.value || epubFile.value.name.replace(/\.pdf$/i, ''),
      language: 'zh',
      onProgress: (current, total) => {
        epubProgress.value = { current, total }
      },
    })
    const base = (epubTitle.value || epubFile.value.name.replace(/\.pdf$/i, '')).trim() || 'book'
    downloadBlob(blob, `${base}.epub`)
  } catch (e) {
    epubError.value = e instanceof Error ? e.message : String(e)
  } finally {
    epubConverting.value = false
  }
}

const compressFile = ref<File | null>(null)
const compressing = ref(false)
const compressProgress = ref<{ current: number; total: number } | null>(null)
const compressError = ref<string | null>(null)
const compressDragging = ref(false)
const compressFileInputEl = ref<HTMLInputElement | null>(null)
const compressQualityPercent = ref(70)

const compressCanRun = computed(() => !!compressFile.value && !compressing.value)
const compressProgressPercent = computed(() => {
  if (!compressProgress.value || !compressProgress.value.total) return 0
  return Math.max(0, Math.min(100, Math.round((compressProgress.value.current / compressProgress.value.total) * 100)))
})

function setCompressFile(f: File | null) {
  compressError.value = null
  compressProgress.value = null
  compressFile.value = f
}

function onPickCompress(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0] || null
  if (!f) return
  if (!isPdf(f)) {
    setCompressFile(null)
    compressError.value = '请选择 PDF 文件'
    return
  }
  setCompressFile(f)
}

function openCompressPicker() {
  compressFileInputEl.value?.click()
}

function clearCompressFile() {
  setCompressFile(null)
  if (compressFileInputEl.value) compressFileInputEl.value.value = ''
}

function onCompressDragOver() {
  compressDragging.value = true
}

function onCompressDragLeave() {
  compressDragging.value = false
}

function onCompressDrop(e: DragEvent) {
  compressDragging.value = false
  const f = e.dataTransfer?.files?.[0] || null
  if (!f) return
  if (!isPdf(f)) {
    setCompressFile(null)
    compressError.value = '拖拽的不是 PDF 文件'
    return
  }
  setCompressFile(f)
}

async function onCompress() {
  if (!compressFile.value || compressing.value) return
  compressing.value = true
  compressError.value = null
  compressProgress.value = { current: 0, total: 0 }

  try {
    const blob = await compressPdfFileToPdfBlob(compressFile.value, {
      qualityPercent: compressQualityPercent.value,
      onProgress: (current, total) => {
        compressProgress.value = { current, total }
      },
    })
    const base = compressFile.value.name.replace(/\.pdf$/i, '').trim() || 'compressed'
    downloadBlob(blob, `${base}_compressed.pdf`)
  } catch (e) {
    compressError.value = e instanceof Error ? e.message : String(e)
  } finally {
    compressing.value = false
  }
}

const jsonInput = ref('')
const jsonOutput = ref('')
const jsonError = ref<string | null>(null)

const jsonCanFormat = computed(() => jsonInput.value.trim().length > 0)

function toJsonErrorMessage(e: unknown) {
  if (e instanceof Error && e.message) return e.message
  return String(e)
}

function formatJson(pretty: boolean) {
  jsonError.value = null

  const raw = jsonInput.value.replace(/^\uFEFF/, '').trim()
  if (!raw) {
    jsonOutput.value = ''
    return
  }

  try {
    const data = JSON.parse(raw)
    jsonOutput.value = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)
  } catch (e) {
    jsonOutput.value = ''
    jsonError.value = `JSON 无效：${toJsonErrorMessage(e)}`
  }
}

function onJsonFormat() {
  formatJson(true)
}


function onJsonClear() {
  jsonInput.value = ''
  jsonOutput.value = ''
  jsonError.value = null
}
</script>

<template>
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">
        <img class="brandMark" :src="logo" alt="logo" />
        <div class="brandText">
          <div class="brandTitle">工具箱</div>
          <!-- <div class="brandSub">本地处理</div> -->
        </div>
      </div>

      <nav class="nav">
        <button class="navItem" :class="{ active: activeTab === 'epub' }" type="button" @click="activeTab = 'epub'">
          PDF 转 EPUB
        </button>
        <button
          class="navItem"
          :class="{ active: activeTab === 'compress' }"
          type="button"
          @click="activeTab = 'compress'"
        >
          PDF 压缩
        </button>
        <button class="navItem" :class="{ active: activeTab === 'json' }" type="button" @click="activeTab = 'json'">
          格式化 JSON
        </button>
      </nav>

      <div class="sideHint">文件不会上传服务器，所有处理都在浏览器本地完成</div>
    </aside>

    <main class="content">
      <div class="contentInner" :class="{ jsonWide: activeTab === 'json' }">
        <header class="header">
          <h1 class="title">{{ headerTitle }}</h1>
          <p class="subtitle">{{ headerSubtitle }}</p>
        </header>

        <main v-if="activeTab === 'epub'" class="card">
          <section class="section">
            <div class="sectionHeader">
              <div class="step">1</div>
              <div>
                <div class="sectionTitle">选择 PDF 文件</div>
                <div class="sectionDesc">支持拖拽上传</div>
              </div>
            </div>

            <div
              class="dropzone"
              :class="{ dragging: epubDragging, hasFile: !!epubFile }"
              @dragover.prevent="onEpubDragOver"
              @dragleave.prevent="onEpubDragLeave"
              @drop.prevent="onEpubDrop"
            >
              <input
                ref="epubFileInputEl"
                class="fileInput"
                type="file"
                accept="application/pdf,.pdf"
                @change="onPickEpub"
              />

              <div class="dropMain">
                <button class="btn secondary" type="button" @click="openEpubPicker">选择文件</button>
                <div class="hint">或将 PDF 拖到这里</div>
              </div>

              <div v-if="epubFile" class="fileMeta">
                <div class="fileName" :title="epubFile.name">{{ epubFile.name }}</div>
                <div class="fileInfo">
                  <span>{{ fileSizeMB(epubFile) }} MB</span>
                  <span class="dot"></span>
                  <span>PDF</span>
                </div>
                <button class="btn ghost" type="button" @click="clearEpubFile">移除</button>
              </div>
            </div>
          </section>

          <section class="section">
            <div class="sectionHeader">
              <div class="step">2</div>
              <div>
                <div class="sectionTitle">书名（可选）</div>
                <div class="sectionDesc">默认使用文件名</div>
              </div>
            </div>

            <div class="field">
              <input v-model="epubTitle" class="textInput" type="text" placeholder="例如：我的电子书" />
            </div>
          </section>

          <section class="section">
            <div class="sectionHeader">
              <div class="step">3</div>
              <div>
                <div class="sectionTitle">开始转换</div>
                <div class="sectionDesc">完成后会自动下载 .epub</div>
              </div>
            </div>

            <div class="actions">
              <button class="btn primary" type="button" :disabled="!epubCanConvert" @click="onConvert">
                {{ epubConverting ? '转换中…' : '开始转换' }}
              </button>

              <div v-if="epubProgress" class="progressWrap">
                <div class="progressLabel">
                  进度：{{ epubProgress.current }}/{{ epubProgress.total }}（{{ epubProgressPercent }}%）
                </div>
                <div class="progressBar">
                  <div class="progressFill" :style="{ width: epubProgressPercent + '%' }"></div>
                </div>
              </div>

              <div v-if="epubError" class="alert">{{ epubError }}</div>

              <div class="note">
                当前版本会把每页渲染成图片写入 EPUB，若能提取到文字会附在图片下方；生成文件较大属于正常现象。
              </div>
            </div>
          </section>
        </main>

        <main v-else-if="activeTab === 'compress'" class="card">
          <section class="section">
            <div class="sectionHeader">
              <div class="step">1</div>
              <div>
                <div class="sectionTitle">选择 PDF 文件</div>
                <div class="sectionDesc">支持拖拽上传</div>
              </div>
            </div>

            <div
              class="dropzone"
              :class="{ dragging: compressDragging, hasFile: !!compressFile }"
              @dragover.prevent="onCompressDragOver"
              @dragleave.prevent="onCompressDragLeave"
              @drop.prevent="onCompressDrop"
            >
              <input
                ref="compressFileInputEl"
                class="fileInput"
                type="file"
                accept="application/pdf,.pdf"
                @change="onPickCompress"
              />

              <div class="dropMain">
                <button class="btn secondary" type="button" @click="openCompressPicker">选择文件</button>
                <div class="hint">或将 PDF 拖到这里</div>
              </div>

              <div v-if="compressFile" class="fileMeta">
                <div class="fileName" :title="compressFile.name">{{ compressFile.name }}</div>
                <div class="fileInfo">
                  <span>{{ fileSizeMB(compressFile) }} MB</span>
                  <span class="dot"></span>
                  <span>PDF</span>
                </div>
                <button class="btn ghost" type="button" @click="clearCompressFile">移除</button>
              </div>
            </div>
          </section>

          <section class="section">
            <div class="sectionHeader">
              <div class="step">2</div>
              <div>
                <div class="sectionTitle">压缩百分比</div>
                <div class="sectionDesc">数值越低压缩越狠，清晰度越低</div>
              </div>
            </div>

            <div class="rangeWrap">
              <input v-model.number="compressQualityPercent" class="range" type="range" min="10" max="95" step="1" />
              <div class="rangeMeta">
                <div class="rangeValue">{{ compressQualityPercent }}%</div>
                <div class="rangeHint">建议：60% ~ 85%</div>
              </div>
            </div>
          </section>

          <section class="section">
            <div class="sectionHeader">
              <div class="step">3</div>
              <div>
                <div class="sectionTitle">开始压缩</div>
                <div class="sectionDesc">完成后会自动下载 .pdf</div>
              </div>
            </div>

            <div class="actions">
              <button class="btn primary" type="button" :disabled="!compressCanRun" @click="onCompress">
                {{ compressing ? '压缩中…' : '开始压缩' }}
              </button>

              <div v-if="compressProgress" class="progressWrap">
                <div class="progressLabel">
                  进度：{{ compressProgress.current }}/{{ compressProgress.total }}（{{ compressProgressPercent }}%）
                </div>
                <div class="progressBar">
                  <div class="progressFill" :style="{ width: compressProgressPercent + '%' }"></div>
                </div>
              </div>

              <div v-if="compressError" class="alert">{{ compressError }}</div>

              <div class="note">
                当前实现为“重建 PDF”：逐页渲染为图片并重新生成 PDF，以达到可控的体积压缩；会丢失原 PDF 的可选中文字与链接等信息。
              </div>
            </div>
          </section>
        </main>

        <main v-else class="card jsonCard">
          <section class="section">
            <div class="jsonGrid">
              <div class="field">
                <textarea v-model="jsonInput" class="textArea" placeholder="在这里粘贴 JSON..."></textarea>
              </div>
              <div class="field">
                <textarea v-model="jsonOutput" class="textArea code" readonly placeholder="格式化后的结果会显示在这里"></textarea>
              </div>
            </div>

            <div class="actions">
              <div class="btnRow">
                <button class="btn primary" type="button" :disabled="!jsonCanFormat" @click="onJsonFormat">格式化</button>
                <button class="btn ghost" type="button" @click="onJsonClear">清空</button>
              </div>

              <div v-if="jsonError" class="alert">{{ jsonError }}</div>
            </div>
          </section>
        </main>
      </div>
    </main>
  </div>
</template>

<style scoped>
:global(#app) {
  width: 100%;
  margin: 0;
  text-align: left;
  border: 0;
  max-width: none;
  min-height: 100svh;
  display: block;
}

.shell {
  min-height: 100svh;
  display: flex;
  background: var(--bg);
}

.sidebar {
  width: 240px;
  padding: 18px 14px;
  border-right: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.02);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 10px 6px;
}

.brandMark {
  width: 40px;
  height: 40px;
  border-radius: 14px;
  display: block;
  background: transparent;
  box-shadow: none;
}

.brandTitle {
  font-weight: 700;
  color: var(--text-h);
  line-height: 1.1;
}

.brandSub {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text);
  opacity: 0.85;
}

.nav {
  display: grid;
  gap: 8px;
  padding: 0 6px;
}

.navItem {
  width: 100%;
  text-align: left;
  border-radius: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-h);
  font-weight: 700;
  cursor: pointer;
  transition:
    background 0.18s,
    border-color 0.18s;
}

.navItem:hover {
  border-color: var(--accent-border);
}

.navItem.active {
  border-color: var(--accent-border);
  background: var(--accent-bg);
  color: var(--accent);
}

.sideHint {
  margin-top: auto;
  padding: 10px 10px 0;
  font-size: 12px;
  color: var(--text);
  opacity: 0.85;
  line-height: 1.5;
}

.content {
  flex: 1 1 auto;
  padding: 28px 18px 64px;
}

.contentInner {
  max-width: 920px;
  margin: 0 auto;
}

.contentInner.jsonWide {
  max-width: max(920px, 65vw);
}

.header {
  margin-bottom: 18px;
}

.title {
  margin: 0;
  font-size: 28px;
  line-height: 1.15;
  letter-spacing: -0.4px;
  color: var(--text-h);
}

.subtitle {
  margin: 10px 0 0;
  color: var(--text);
  opacity: 0.9;
  font-size: 14px;
}

.card {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: var(--shadow);
  overflow: hidden;
}

.section {
  padding: 18px 18px 20px;
  border-top: 1px solid var(--border);
}

.section:first-child {
  border-top: 0;
}

.sectionHeader {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 12px;
}

.step {
  width: 28px;
  height: 28px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-bg);
  color: var(--accent);
  border: 1px solid var(--accent-border);
  font-weight: 600;
  flex: 0 0 auto;
}

.sectionTitle {
  font-weight: 600;
  color: var(--text-h);
  line-height: 1.2;
}

.sectionDesc {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text);
  opacity: 0.85;
}

.dropzone {
  border: 1px dashed var(--border);
  border-radius: 14px;
  padding: 14px;
  background: rgba(0, 0, 0, 0.02);
  transition:
    border-color 0.18s,
    background 0.18s,
    box-shadow 0.18s;
}

.dropzone.dragging {
  border-color: var(--accent);
  background: var(--accent-bg);
  box-shadow: 0 0 0 4px rgb(var(--accent-rgb) / 0.18);
}

.fileInput {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.dropMain {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.hint {
  font-size: 13px;
  color: var(--text);
  opacity: 0.85;
}

.fileMeta {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px 12px;
  align-items: center;
}

.fileName {
  font-weight: 600;
  color: var(--text-h);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fileInfo {
  font-size: 13px;
  color: var(--text);
  opacity: 0.85;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.dot {
  width: 4px;
  height: 4px;
  border-radius: 999px;
  background: var(--border);
  display: inline-block;
}

.field {
  display: grid;
}

.textInput {
  width: 100%;
  box-sizing: border-box;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: transparent;
  padding: 10px 12px;
  font-size: 14px;
  color: var(--text-h);
  outline: none;
}

.textInput:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 4px rgb(var(--accent-rgb) / 0.18);
}

.textArea {
  width: 100%;
  box-sizing: border-box;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: transparent;
  padding: 10px 12px;
  font-size: 14px;
  color: var(--text-h);
  outline: none;
  min-height: 220px;
  resize: vertical;
}

.jsonCard .textArea {
  height: 65svh;
  min-height: 560px;
}

.textArea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 4px rgb(var(--accent-rgb) / 0.18);
}

.textArea.code {
  font-family: var(--mono);
  line-height: 1.45;
}

.jsonGrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.jsonGrid + .actions {
  margin-top: 12px;
}

.btnRow {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.actions {
  display: grid;
  gap: 12px;
}

.btn {
  border-radius: 12px;
  border: 1px solid transparent;
  padding: 10px 14px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.18s,
    border-color 0.18s,
    transform 0.06s,
    opacity 0.18s;
}

.btn:active {
  transform: translateY(1px);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.btn.primary {
  background: var(--accent);
  color: white;
}

.btn.primary:hover:not(:disabled) {
  border-color: rgba(255, 255, 255, 0.25);
}

.btn.secondary {
  background: var(--social-bg);
  color: var(--text-h);
  border-color: var(--border);
}

.btn.secondary:hover:not(:disabled) {
  border-color: var(--accent-border);
}

.btn.ghost {
  background: transparent;
  border-color: var(--border);
  color: var(--text-h);
  padding: 8px 12px;
  justify-self: end;
}

.btn.ghost:hover:not(:disabled) {
  border-color: var(--accent-border);
}

.progressWrap {
  display: grid;
  gap: 8px;
}

.progressLabel {
  font-size: 13px;
  color: var(--text);
  opacity: 0.85;
}

.progressBar {
  height: 10px;
  border-radius: 999px;
  background: var(--social-bg);
  border: 1px solid var(--border);
  overflow: hidden;
}

.progressFill {
  height: 100%;
  background: var(--accent);
  width: 0%;
  transition: width 0.12s linear;
}

.alert {
  border-radius: 12px;
  border: 1px solid rgba(176, 0, 32, 0.35);
  background: rgba(176, 0, 32, 0.06);
  color: var(--text-h);
  padding: 10px 12px;
  white-space: pre-wrap;
  font-size: 13px;
}

.note {
  font-size: 13px;
  color: var(--text);
  opacity: 0.85;
  line-height: 1.5;
}

.rangeWrap {
  display: grid;
  gap: 10px;
}

.range {
  width: 100%;
  accent-color: var(--accent);
}

.rangeMeta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.rangeValue {
  font-weight: 800;
  color: var(--text-h);
}

.rangeHint {
  font-size: 13px;
  color: var(--text);
  opacity: 0.85;
}

@media (max-width: 820px) {
  .shell {
    flex-direction: column;
  }

  .sidebar {
    width: auto;
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }

  .nav {
    grid-template-columns: 1fr 1fr;
  }

  .jsonGrid {
    grid-template-columns: 1fr;
  }
}
</style>
