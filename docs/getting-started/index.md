---
title: Getting Started
description: How to use this SSG
---

## Installation

Clone the repo and install dependencies:

```bash
npm install
```

## Development

Start the dev server with live reload:

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Building

Build the static site to `dist/`:

```bash
npm run build
```

## Adding Pages

Create any `.md` file inside `docs/` and it will be built automatically.

Each page can have frontmatter at the top:

```markdown
---
title: My Page
description: A short description
---

Your content here.
```
