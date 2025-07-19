module.exports = {
  apps: [{
    name: 'web-scrapper-bot',
    script: 'dist/index.js',
    watch: ['dist'],
    ignore_watch: ['node_modules', 'data.db', 'sessions.json']
  }]
}
