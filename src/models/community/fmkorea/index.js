const moment = require('moment')
const cheerio = require('cheerio')

// setups
const uploadFile = require('setups/s3')
const { setWriteStream, addRow } = require('setups/resultStream')
const browserSetting = require('setups/browser')

// utils
const sec = require('utils/sec')
const filter = require('utils/filter')
const name = require('utils/name')
const {
  totalPostCountSelector,
  infoInListPageSelector,
  linkSelector,
  dateSelector,
  titleSelector,
  userSelector,
  contentSelector,
  clickSelector,
} = require('./selectors')
const requestToES = require('utils/requestToElasticSearch')

const generateURL = async (currentPage = 1, keyword) => {
  const host = 'http://www.fmkorea.com'
  const url = `${host}/index.php?act=IS&mid=home&where=document&is_keyword=${keyword}&page=${currentPage}`
  console.log(url)
  return url
}

const getPostsInfoInListPage = async $ => {
  const infoInListPage = $(infoInListPageSelector)
    .toArray()
    .map((row, index) => {
      return {
        link:
          linkSelector +
          $(row)
            .find('a')
            .attr('href'),
        index,
      }
    })
  console.log(infoInListPage)
  return infoInListPage
}

const goToPostPageAndGetInfo = async (page, data, link) => {
  await page.goto(link)
  const content = await page.content()
  const $ = await cheerio.load(content)
  const item = {
    keyword: data.keyword,
    category: data.category,
    date: $(dateSelector)
      .text()
      .substring(0, 10)
      .replace(/\./g, '-'),
    title: filter($(titleSelector).text()),
    username: filter($(userSelector).text()),
    content: filter($(contentSelector).text()),
    click: filter(
      $(clickSelector)
        .text()
        .split('조회 수 ')[1],
    ),
    link,
    site: data.site,
     
    channel: data.channel,
  }
  console.log({ date: item.date, username: item.username, link: item.link })
  return item
}

const getPageCount = async $ => {
  const totalPostCount = Number(
    $(totalPostCountSelector)
      .text()
      .split('문서 (')[1]
      .replace(/\,/g, '')
      .replace(')', ''),
  )
  const pageSize = 10

  if (totalPostCount === NaN) {
    throw new Error('total post count: NAN')
  }
  if (totalPostCount % pageSize === 0) {
    return Math.floor(totalPostCount / pageSize)
  } else {
    return Math.floor(totalPostCount / pageSize) + 1
  }
}

const getItems = async ($, page, data, filename) => {
  await setWriteStream(filename)

  try {
    const totalPages = await getPageCount($)
    console.log(`totalPages: ${totalPages}`)

    let hasMetStart = false
    let doneCrawlFirstMetPage = false
    let firstMetPostIndex = 0
    let crawlEnd = false

    for (
      let currentPage = 1;
      currentPage <= totalPages && !crawlEnd;
      currentPage++
    ) {
      console.log('------------------')
      console.log(`currentPage: ${currentPage}`)
      const content = await page.content()
      const $$ = cheerio.load(content)

      if (!hasMetStart) {
        const postsOnPage = await getPostsInfoInListPage($$)
        await page.waitFor(1000)
        const firstPostInfoOnPage = await goToPostPageAndGetInfo(
          page,
          data,
          postsOnPage[0].link,
        )

        if (
          moment(data.startDate, 'YYYY-MM-DD').isAfter(firstPostInfoOnPage.date)
        ) {
          break
        }

        for (let i = 1; i < postsOnPage.length - 1; i++) {
          const postInfo = await goToPostPageAndGetInfo(
            page,
            data,
            postsOnPage[i].link,
          )
          if (moment(data.endDate, 'YYYY-MM-DD').isSameOrAfter(postInfo.date)) {
            hasMetStart = true
            firstMetPostIndex = i
            break
          }
        }
      }

      if (hasMetStart) {
        await page.waitFor(1000)
        await page.goto(await generateURL(currentPage, data.keyword))
        await page.waitFor(sec(500, 2000))
        const nextPageContent = await page.content()
        const $$$ = await cheerio.load(nextPageContent)

        let postsOnPage = await getPostsInfoInListPage($$$)

        if (!doneCrawlFirstMetPage) {
          postsOnPage = postsOnPage.slice(firstMetPostIndex - 1)
          doneCrawlFirstMetPage = true
        }

        for (const post of postsOnPage) {
          const item = await goToPostPageAndGetInfo(page, data, post.link)
          if (!moment(data.startDate).isAfter(item.date)) {
            await addRow(item, filename)
            process.env.NODE_ENV === 'batch' && (await requestToES(item, data._index))
          } else {
            crawlEnd = true
            break
          }
        }
      }
    }
  } catch (err) {
    console.log('\n', err)
  } finally {
  console.log('\n------------------\nCrawl completed\n')
  await page.close()
  return await uploadFile(filename)
  }
}

const model = async data => {
  const { page, browser } = await browserSetting(data.site)
  await page.goto(await generateURL(1, data.keyword))
  const content = await page.content()
  const $ = await cheerio.load(content)
  const filename = await name(data.keyword, data.site)
  const result = await getItems($, page, data, filename)
  await browser.close()
  return result
}

module.exports = model
