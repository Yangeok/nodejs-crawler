const extractor = require('setups/extractor')

const onCrawlSuccess = async (currentOnGoingJobs, succeededJob) => {
  currentOnGoingJobs = currentOnGoingJobs.filter(
    job => job.id !== succeededJob.id,
  )
  return currentOnGoingJobs
}

const onCrawlError = async (currentOnGoingJobs, failedJob, e) => {
  console.log(currentOnGoingJobs)
  console.log(e)
  currentOnGoingJobs = currentOnGoingJobs.filter(job => job.id !== failedJob.id)
  return currentOnGoingJobs
}

const distributor = async (data, currentOnGoingJobs) => {
  return extractor(data)
    .then(() => onCrawlSuccess(currentOnGoingJobs, data))
    .then(resJobs => resJobs)
    .catch(() => console.log('crawl failed...'))
    .catch(e => onCrawlError(currentOnGoingJobs, data, e))
}

module.exports = distributor
