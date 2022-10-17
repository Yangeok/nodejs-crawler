const moment = require('moment')
const cheerio = require('cheerio')

// setups
const uploadFile = require('setups/s3')
const { setWriteStream, addRow } = require('setups/resultStream')
const browserSetting = require('setups/browser')

// utils
const filter = require('utils/filter')
const name = require('utils/name')
const sec = require('utils/sec')
const requestToES = require('utils/requestToElasticSearch')

const generateURL = async (currentPage = 1, keyword) => {
  const host = 'https://search.dcinside.com/post'
  const url = `${host}/p/${currentPage}/q/${encodeURI(keyword)}`
  console.log(url)
  return url
}

const getPostsInfoInListPage = async $ => {
  const infoInListPage = $('.sch_result_list > li')
    .toArray()
    .map((row, index) => {
      return {
        date: $(row)
          .find('.date_time')
          .text()
          .substr(0, 10)
          .replace(/\./g, '-'),
        link: $(row)
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

  const notFound = await page.evaluate(
    () => document.getElementsByClassName('notfound_box').length !== 0,
  )
  if (notFound) {
    return
  }

  const item = {
    keyword: data.keyword,
    category: data.category,
    date: $('.fl > span.gall_date')
      .text()
      .replace(/\./g, '-')
      .substring(0, 10),
    title: filter($('h3 > span.title_subject').text()),
    username: filter($('div.fl > span.nickname > em').text()),
    content: filter(await page.evaluate(() => [...document.querySelectorAll('div.inner.clear > div.writing_view_box .write_div div')].pop().innerHTML)),
    click: filter(
      $('div.fr > span.gall_count')
        .text()
        .substring(3),
    ),
    link,
    site: data.site,
    channel: data.channel,
  }
  console.log({ date: item.date, username: item.username, link: item.link })
  return item
}

const getPageCount = async $ => {
  const totalPageSelector = '#dgn_btn_paging > :last-child'
  const isTotalPage = await $(totalPageSelector).text()
  let totalPages = 1

  switch (isTotalPage) {
    case 1:
      totalPages
      break
    case '끝':
      totalPages = await $(totalPageSelector)
        .attr('href')
        .split('/')[3]
      break
  }
  return totalPages
}

const getItems = async (data, filename) => {
  const { page, browser } = await browserSetting(data.site)
  await setWriteStream(filename)

  try {
    await page.goto(await generateURL(1, data.keyword))
    const content = await page.content()
    const $ = cheerio.load(content)
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
      await page.goto(await generateURL(currentPage, data.keyword))
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
          if (item !== undefined) {
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
