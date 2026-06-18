import fs from 'fs'
import path from 'path'
import MarkdownIt from 'markdown-it'
import matter from 'gray-matter'
import { glob } from 'glob'

const BASE = process.env.BASE_PATH || ''
const md = new MarkdownIt({ html: true })

// ── Sidebar ───────────────────────────────────────────────────────────────────

function getTitle(file) {
  const raw = fs.readFileSync(file, 'utf-8')
  const { data } = matter(raw)
  return data.title || path.basename(file, '.md')
}

function buildSidebar(files, currentFile) {
  const tree = {}

  for (const file of files) {
    const rel = file.replace('docs/', '')
    const parts = rel.split('/')

    if (parts.length === 1) {
      tree['_root'] = tree['_root'] || []
      tree['_root'].push(file)
    } else {
      const folder = parts[0]
      tree[folder] = tree[folder] || []
      tree[folder].push(file)
    }
  }

  let html = '<nav class="sidebar"><ul class="sidebar-list">'

  // Root-level files first
  if (tree['_root']) {
    for (const file of tree['_root']) {
      const href = BASE + '/' + file.replace('docs/', '').replace('.md', '.html')
      const title = getTitle(file)
      const active = file === currentFile ? ' class="active"' : ''
      html += `<li><a href="${href}"${active}>${title}</a></li>`
    }
  }

  // Folders
  for (const [folder, folderFiles] of Object.entries(tree)) {
    if (folder === '_root') continue

    const label = folder.charAt(0).toUpperCase() + folder.slice(1)
    const isActive = folderFiles.some(f => f === currentFile)

    html += `<li class="sidebar-group${isActive ? ' open' : ''}">`
    html += `<span class="sidebar-group-label">${label}</span>`
    html += '<ul class="sidebar-sublist">'

    for (const file of folderFiles) {
      const href = BASE + '/' + file.replace('docs/', '').replace('.md', '.html')
      const title = getTitle(file)
      const active = file === currentFile ? ' class="active"' : ''
      html += `<li><a href="${href}"${active}>${title}</a></li>`
    }

    html += '</ul></li>'
  }

  html += '</ul></nav>'
  return html
}

// ── Layout ────────────────────────────────────────────────────────────────────

function applyLayout(html, frontmatter, sidebar) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${frontmatter.title || 'My Site'}</title>
  ${frontmatter.description ? `<meta name="description" content="${frontmatter.description}" />` : ''}
  <link rel="stylesheet" href="${BASE}/style.css" />
</head>
<body>
  <header class="site-header">
    <a class="site-title" href="${BASE}/index.html">📄 My Site</a>
  </header>
  <div class="layout">
    ${sidebar}
    <main class="content">
      ${frontmatter.title ? `<h1>${frontmatter.title}</h1>` : ''}
      ${html}
    </main>
  </div>
</body>
</html>`
}

// ── Build ─────────────────────────────────────────────────────────────────────

export function buildPage(file, files) {
  const raw = fs.readFileSync(file, 'utf-8')
  const { data, content } = matter(raw)
  const html = md.render(content)
  const sidebar = buildSidebar(files, file)

  const outPath = ('dist/' + file.replace('docs/', '')).replace('.md', '.html')
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, applyLayout(html, data, sidebar))
  console.log(`Built: ${file} → ${outPath}`)
}

function copyStyles() {
  fs.mkdirSync('dist', { recursive: true })
  fs.copyFileSync('style.css', 'dist/style.css')
  if (fs.existsSync('public')) {
    fs.cpSync('public', 'dist', { recursive: true })
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const files = await glob('docs/**/*.md')

if (files.length === 0) {
  console.warn('No .md files found in docs/')
  process.exit(0)
}

copyStyles()
for (const file of files) buildPage(file, files)
console.log(`\n✓ Built ${files.length} page(s) → dist/`)
