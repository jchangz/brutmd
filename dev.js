import fs from 'fs'
import http from 'http'
import path from 'path'
import { WebSocketServer } from 'ws'
import { glob } from 'glob'
import MarkdownIt from 'markdown-it'
import matter from 'gray-matter'

const PORT = 3000
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

  if (tree['_root']) {
    for (const file of tree['_root']) {
      const href = '/' + file.replace('docs/', '').replace('.md', '.html')
      const title = getTitle(file)
      const active = file === currentFile ? ' class="active"' : ''
      html += `<li><a href="${href}"${active}>${title}</a></li>`
    }
  }

  for (const [folder, folderFiles] of Object.entries(tree)) {
    if (folder === '_root') continue

    const label = folder.charAt(0).toUpperCase() + folder.slice(1)
    const isActive = folderFiles.some(f => f === currentFile)

    html += `<li class="sidebar-group${isActive ? ' open' : ''}">`
    html += `<span class="sidebar-group-label">${label}</span>`
    html += '<ul class="sidebar-sublist">'

    for (const file of folderFiles) {
      const href = '/' + file.replace('docs/', '').replace('.md', '.html')
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

function applyLayout(html, frontmatter, sidebar, wsPort) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${frontmatter.title || 'My Site'}</title>
  <link rel="stylesheet" href="/style.css" />
</head>
<body>
  <header class="site-header">
    <a class="site-title" href="/index.html">📄 My Site</a>
  </header>
  <div class="layout">
    ${sidebar}
    <main class="content">
      ${frontmatter.title ? `<h1>${frontmatter.title}</h1>` : ''}
      ${html}
    </main>
  </div>
  <script>
    const ws = new WebSocket('ws://localhost:${wsPort}');
    ws.onmessage = () => location.reload();
    ws.onclose = () => console.log('[dev] websocket closed');
  </script>
</body>
</html>`
}

// ── Build ─────────────────────────────────────────────────────────────────────

function buildPage(file, files, wsPort) {
  const raw = fs.readFileSync(file, 'utf-8')
  const { data, content } = matter(raw)
  const html = md.render(content)
  const sidebar = buildSidebar(files, file)
  const outPath = ('dist/' + file.replace('docs/', '')).replace('.md', '.html')
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, applyLayout(html, data, sidebar, wsPort))
}

async function buildAll(wsPort) {
  const files = await glob('docs/**/*.md')
  fs.mkdirSync('dist', { recursive: true })
  fs.copyFileSync('style.css', 'dist/style.css')
  for (const file of files) buildPage(file, files, wsPort)
  console.log(`Built ${files.length} page(s)`)
}

// ── Static file server ────────────────────────────────────────────────────────

const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
}

function handleRequest(req, res) {
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
}

// ── Start ─────────────────────────────────────────────────────────────────────

function listen(port) {
  const server = http.createServer(handleRequest)

  server.listen(port)
    .on('listening', async () => {
      const actualPort = server.address().port
      const wsPort = actualPort + 1

      const wss = new WebSocketServer({ port: wsPort })

      function reload() {
        wss.clients.forEach(client => {
          if (client.readyState === 1) client.send('reload')
        })
      }

      await buildAll(wsPort)

      let rebuilding = false

      fs.watch('docs', { recursive: true }, async (event, filename) => {
        if (!filename?.endsWith('.md')) return
        if (rebuilding) return
        rebuilding = true
        const fullPath = path.join('docs', filename)
        const exists = fs.existsSync(fullPath)
        const action = event === 'rename' ? (exists ? 'created' : 'deleted') : 'changed'
        console.log(`${action}: ${filename} — rebuilding...`)
        try {
          await buildAll(wsPort)
          console.log(`Rebuilt — sending reload to ${wss.clients.size} client(s)`)
          reload()
        } catch (err) {
          console.error('Build error:', err)
        } finally {
          setTimeout(() => { rebuilding = false }, 500)
        }
      })

      fs.watch('style.css', async () => {
        console.log('changed: style.css — rebuilding...')
        await buildAll(wsPort)
        reload()
      })

      console.log(`\n🚀 Dev server running at http://localhost:${actualPort}`)
      console.log(`   WebSocket on port ${wsPort}`)
      console.log('   Watching docs/**/*.md and style.css for changes...\n')
    })
    .on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`Port ${port} in use, trying ${port + 1}...`)
        server.close(() => listen(port + 1))
      } else {
        throw err
      }
    })
}

listen(PORT)
