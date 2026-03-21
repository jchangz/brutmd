import fs from 'fs'
import path from 'path'
import MarkdownIt from 'markdown-it'
import matter from 'gray-matter'
import { glob } from 'glob'

const BASE = process.env.BASE_PATH || ''
const md = new MarkdownIt({ html: true })

// ── Layout ────────────────────────────────────────────────────────────────────

function buildNav(files) {
  return files
    .map(file => {
      const raw = fs.readFileSync(file, 'utf-8')
      const { data } = matter(raw)
      const href = BASE + '/' + file
        .replace('docs/', '')
        .replace('.md', '.html')
      return `<a href="${href}">${data.title || path.basename(file, '.md')}</a>`
    })
    .join('\n')
}

function applyLayout(html, frontmatter, nav) {
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
  <nav class="site-nav">
    <a class="site-title" href="${BASE}/index.html">📄 My Site</a>
    <div class="nav-links">${nav}</div>
  </nav>
  <main class="content">
    ${frontmatter.title ? `<h1>${frontmatter.title}</h1>` : ''}
    ${html}
  </main>
</body>
</html>`
}

// ── Build ─────────────────────────────────────────────────────────────────────

export function buildPage(file, nav) {
  const raw = fs.readFileSync(file, 'utf-8')
  const { data, content } = matter(raw)
  const html = md.render(content)

  const outPath = ('dist/' + file.replace('docs/', '')).replace('.md', '.html')
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, applyLayout(html, data, nav))
  console.log(`Built: ${file} → ${outPath}`)
}

function copyStyles() {
  fs.mkdirSync('dist', { recursive: true })
  fs.copyFileSync('style.css', 'dist/style.css')
}

// ── Main ──────────────────────────────────────────────────────────────────────

const files = await glob('docs/**/*.md')

if (files.length === 0) {
  console.warn('No .md files found in docs/')
  process.exit(0)
}

const nav = buildNav(files)
copyStyles()

for (const file of files) {
  buildPage(file, nav)
}

console.log(`\n✓ Built ${files.length} page(s) → dist/`)
