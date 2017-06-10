var fs = require('fs')
var path = require('path')
var browserify = require('browserify')
browserify(path.resolve(__dirname, '../test/browser/index.js'))
.transform('babelify', { presets: ['es2015'] })
.bundle()
.pipe(fs.createWriteStream(path.resolve(__dirname, '../bundle.js')))
