const moment = require('moment')

const dateFormatter = originalDate => {
  if (originalDate.includes('분')) {
    return moment().subtract(parseInt(originalDate), 'minutes')
  } else if (originalDate.includes('시간')) {
    return moment().subtract(parseInt(originalDate), 'hours')
  } else if (originalDate.includes('일')) {
    return moment().subtract(parseInt(originalDate), 'days')
  } else if (originalDate.includes('어제')) {
    return moment().subtract(1, 'd')
  } else {
    return moment(originalDate, 'YYYY.MM.DD')
  }
}

module.exports = dateFormatter
