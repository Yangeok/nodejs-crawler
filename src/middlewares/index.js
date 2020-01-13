const path = require('path')
const bodyParser = require('body-parser')

const middlewares = app => {
  app.set('view engine', 'pug')
  app.set('views', path.join(__dirname, '../views/assets'))
  app.use(
    bodyParser.urlencoded({
      extended: false,
    }),
  )
  app.use(bodyParser.json())
  app.use('/assets', require('express').static('src/views/assets'))
}

module.exports = middlewares
