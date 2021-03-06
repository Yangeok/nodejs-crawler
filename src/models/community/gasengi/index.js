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
  const host = 'http://www.gasengi.com/m'
  const url = `${host}/bbs/board.php?bo_table=${board}&sca=&sfl=wr_subject%7C%7Cwr_content&sop=and&sop=or&stx=${encodeURI(
    keyword,
  )}&page=${currentPage}`
  console.log(url)
  return url
}

const getPostsInfoInListPage = async $ => {
  const infoInListPage = $('li.bg_')
    .toArray()
    .map((row, index) => {
      return {
        date: $(row)
          .find('.wr_date')
          .text(),
        link:
          'http://www.gasengi.com' +
          $(row)
            .find('a.subject')
            .attr('href')
            .substring(5),
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
    date:
      '20' +
      $('.wr_info > time')
        .text()
        .split('작성일 : ')[1]
        .substring(0, 8),
    title: filter($('.vi_title > h1').text()),
    username: filter($('.wr_info > span > a > span').text()),
    content: filter($('div.article').text()),
    click: filter(
      $('.wr_info > span:nth-child(3)')
        .text()
        .split('조회 : ')[1]
        .replace(',', ''),
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
    $('.board_top > div > span')
      .text()
      .split('Total ')[1],
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
    const boards = ['commu', 'commu06', 'economy', 'politics_bbs']
    for (let board of boards) {
      console.log({ board })
      await page.goto(await generateURL(1, data.keyword, board))
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
        console.log('------------------')
        console.log(`currentPage: ${currentPage}`)
        await page.goto(await generateURL(currentPage, data.keyword, board))
        const content = await page.content()
        const $$ = cheerio.load(content)

        if (!hasMetStart) {
          const postsOnPage = await getPostsInfoInListPage($$)
          // const firstPostInfoOnPage = await goToPostPageAndGetInfo(
          //   page,
          //   data,
          //   postsOnPage[0].link,
          // )

          if (
            moment(data.startDate, 'YYYY-MM-DD').isAfter(
              // firstPostInfoOnPage.date,
              postsOnPage[0].date,
            )
          ) {
            break
          }
          for (let i = 1; i < postsOnPage.length - 1; i++) {
            // const postInfo = await goToPostPageAndGetInfo(
            //   page,
            //   data,
            //   postsOnPage[i].link,
            // )
            if (
              // moment(data.endDate, 'YYYY-MM-DD').isSameOrAfter(postInfo.date)
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
