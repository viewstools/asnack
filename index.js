#!/usr/bin/env node

const buble = require('rollup-plugin-buble')
const fetch = require('node-fetch')
const fs = require('fs')
const open = require('open')
const ora = require('ora')
const path = require('path')
const pkg = require(path.join(process.cwd(), 'package.json'))
const rollup = require('rollup')

const embed = id => `<div data-snack-id="${id}" data-snack-platform="ios" data-snack-preview="true" style="overflow:hidden;background:#fafafa;border:1px solid rgba(0,0,0,.16);border-radius:4px;height:505px;width:100%"></div>
<script async src="https://snack.expo.io/embed.js"></script>`

const rootRe = /Expo\.registerRootComponent\((.+)\)/
const importRe = /import Expo from 'expo';\n/

const spinner = ora('Bundling app').start()

rollup
  .rollup({
    entry: path.join(process.cwd(), pkg.main),
    plugins: [
      buble({
        objectAssign: 'Object.assign',
      }),
    ],
    onwarn: () => {},
  })
  .then(bundle => {
    const result = bundle.generate({
      format: 'es',
    })

    const match = result.code.match(rootRe)
    if (match && match[1]) {
      result.code = result.code.replace(rootRe, `export default ${match[1]}`)

      if (
        result.code.match(/Expo/).length === 1 &&
        result.code.match(importRe)
      ) {
        result.code = result.code.replace(importRe, '')
      }
    }

    spinner.text = 'Making snack'

    fetch('https://snack.expo.io/--/api/v2/snack/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: result.code,
        manifest: {
          sdkVersion: '16.0.0',
          name: pkg.name,
          description: pkg.description,
        },
      }),
    })
      .then(r => {
        if (r.ok) {
          return r.json()
        } else {
          throw r
        }
      })
      .then(d => {
        spinner.stop()

        console.log(`👾 https://snack.expo.io/${d.id}`)

        const file = `snack-${d.id}.html`
        fs.writeFileSync(file, embed(d.id))
        open(file)

        console.log(`🔥 ${file}`)
      })
      .catch(console.error.bind(console))
  })
