#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const rootDir = path.join(__dirname, '..')
const templatePath = path.join(rootDir, 'public', 'sw.template.js')
const outputPath = path.join(rootDir, 'public', 'sw.js')

// Use something that changes on every deploy:
// - Explicit CACHE_VERSION env if provided
// - VERCEL_GIT_COMMIT_SHA if running on Vercel
// - Fallback to a timestamp
const version =
  process.env.CACHE_VERSION ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  Date.now().toString()

if (!fs.existsSync(templatePath)) {
  console.error('sw.template.js not found, cannot generate sw.js')
  process.exit(1)
}

const template = fs.readFileSync(templatePath, 'utf8')
const result = template.replace(/__CACHE_VERSION__/g, version)

fs.writeFileSync(outputPath, result)

console.log(`Generated sw.js with CACHE_NAME = lttrs-${version}`)

