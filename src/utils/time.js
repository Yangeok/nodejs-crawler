const moment = require('moment')
const reg = /\d\d:\d\d/g

const convert = params =>
  reg.test(params)
    ? JSON.stringify(moment(new Date(Date.now()))).substring(1, 11)
    : params.replace(/\./g, '-')

module.exports = convert
