import { defineConfig } from 'tsup'
import packageJson from './package.json' with { type: 'json' }

const define = { __SDK_VERSION__: JSON.stringify(packageJson.version) }

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    treeshake: true,
    target: 'es2022',
    outDir: 'dist',
    define,
  },
  {
    entry: { inappify: 'src/browser.ts' },
    format: ['iife'],
    globalName: 'InAppifySDK',
    sourcemap: true,
    clean: false,
    minify: true,
    target: 'es2020',
    outDir: 'dist',
    define,
  },
])
