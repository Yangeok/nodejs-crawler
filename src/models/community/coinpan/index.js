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

const generateURL = async (currentPage = 1, keyword) => {
  const host = 'https://coinpan.com'
  const url = `${host}/index.php?error_return_url=2F&vid=&mid=index&act=IS&is_keyword=${keyword}&where=document&page=${currentPage}`
  console.log(url)
  return url
}

const getPostsInfoInListPage = async $ => {
  const infoInListPage = $('.elasticsearch_result')
    .toArray()
    .map((row, index) => {
      return {
        date: $(row)
          .find('.elasticsearch_author')
          .text()
          .split('|')[2]
          .replace(/\s/g, '')
          .substr(0, 10),
        link:
          'https://coinpan.com' +
          $(row)
            .find('a.document_link')
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
      '.section_wrap.section_bottom_0 > ul > li:nth-last-child(1) > a > span',
    )
      .text()
      .split(' / ')[0]
      .replace(/\./g, '-'),
    title: filter(
      $('.read_header')
        .text()
        .replace(/\ {2}/g, ''),
    ),
    username: filter(
      $('.section_wrap.section_bottom_0 > ul > li:nth-child(1) > a')
        .text()
        .slice(0, -1), // escaping empty space
    ),
    content: filter(
      $('.xe_content')
        .text()
        .split('추천')[0],
    ),
    click: filter(
      $(
        '.section_wrap.section_bottom_0 > ul > li:nth-last-child(2) > a > span',
      ).text(),
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
    $('h2 > select > option:nth-child(1)')
      .text()
      .split('(')[1]
      .split(')')[0]
      .replace(/\,/g, ''),
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
      await page.goto(await generateURL(currentPage, data.keyword))
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
          // moment(data.startDate, 'YYYY-MM-DD').isAfter(firstPostInfoOnPage.date)
          moment(data.startDate, 'YYYY-MM-DD').isAfter(postsOnPage[0].date)
        ) {
          throw new Error('no more filtered date...')
        }

        for (let i = 1; i < postsOnPage.length - 1; i++) {
          // const postInfo = await goToPostPageAndGetInfo(
          //   page,
          //   data,
          //   postsOnPage[i].link,
          // )
          // if (moment(data.endDate, 'YYYY-MM-DD').isSameOrAfter(postInfo.date)) {
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
