require('dotenv').config()
const moment = require('moment')
const cheerio = require('cheerio')

// setups
const uploadFile = require('setups/s3')
const { setWriteStream, addRow } = require('setups/resultStream')
const browserSetting = require('setups/browser')

// utils
const filter = require('utils/filter')
const sec = require('utils/sec')
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
const host = 'http://www.slrclub.com'

const haveLogin = async page => {
  const env = process.env
  const { SLR_ID, SLR_PW } = env
  console.log({
    SLR_ID,
    SLR_PW,
  })
  await page.goto(host)
  await page.type('.user-id', SLR_ID)
  await page.type('.password', SLR_PW)
  await Promise.all([
    page.click('.rug.bt_login'),
    page.waitForNavigation({
      waitUntil: 'networkidle0',
    }),
  ])
}

const generateURL = async (currentPage = 1, keyword) => {
  const url = `${host}/service/search/?keyword=${encodeURI(
    keyword,
  )}&page=${currentPage}`
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
  await page.waitFor(sec(500, 1000))
  const content = await page.content()
  const $ = await cheerio.load(content)
  const item = {
    keyword: data.keyword,
    category: data.category,
    date: String($(dateSelector).text())
      .substring(0, 10)
      .replace(/\//g, '-'),
    title: filter($(titleSelector).text()),
    username: filter($(userSelector).text()),
    content: filter($(contentSelector).text()),
    click: filter($(clickSelector).text()),
    link,
    site: data.site,

    channel: data.channel,
  }
  console.log({ date: item.date, username: item.username, link: item.link })
  return item
}

const getItems = async ($, page, data, filename) => {
  await setWriteStream(filename)

  try {
    const totalPages =
      Number(
        $(totalPostCountSelector).text(),
        // .replace(/\ /g, ''),
      ) === 1
        ? Number($(totalPostCountSelector).text())
        : Number(
            $(totalPostCountSelector)
              .text()
              .split('..')[1]
              .replace(/\s+/, ''),
          )
    console.log(`totalPages: ${totalPages}`)

    let hasMetStart = false
    let doneCrawlFirstMetPage = false
    let firstMetPostIndex = 0
    let crawlEnd = false

    for (
      let currentPage = totalPages;
      currentPage >= 1 && !crawlEnd;
      currentPage--
    ) {
      console.log('------------------')
      console.log(`currentPage: ${currentPage}`)
      await page.goto(await generateURL(currentPage, data.keyword))
      const content = await page.content()
      const $$ = cheerio.load(content)

      if (!hasMetStart) {
        const postsOnPage = await getPostsInfoInListPage($$)
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
        await page.goto(await generateURL(currentPage, data.keyword))
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
            process.env.NODE_ENV === 'batch' &&
              (await requestToES(item, data._index))
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
  await haveLogin(page)

  // cheerio
  await page.goto(`${host}/service/search/?keyword=${data.keyword}`)
  const content = await page.content()
  const $ = await cheerio.load(content)
  const filename = await name(data.keyword, data.site)
  const result = await getItems($, page, data, filename)
  await browser.close()
  return result
}

module.exports = model
