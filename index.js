#!/usr/bin/env node

const buble = require('rollup-plugin-buble')
const fetch = require('node-fetch')
const fs = require('fs')
const open = require('open')
const ora = require('ora')
const path = require('path')
const pkg = require(path.join(process.cwd(), 'package.json'))
const rollup = require('rollup')
const webpack = require('webpack')

const embed = id => `<div data-snack-id="${id}" data-snack-platform="ios" data-snack-preview="true" style="overflow:hidden;background:#fafafa;border:1px solid rgba(0,0,0,.16);border-radius:4px;height:505px;width:100%"></div>
<script async src="https://snack.expo.io/embed.js"></script>`

const rootRe = /Expo\.registerRootComponent\((.+)\)/
const importRe = /import Expo from 'expo';\n/
const isCreateReactNativeApp = pkg.devDependencies.hasOwnProperty(
  'react-native-scripts'
)

const crnaMain = `
import Expo from 'expo';
import App from './App';
import React from 'react';
import { View } from 'react-native';

// we don't want this to require transformation
class AwakeInDevApp extends React.Component {
  render() {
    return React.createElement(
      View,
      {
        style: {
          flex: 1,
        },
      },
      React.createElement(App),
      React.createElement(process.env.NODE_ENV === 'development' ? Expo.KeepAwake : View)
    );
  }
}

export default AwakeInDevApp;`

const ship = code => {
  const match = code.match(rootRe)
  if (match && match[1]) {
    code = code.replace(rootRe, `export default ${match[1]}`)

    if (
      !isCreateReactNativeApp &&
      code.match(/Expo/).length === 1 &&
      code.match(importRe)
    ) {
      code = code.replace(importRe, '')
    }
  }

  spinner.text = 'Making snack'

  return fetch('https://snack.expo.io/--/api/v2/snack/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: code,
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
}

const throughRollup = () => {
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

      ship(result.code)
    })
}

const throughWebpack = () => {
  process.env.NODE_ENV = 'production'

  const tmp = './tmp.bundled.app.js'
  const tmpBundle = `${tmp}.bundle`
  fs.writeFileSync(tmp, crnaMain)

  const compiler = webpack({
    entry: tmp,
    output: {
      filename: tmpBundle,
      library: 'MySnackApp',
      libraryTarget: 'var',
    },
    externals: {
      expo: 'Expo',
      react: 'React',
      'react-native': 'ReactNative',
    },
    module: {
      noParse: /expo|react/,
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
          },
        },
      ],
    },
  })

  compiler.run(err => {
    if (err) {
      return ora.fail()
    }

    code = `import React from 'react'
import Expo from 'expo'
import ReactNative from 'react-native'
${fs.readFileSync(tmpBundle, 'utf-8')}
export default MySnackApp.default`

    ship(code).then(() => {
      fs.unlinkSync(tmp)
      fs.unlinkSync(tmpBundle)
    })
  })
}

const spinner = ora('Bundling app').start()

if (isCreateReactNativeApp) {
  throughWebpack()
} else {
  throughRollup()
}
