// setups
const uploadFile = require('setups/s3')
const { setWriteStream, addRow } = require('setups/resultStream')
const browserSetting = require('setups/browser')
const moment = require('moment')

// utils
const filter = require('utils/filter')
const sec = require('utils/sec')
const name = require('utils/name')
const requestToES = require('utils/requestToElasticSearch')

const generateURL = async (keyword, lastId = null) => {
  const host = 'https://www.instagram.com'
  const url = `${host}/explore/tags/${encodeURI(
    keyword,
  )}/?__a=1&max_id=${lastId || ''}`
  console.log(url)
  return url
}

const goToPostPageAndGetInfo = async (page, data, link, date) => {
  await page.goto(link)
  await page.waitFor(sec(1000, 2000))
  const node = await page.evaluate(() => {
    const data = JSON.parse(document.body.innerText)
    const edge = data.graphql.shortcode_media
    return edge
  })
  const item = {
    keyword: data.keyword,
    category: data.category,
    date,
    title: '',
    username: node.owner.username,
    content:
      node.edge_media_to_caption.edges.length !== 0
        ? filter(node.edge_media_to_caption.edges[0].node.text)
        : '',
    click: node.video_view_count || node.edge_media_preview_like.count,
    link: link.split('/?')[0],
    site: data.site,
    channel: data.channel,
  }
  console.log({
    date,
    username: item.username,
    link: item.link,
  })
  return item
}

const getItems = async (page, data, filename, lastId) => {
  try {
    await page.goto(await generateURL(data.keyword, lastId))
    await page.waitFor(sec(1000, 5000))
    const { node, _ } = await page.evaluate(() => {
      const _ = JSON.parse(document.body.innerText)
      const node = _.graphql.hashtag.edge_hashtag_to_media
      return {
        node,
        _,
      }
    })

    const firstPostDate = moment
      .unix(
        _.graphql.hashtag.edge_hashtag_to_media.edges.length !== 0
          ? _.graphql.hashtag.edge_hashtag_to_media.edges[0].node
              .taken_at_timestamp
          : null,
      )
      .format('YYYY-MM-DD')
    if (moment(firstPostDate).isBefore(data.startDate, 'YYYY-MM-DD')) {
      throw new Error('no more filtered date')
    }
    if (node.edges.length === 0) {
      throw new Error('no more posts')
    }
    const posts = node.edges
    for (let post of posts) {
      const date = moment
        .unix(post.node.taken_at_timestamp)
        .format('YYYY-MM-DD')
      const isSameOrAfterStartDate = moment(date, 'YYYY-MM-DD').isSameOrAfter(
        data.startDate,
        'YYYY-MM-DD',
      )
      const isSameOrBeforeEndDate = moment(date, 'YYYY-MM-DD').isSameOrBefore(
        data.endDate,
        'YYYY-MM-DD',
      )

      if (isSameOrAfterStartDate && isSameOrBeforeEndDate) {
        const item = await goToPostPageAndGetInfo(
          page,
          data,
          `https://instagram.com/p/${post.node.shortcode}/?__a=1`,
          date,
        )
        await addRow(item, filename)
        process.env.NODE_ENV === 'batch' &&
          (await requestToES(item, data._index))
      }
    }

    lastId = node.page_info.end_cursor
    if (lastId === null) {
      throw new Error('no more pages')
    }
    console.log(`\n\nlastId = nextPage: ${lastId}\n\n`)
    await getItems(page, data, filename, lastId)
  } catch (err) {
    console.log(err)
    return
  }
  return uploadFile(filename)
}

const model = async data => {
  // removing empty space
  data.keyword = data.keyword.replace(/\s/g, '')

  const { page, browser } = await browserSetting(data.site)
  await page.goto(await generateURL(data.keyword))
  const filename = await name(data.keyword, data.site)
  await setWriteStream(filename)
  const result = await getItems(page, data, filename)
  await browser.close()
  return result
}

module.exports = model
