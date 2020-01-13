const moment = require('moment')
const cheerio = require('cheerio')

// setups
const uploadFile = require('setups/s3')
const { setWriteStream, addRow } = require('setups/resultStream')
const browserSetting = require('setups/browser')

// utils
const filter = require('utils/filter')
const time = require('utils/time')
const name = require('utils/name')
const requestToES = require('utils/requestToElasticSearch')

const generateURL = async (currentPage = 1, keyword) => {
  const host = 'https://bbs.ruliweb.com'
  const url = `${host}/community/board/300579?search_type=subject_content&search_key=${keyword}&page=${currentPage}`
  console.log(url)
  return url
}

const getPostsInfoInListPage = async $ => {
  const infoInListPage = $('tr.table_body:not(.notice)')
    .toArray()
    .map((row, index) => {
      return {
        date: $(row)
          .find('.time')
          .text()
          .includes(':')
          ? new Date()
          : $(row)
              .find('.time')
              .text()
              .replace(/\s/g, '')
              .replace(/\./g, '-'),
        link: $(row)
          .find('a.deco')
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
    date: time(
      $('span.regdate')
        .text()
        .substring(0, 10)
        .replace(/\./g, '-'),
    ),
    title: filter($('.subject_text').text()),
    username: filter(
      $('.nick')
        .text()
        .substring(0, 8),
    ),
    content: filter($('.view_content').text()),
    click: filter(
      $('div.col.user_info_wrapper > div > p:nth-child(5)')
        .text()
        .split('조회 ')[1],
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
    $('div.row > span > span')
      .text()
      .replace(/\ /g, '')
      .replace(/\s/g, ''),
  )
  const pageSize = 28

  if (totalPostCount === NaN) {
    throw new Error('total post count: NAN')
  }
  if (totalPostCount % pageSize === 0) {
    return Math.floor(totalPostCount / pageSize)
  } else {
    return Math.floor(totalPostCount / pageSize) + 1
  }
}

const getItems = async (data, filename) => {
  const { page, browser } = await browserSetting(data.site)
  await setWriteStream(filename)

  try {
    await page.goto(await generateURL(1, data.keyword))
    const content = await page.content()
    const $ = await cheerio.load(content)
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
      console.log(`------------------\ncurrentPage: ${currentPage}`)

      const content = await page.content()
      const $$ = cheerio.load(content)

      if (!hasMetStart) {
        const postsOnPage = await getPostsInfoInListPage($$)
        if (moment(data.startDate, 'YYYY-MM-DD').isAfter(postsOnPage[0].date)) {
          break
        }
        for (let i = 1; i < postsOnPage.length - 1; i++) {
          if (
            moment(data.endDate, 'YYYY-MM-DD').isSameOrAfter(
              postsOnPage[i].date,
            )
          ) {
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
    await browser.close()
    return await uploadFile(filename)
  }
}

const model = async data => {
  const filename = await name(data.keyword, data.site)
  return await getItems(data, filename)
}

module.exports = model
