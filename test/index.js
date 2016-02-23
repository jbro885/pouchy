'use strict'
var test = require('tape')
var cp = require('child_process')
var Pouchy = require('../')
// Pouchy.PouchDB.debug.enable('*')
var fs = require('fs.extra')
var path = require('path')
var testDir = path.join(__dirname, './.test-db-dir')
var pouchyFactory = function (opts) {
  if (!opts.path) { opts.path = testDir }
  return new Pouchy(opts)
}
var couchdbInvalidName = 'TEsT dB'
var couchdbInvalidUrl = 'https://www.me.org/eeek/invalidPathname'
var couchdbInvalidConn = {
  protocol: 'https',
  hostname: 'localhost',
  port: 3001,
  pathname: 'invalidPathname'
}
var name = 'test-db-'
var conn = {
  protocol: 'https',
  hostname: 'localhost',
  port: 3001,
  pathname: 'validpathname'
}
let p

const setup = () => {
  cp.execSync('rm -rf ' + testDir)
  cp.execSync('mkdir -p ' + testDir)
  if (!fs.statSync(testDir).isDirectory) {
    throw new ReferenceError('test dir not generated')
  }
}

const teardown = () => {
  try { fs.rmrf(testDir) } catch (err) {}
}

test('setup', function (t) {
  setup()
  t.end()
})

test('constructor', function (t) {
  t.plan(10)

  // name requirement
  try {
    pouchyFactory({})
    t.fail('pouchdb didnt have name')
  } catch (err) {
    t.ok(true, 'enforced name')
  }

  // invalid name
  try {
    p = pouchyFactory({ name: couchdbInvalidName })
  } catch (err) {
    t.ok(true, 'Errored on couchdbInvalidName')
  }

  // invalid url
  try {
    pouchyFactory({ name: couchdbInvalidUrl })
  } catch (err) {
    t.ok(true, 'Errored on couchdbInvalidUrl')
  }

  // invalid conn
  try {
    pouchyFactory({ conn: couchdbInvalidConn })
  } catch (err) {
    t.ok(true, 'Errored on couchdbInvalidUrl')
  }

  // conn building url
  var pFail = pouchyFactory({ conn: conn })
  t.ok(pFail.url, 'conn url built successfully')

  var pPath = pouchyFactory({ name: 'ppath' })
  pPath.save({ _id: 'test-path' }, (err, doc) => {
    if (err) { return t.end(err.message) }
    var lstat = fs.lstatSync(path.resolve(testDir, 'ppath'))
    t.ok(lstat.isDirectory, 'construct db in path honored')
  })

  var pSlash = pouchyFactory({ name: 'db/with/slash' })
  t.ok(pSlash, 'allows / in db name')
  pSlash.save({ _id: 'slash-test' }, (err, doc) => {
    if (err) {
      t.pass('forbids writing dbs with slashes/in/name to disk')
      return
    }
    t.end('permitted writing db with slashes/in/db/name to disk')
  })

  // custom path
  var customDir = path.join(__dirname, 'custom-db-path')
  try { fs.rmrfSync(customDir) } catch (err) {}
  try { fs.mkdirSync(customDir) } catch (err) {}
  var pCustomPath = pouchyFactory({
    name: 'custom-dir-db',
    path: customDir
  })
  pCustomPath.save({ _id: 'custom-path-test' }, (err, doc) => {
    if (err) { return t.end(err.message) }
    var customStat = fs.statSync(path.join(customDir, 'custom-dir-db', 'LOG'))
    t.ok(customStat, 'custom db paths')
    try { fs.rmrfSync(customDir) } catch (err) {}
  })

  var pSync = pouchyFactory({
    url: 'http://www.bogus-sync-db.com/bogusdb',
    replicate: 'both'
  })
  pSync.info()
    .catch(function (err) {
      t.ok(err, 'errors on invalid remote db request')
    })
})

test('all, add, save, delete', function (t) {
  var docs = [
    {_id: 'test-doc-1', test: 'will put on `add` with _id'},
    {id: 'test-doc-2', test: 'will post on `add` without _id'},
    {_id: 'test-doc-3', test: 'will put on `save` with _id'},
    {_id: 'test-doc-4', dummyKey: 'dummyVal'}
  ]
  p = pouchyFactory({ name: name + Date.now() })

  t.plan(6)
  p.add(docs[0]) // add1
    .then(function checkAdd1 (doc) {
      t.equal(docs[0]._id, doc._id, '.add kept _id via put')
      docs[0] = doc
    })
    .then(function add2 () {
      return p.add(docs[1])
    })
    .then(function checkAdd2 (doc) {
      docs[1] = doc
      t.ok(doc._id.length > 15, ".add gen'd long _id via post")
      t.notEqual(doc._id, 'test-doc-2', 'id not === _id')
    })
    .then(function add3 () {
      return p.add(docs[2])
    })
    .then(function add4 (doc) {
      return p.add(docs[3])
    })
    .then(function getAll () {
      return p.all()
    })
    .then(function checkGetAllPromise (r) {
      t.equal(r.length, docs.length, 'same number of docs added come out! (promise mode)')
      t.equal(r[3].dummyKey, docs[3].dummyKey, 'actual docs returned by .all')
    })
    .then(function checkGetAllCallback (r) {
      return new Promise(function (resolve, reject) {
        p.all(function (err, r) {
          if (err) { return reject(err) }
          t.equal(r.length, docs.length, 'same number of docs added come out! (cb mode)')
          return resolve()
        })
      })
    })
    .then(function () {
      return p.delete(docs[0])
    })
    .then(function (result) {
      t.end()
    })
    .catch(function (err) {
      t.fail(err)
      t.end()
    })
})

test('indexes & find', function (t) {
  p = pouchyFactory({ name: name + Date.now() })
  t.plan(2)
  p.createIndicies('test')
    .then(function (indexResults) {
      t.pass('indicies created')
      return p.db.bulkDocs([
        {test: 't1', _id: 'doc1'},
        {test: 't2', _id: 'doc2'}
      ])
    })
    .then(function () {
      return p.find({
        selector: {test: 't2'},
        fields: ['_id']
      })
    })
    .then(function (result) {
      t.equal('doc2', result[0]._id, 'find on index')
      t.end()
    })
    .catch(function (err) {
      t.fail(err.message)
      t.end()
    })
})

test('update', function (t) {
  p = pouchyFactory({ name: name + Date.now() })
  var rev
  t.plan(3)
  return p.add({test: 'update-test'})
    .then(function (doc) {
      rev = doc._rev
      doc.newField = 'new-field'
      return p.update(doc)
        .then(function (updatedDoc) {
          t.notOk(rev === updatedDoc._rev, 'update updates _rev')
          t.equal('new-field', updatedDoc.newField, 'update actually updates')
        })
    })
    .then(function () {
      return p.clear()
    })
    .then(function () {
      return p.all()
    })
    .then(function (docs) {
      t.equal(0, docs.length, 'docs cleared')
    })
    .then(t.end)
    .catch(function (err) {
      t.fail(err.message)
      t.end()
    })
})

test('proxies loaded', function (t) {
  p = pouchyFactory({ name: name + Date.now() })
  t.ok(p.info, 'proxied function present')
  t.end()
})

test('prefers db folder named after opts.name vs url /pathname', function (t) {
  setup()
  var opts = {
    name: 'p2',
    url: 'http://www.dummy/couch/p2'
  }
  var p = pouchyFactory(opts)
  t.plan(2)
  p.save({ _id: 'xzy', random: 1 }, (err, doc) => {
    if (err) { return t.end(err.message) }
    t.ok(fs.statSync(path.resolve(testDir, opts.name, 'LOG')), 'db in dir derived from `name`, not url')
    t.equal(p.url, opts.url, 'url remains intact')
    teardown()
    t.end()
  })
})

test('memdown', (t) => {
  t.plan(1)
  setup()
  var memdownOpts = {
    name: 'test-memdown',
    pouchConfig: { db: require('memdown') }
  }
  var noMemdownOpts = {
    name: 'test-memdown'
  }
  var p = pouchyFactory(memdownOpts)
  p.save({ _id: '123' })
    // test
    .then(() => {
      try {
        fs.statSync(path.resolve(testDir, memdownOpts.name, 'LOG'))
      } catch (err) {
        if (err.code === 'ENOENT') {
          t.ok(err, 'no stores generated when configured for memdown')
          return
        }
      }
      t.end('db dir found when using memdown')
    })
    .then(() => {
      var p2 = pouchyFactory(noMemdownOpts)
      p2.save({ _id: '456' })
        .then(() => {
          try {
            t.ok(
              fs.statSync(path.join(testDir, noMemdownOpts.name, 'LOG')),
              'LOG present, memdown disabled'
            )
          } catch (err) {
            return t.end('expected LOG file')
          }
          teardown()
          t.end()
        })
    })
})

test('teardown', function (t) {
  teardown()
  t.end()
})
