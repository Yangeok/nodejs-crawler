const distributor = require('setups/distributor')
const { computeCategory, computeChannel } = require('utils/computeCol')
const MAX_BROWSER_COUNT = Number(process.env.MAX_BROWSER_COUNT)

let currentOnGoingJobs = []

const wrapper = asyncFn => {
  return async (req, res, next) => {
    try {
      return await asyncFn(req, res, next)
    } catch (error) {
      return next(error)
    }
  }
}

const routers = app => {
  app.get('/', (req, res) => {
    res.render('index')
  })

  app.get('/crawl', (req, res) => {
    if (currentOnGoingJobs.length < MAX_BROWSER_COUNT) {
      console.log('> crawl available...')
      res.status(200).json({ success: true })
      return
    }

    console.log('> crawl unavailable...')
    res.status(500).json({
      success: false,
    })
  })

  app.post(
    '/crawl',
    wrapper(async (req, res) => {
      const { body } = req.body
      body.category = computeCategory(body.keyword, body._index)
      body.channel = computeChannel(body.site, body._index)
      console.log(body)

      currentOnGoingJobs.push(body)
      console.log({ currentJobLength: currentOnGoingJobs.length })

      currentOnGoingJobs = await distributor(
        currentOnGoingJobs[currentOnGoingJobs.length - 1],
        currentOnGoingJobs,
      )
      console.log({ currentJobLength: currentOnGoingJobs.length })

      res.status(200).json({
        success: true,
      })
    }),
  )
}

module.exports = routers
