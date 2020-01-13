const { port, environment } = require('utils/env')

const servers = app => {
  require('setups/socketIo')(app)
  app.listen(port, () => {
    console.log(`> Server is running on port ${port} on ${environment} env`)
  })
}

module.exports = servers
