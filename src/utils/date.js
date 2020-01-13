const moment = require('moment')

const getNumber = params =>
  String(params.replace(/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/g, '').replace(/\ /g, ''))

const getRelativeTime = params =>
  params.replace(/[0-9]{0,2}/g, '').replace(/\ /g, '')

const calculateRelativeTime = params => {
  switch (params) {
    case '분전':
      return 'minutes'
    case '시간전':
      return 'hours'
    case '일전':
      return 'days'
  }
}

const convert = params =>
  JSON.stringify(
    moment(new Date(Date.now())).subtract(
      getNumber(params),
      calculateRelativeTime(getRelativeTime(params)),
    ),
  ).substring(1, 11)

module.exports = convert
