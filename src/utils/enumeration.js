const moment = require('moment')

module.exports = (startDate, endDate) => {
  const dates = []
  const currDate = moment(startDate)
    .subtract(1, 'day')
    .startOf('day')
  const lastDate = moment(moment(endDate)).startOf('day')

  while (currDate.add(1, 'days').diff(lastDate) <= 0) {
    dates.push(moment(currDate.clone().toDate()).format('YYYY-MM-DD'))
  }
  console.log(dates)
  return dates
}
