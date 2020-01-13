const moment = require('moment')

const name = async (keyword, channel) =>
  await `${keyword}_${channel}_${moment().format('YYYY-MM-DD-HHMMSS')}.csv`

module.exports = name
