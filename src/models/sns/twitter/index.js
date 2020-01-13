const moment = require('moment')
const rp = require('request-promise')
const cheerio = require('cheerio')

// setups
const uploadFile = require('setups/s3')
const { setWriteStream, addRow } = require('setups/resultStream')
const browserSetting = require('setups/browser')

// utils
const filter = require('utils/filter')
const sec = require('utils/sec')
const name = require('utils/name')
const requestToES = require('utils/requestToElasticSearch')

const removeElements = async page => {
  // removing header, navigator, footer
  console.log('\n> removing header, navigator, footer\n')
  await page.waitFor(2000)
  await page.evaluate(() => {
    document.querySelector('.topbar.js-topbar').remove()
    document.querySelector('.SearchNavigation').remove()
    document.querySelector('.Grid-cell.u-size1of3.u-lg-size1of4').remove()
  })
}

const scrollDown = async page => {
  // scrolling to change data-min-position
  console.log('\n> scrolling to change data-min-position\n')
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitFor(5000)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
}

const extractPositions = async (page, browser) => {
  // extracting min/maxPosition
  console.log('\n> extracting min/maxPosition\n')
  await page.waitFor(5000)
  let { minPosition, maxPosition } = await page.evaluate(() => {
    const $ = window.$
    return {
      minPosition: $('.stream-container').attr('data-min-position'),
      maxPosition: $('.stream-container').attr('data-max-position'),
    }
  })
  await page.close()
  await browser.close()
  console.log({ minPosition, maxPosition })
  return { minPosition, maxPosition }
}

const goToPageAndGetInfo = async (data, minPosition, latentCount) => {
  // requesting json api
  console.log('\n> requesting json api\n')
  const params = new URLSearchParams()
  params.append('f', 'tweet')
  params.append('vertical', 'default')
  params.append('q', data.keyword)
  params.append('src', 'typd')
  params.append('composed_count', '0')
  params.append('include_available_features', '1')
  params.append('include_entities', '1')
  params.append('include_entities', '1')
  params.append('include_new_items_bar', 'true')
  params.append('latent_count', latentCount)
  params.append('interval', '30000')
  params.append('max_position', minPosition)
  const url = 'https://twitter.com/i/search/timeline?' + params.toString()
  console.log({ url })

  const response = await rp(url)
    .then(res => res)
    .catch(err => console.log(err))

  // parsing responsed item
  const _ = JSON.parse(response)
  minPosition = _.min_position
  latentCount = _.new_latent_count
  const nodes = _.items_html.replace(/\n/g, '')
  const nodesLength = nodes.length

  // storing post data
  console.log('\n> storing post data\n')
  const $ = cheerio.load(nodes)
  const items = $('.js-stream-item.stream-item')
    .toArray()
    .map(row => {
      return {
        keyword: data.keyword,
        category: data.category,
        site: data.site,
        date: moment
          .unix(
            $(row)
              .find('._timestamp')
              .attr('data-time'),
          )
          .format('YYYY-MM-DD'),
        title: '',
        username: $(row)
          .find('.tweet')
          .attr('data-screen-name'),
        content: $(row)
          .find('.js-tweet-text-container')
          .text()
          .slice(2)
          .replace(/\,/g, '')
          .replace(/\n/g, ''),
        click:
          Number(
            $(row)
              .find('.ProfileTweet-action--reply')
              .find('.ProfileTweet-actionCountForAria')
              .text()
              .replace(/[^0-9]/g, ''),
          ) +
          Number(
            $(row)
              .find('.ProfileTweet-action--retweet')
              .find('.ProfileTweet-actionCountForAria')
              .text()
              .replace(/[^0-9]/g, ''),
          ),
        link:
          'https://twitter.com' +
          $(row)
            .find('.tweet')
            .attr('data-permalink-path'),
      }
    })
  console.log({ nodesLength, minPosition, latentCount })
  return { items, nodesLength, minPosition, latentCount }
}

const getItems = async (data, filename) => {
  const { page, browser } = await browserSetting(data.site)
  await setWriteStream(filename)

  try {
    const url =
      'https://twitter.com/search?f=tweets&vertical=default&src=typd&q='
    await page.goto(url + data.keyword)
    await removeElements(page)
    await scrollDown(page)
    let { minPosition, maxPosition } = await extractPositions(page, browser)

    let hasMoreItems = true
    let latentCount = 0
    while (hasMoreItems) {
      const getInfo = await goToPageAndGetInfo(data, minPosition, latentCount)
      minPosition = getInfo.minPosition
      latentCount = getInfo.latentCount

      if (getInfo.items === [] || getInfo.nodesLength === 1) {
        console.log('\n> no more items...')
        break
      }

      for (let item of getInfo.items) {
        if (moment(data.startDate).isAfter(item.date)) {
          console.log('\n> start date must be after item date...')
          hasMoreItems = false
          break
        }

        if (
          moment(data.startDate).isSameOrBefore(item.date) &&
          moment(data.endDate).isSameOrAfter(item.date)
        ) {
          console.log(item)
          await addRow(item, filename)
          process.env.NODE_ENV === 'batch' &&
            (await requestToES(item, data._index))
        }
      }
    }
  } catch (err) {
    console.log('\n', err)
  } finally {
    console.log('\n------------------\nCrawl completed\n')
    return await uploadFile(filename)
  }
}

const model = async data => {
  const filename = await name(data.keyword, data.site)
  return await getItems(data, filename)
}

module.exports = model
