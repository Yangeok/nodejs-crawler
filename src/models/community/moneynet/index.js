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
  const host = 'https://www.moneynet.co.kr'
  const url = `${host}/index.php?mid=main&act=IS&is_keyword=${encodeURI(
    keyword,
  )}&where=document&page=${currentPage}`
  console.log(url)
  return url
}

const getPostsInfoInListPage = async $ => {
  const infoInListPage = $('.searchResult > li')
    .toArray()
    .map((row, index) => {
      return {
        date: $(row)
          .find('.time')
          .text()
          .substr(0, 10),
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
  const content = await page.content()
  const $ = await cheerio.load(content)
  const item = {
    keyword: data.keyword,
    category: data.category,
    date: $(
      'div.section_wrap.section_bottom_0 > div.section_bottom.gray_color > ul > li:nth-last-child(1) > a > span',
    )
      .text()
      .split(' / ')[0]
      .replace(/\./g, '-'),
    title: filter($('div:nth-child(1) > div > h1 > a').text()).split(
      '	좋아요',
    )[0],
    username: filter(
      $('div.section_bottom.gray_color > ul > li:nth-child(1) > a').text(),
    ).replace(/\ /g, ''),
    content: filter($('.read_body').text()).split(' 좋아요 0 싫어요 0 신고')[0],
    click: $(
      'div.section_bottom.gray_color > ul > li:nth-last-child(2) > a > span > b',
    ).text(),
    link,
    site: data.site,
    channel: data.channel,
  }
  console.log({ date: item.date, username: item.username, link: item.link })
  return item
}

const getPageCount = async $ => {
  const totalPostCount = Number(
    $('h3.subTitle > span')
      .text()
      .replace('(', '')
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

const getItems = async (data, filename) => {
  const { page, browser } = await browserSetting(data.site)
  await setWriteStream(filename)

  try {
    await page.goto(await generateURL(1, data.keyword))
    await page.waitFor(sec(1000, 2000))
    const content = await page.content()
    const $ = await cheerio.load(content)
    const totalPages = await getPageCount($)
    console.log(`totalPages: ${totalPages}`)

    let hasMetStart = false
    let doneCrawlFirstMetPage = false
    let firstMetPostIndex = 0
    let crawlEnd = false

    if (totalPages === 0) {
      throw new Error('no results...')
    }

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

        for (let i = 1; i <= postsOnPage.length - 1; i++) {
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
