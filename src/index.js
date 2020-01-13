const app = require('express')()

// Middlewares
require('middlewares')(app)

// Routes
require('routes')(app)

// Servers
require('servers')(require('http').createServer(app))
