const moment = require('moment')
const cheerio = require('cheerio')

// setups
const uploadFile = require('setups/s3')
const { setWriteStream, addRow } = require('setups/resultStream')
const browserSetting = require('setups/browser')

// utils
const filter = require('utils/filter')
const name = require('utils/name')
const requestToES = require('utils/requestToElasticSearch')

const generateURL = async (currentPage = 1, keyword, board) => {
  const host = 'https://www.ddengle.com'
  const url = `${host}/index.php?_filter=search&mid=${board}&category=&search_keyword=${keyword}&search_target=title_content&page=${currentPage}`
  console.log(url)
  return url
}

const getPostsInfoInListPage = async $ => {
  const infoInListPage = $('.bd_lst.bd_tb_lst.bd_tb > tbody > tr:not(.notice)')
    .toArray()
    .map((row, index) => {
      return {
        date: moment
          .unix(
            $(row)
              .find('.time')
              .attr('data-timestamp'),
          )
          .format('YYYY-MM-DD'),
        link: $(row)
          .find('a:not(.replyNum)')
          .attr('href'),
        index,
      }
    })
  console.log(infoInListPage)
  return infoInListPage
}

const goToPostPageAndGetInfo = async (page, data, link) => {
  await page.goto(link)
  await page.waitForSelector('#zema9_body')
  const content = await page.content()
  const $ = await cheerio.load(content)
  const item = {
    keyword: data.keyword,
    category: data.category,
    date: $('.date.m_no')
      .text()
      .substring(0, 10),
    title: filter($('.top_area.ngeb > h2 > a').text()),
    username: filter(
      $('.contry_nation')
        .text()
        .slice(0, -1),
    ),
    content: filter($('#zema9_body').text()),
    click: filter($('.side.fr > span:nth-child(1)').text()),
    link,
    site: data.site,
    channel: data.channel,
  }
  return item
}

const getPageCount = async $ => {
  const totalPostCount = Number(
    $('tbody > tr:not(.notice) > td.no')
      .text()
      .split(/\n/g)[1]
      .replace(/\ /g, ''),
  )
  const pageSize = 20

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
    const boards = ['ann', 'board_all']
    await page.goto(await generateURL(1, data.keyword, boards[0]))
    const content = await page.content()
    const $ = await cheerio.load(content)

    for (let board of boards) {
      console.log({ board })
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
        await page.goto(await generateURL(currentPage, data.keyword, board))
        const content = await page.content()
        const $$ = cheerio.load(content)

        if (!hasMetStart) {
          const postsOnPage = await getPostsInfoInListPage($$)
          if (moment(data.startDate).isSameOrAfter(postsOnPage[0].date)) {
            break
          }

          for (let i = 1; i < postsOnPage.length - 1; i++) {
            if (moment(data.endDate).isSameOrAfter(postsOnPage[i].date)) {
              hasMetStart = true
              firstMetPostIndex = i
              break
            }
          }
        }

        if (hasMetStart) {
          await page.goto(await generateURL(currentPage, data.keyword, board))
          const nextPageContent = await page.content()
          const $$$ = await cheerio.load(nextPageContent)

          let postsOnPage = await getPostsInfoInListPage($$$)

          if (!doneCrawlFirstMetPage) {
            postsOnPage = postsOnPage.slice(firstMetPostIndex - 1)
            doneCrawlFirstMetPage = true
          }

          for (const post of postsOnPage) {
            const item = await goToPostPageAndGetInfo(page, data, post.link)
            console.log({
              date: item.date,
              username: item.username,
              link: item.link,
            })
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
