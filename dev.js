import fs from 'fs'
import http from 'http'
import path from 'path'
import { WebSocketServer } from 'ws'
import { glob } from 'glob'
import MarkdownIt from 'markdown-it'
import matter from 'gray-matter'

const PORT = 3000
const WS_PORT = 3001

const md = new MarkdownIt({ html: true })

// ── Build helpers (inlined so we don't need module cache tricks) ──────────────

function buildNav(files) {
  return files
    .map(file => {
      const raw = fs.readFileSync(file, 'utf-8')
      const { data } = matter(raw)
      const href = '/' + file.replace('docs/', '').replace('.md', '.html')
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
  <link rel="stylesheet" href="/style.css" />
</head>
<body>
  <nav class="site-nav">
    <a class="site-title" href="/index.html">📄 My Site</a>
    <div class="nav-links">${nav}</div>
  </nav>
  <main class="content">
    ${frontmatter.title ? `<h1>${frontmatter.title}</h1>` : ''}
    ${html}
  </main>
  <script>
    const ws = new WebSocket('ws://localhost:${WS_PORT}');
    ws.onmessage = () => location.reload();
    ws.onclose = () => console.log('[dev] websocket closed');
  </script>
</body>
</html>`
}

function buildPage(file, nav) {
  const raw = fs.readFileSync(file, 'utf-8')
  const { data, content } = matter(raw)
  const html = md.render(content)
  const outPath = ('dist/' + file.replace('docs/', '')).replace('.md', '.html')
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, applyLayout(html, data, nav))
}

async function buildAll() {
  const files = await glob('docs/**/*.md')
  fs.mkdirSync('dist', { recursive: true })
  fs.copyFileSync('style.css', 'dist/style.css')
  const nav = buildNav(files)
  for (const file of files) buildPage(file, nav)
  console.log(`Built ${files.length} page(s)`)
}

// ── WebSocket server ──────────────────────────────────────────────────────────

const wss = new WebSocketServer({ port: WS_PORT })

function reload() {
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send('reload')
  })
}

// ── File watcher ──────────────────────────────────────────────────────────────

// ── File watcher ──────────────────────────────────────────────────────────────

let rebuilding = false

fs.watch('docs', { recursive: true }, async (event, filename) => {
  if (!filename?.endsWith('.md')) return
  if (rebuilding) return
  rebuilding = true
  console.log(`${event}: ${filename} — rebuilding...`)
  try {
    await buildAll()
    console.log(`Rebuilt — sending reload to ${wss.clients.size} client(s)`)
    reload()
  } catch (err) {
    console.error('Build error:', err)
  } finally {
    setTimeout(() => { rebuilding = false }, 500)
  }
})

fs.watch('style.css', async (event) => {
  console.log(`${event}: style.css — rebuilding...`)
  await buildAll()
  reload()
})

// ── Static file server ────────────────────────────────────────────────────────

const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
}

const server = http.createServer((req, res) => {
  let urlPath = req.url === '/' ? '/index.html' : req.url
  urlPath = urlPath.split('?')[0]
  let filePath = path.join('dist', urlPath)

  if (!path.extname(filePath)) filePath += '.html'

  if (!fs.existsSync(filePath)) {
    res.writeHead(404)
    return res.end('Not found')
  }

  const ext = path.extname(filePath)
  const content = fs.readFileSync(filePath)
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' })
  res.end(content)
})

// ── Start ─────────────────────────────────────────────────────────────────────

await buildAll()

server.listen(PORT, () => {
  console.log(`\n🚀 Dev server running at http://localhost:${PORT}`)
  console.log('   Watching docs/**/*.md and style.css for changes...\n')
})
