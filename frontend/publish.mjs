import { copyFile, cp, rm } from 'node:fs/promises'

// Keep FastAPI's existing homepage and /static routes unchanged.
await copyFile(new URL('./dist/index.html', import.meta.url), new URL('./index.html', import.meta.url))
await rm(new URL('./static/vue', import.meta.url), { recursive: true, force: true })
await cp(new URL('./dist/static', import.meta.url), new URL('./static', import.meta.url), { recursive: true })
