require('dotenv').config()

const env = process.env
let port, environment

switch (env.NODE_ENV) {
  case 'development':
    environment = 'development'
    port = env.PORT_DEV || 8080
    break
  case 'production':
    environment = 'production'
    port = env.PORT_PROD || 80
    break
  case 'batch':
    environment = 'batch'
    port = env.PORT_BAT || 3030
    break
  case 'test':
    environment = 'test'
    port = env.PORT_TEST || 8080
    break
}

module.exports = { port, environment }
