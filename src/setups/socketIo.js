const extractor = require('setups/extractor')
const moment = require('moment')
const uuidv4 = require('uuid/v4')
const aws = require('aws-sdk')
const { computeCategory, computeChannel } = require('utils/computeCol')

aws.config.loadFromPath('aws.config.json')

const socketServer = async app => {
  const socketio = require('socket.io')(app)
  socketio.on('connection', async socket => {
    socket.on('append', async data => {
      data.category = computeCategory(data.keyword, data._index)
      data.channel = computeChannel(data.site, data._index)
      const scheduledTime = moment(data.runSchedule).unix()
      const keywords = data.keyword.split(', ')

      // job scheduling
      const jobReservation = uuid => {
        setTimeout(async () => {
          let currentTime = moment().unix()
          console.log({
            uuid,
            currentTime,
            scheduledTime,
            isCurrTimeEarlierThanScddTime: currentTime >= scheduledTime,
          })

          if (currentTime >= scheduledTime) {
            for (let keyword of keywords) {
              data.keyword = keyword
              console.log(data)
              const result = await extractor(data)
              console.log(result)
              socket.emit('finished', result)
            }
            clearTimeout(jobReservation)
          } else {
            jobReservation(uuid)
          }
        }, 3000)
      }
      jobReservation(uuidv4())
    })
  })
}

module.exports = socketServer
