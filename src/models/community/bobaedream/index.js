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
  const host = 'https://www.bobaedream.co.kr'
  const url = `${host}/list?code=freeb&s_cate=&maker_no=&model_no=&or_gu=1000&or_se=desc&s_selday=&pagescale=10&info3=&noticeShow=&s_select=Body&level_no=&vdate=&type=list&page=${currentPage}&s_key=${encodeURI(
    keyword,
  )}`
  console.log(url)
  return url
}

const getPostsInfoInListPage = async $ => {
  const infoInListPage = $('.pl14')
    .toArray()
    .map((row, index) => {
      return {
        link:
          'http://www.bobaedream.co.kr' +
          $(row)
            .find('a.bsubject')
            .attr('href'),
        index,
      }
    })
  console.log(infoInListPage)
  return infoInListPage
}

const goToPostPageAndGetInfo = async (page, data, link) => {
  try {
    await page.goto(link)
    await page.waitForSelector('.countGroup')

    const { date, title, username, content, click } = await page.evaluate(
      () => {
        return {
          date: document
            .querySelectorAll('.countGroup')[0]
            .innerText.split('|')[2]
            .substring(1, 11)
            .replace(/\./g, '-'),
          title: document
            .querySelectorAll('div.writerProfile > dl > dt > strong')[0]
            .innerText.split('[')[0],
          username: document.querySelectorAll(' span.proCont > a.nickName')[0]
            .innerText,
          content: document
            .querySelectorAll('div.content02 > div.bodyCont')[0]
            .innerText.replace(/\n/g, '')
            .replace(/\,/g, ''),
          click: document
            .querySelectorAll('.countGroup')[0]
            .innerText.split('|')[0]
            .replace('조회 ', '')
            .replace(' ', ''),
        }
      },
    )

    const item = {
      keyword: data.keyword,
      category: data.category,
      date: date,
      title: filter(title),
      username: filter(username),
      content: filter(content),
      click,
      link,
      site: data.site,
      channel: data.channel,
    }
    console.log({ date: item.date, username: item.username, link: item.link })
    return item
  } catch (err) {
    console.log(`> ${err.name}: ${err.message}`)
  }
}

const getPageCount = async page => {
  const totalPostCount = await page.evaluate(() => {
    const $ = window.$
    const notfound =
      $('tr:not(.best)')[1]
        .children[0].innerText.replace(/\n/g, '')
        .indexOf('검색된 자료가 없습니다.전체 리스트') === -1
    if (notfound) {
      return $('tr:not(.best)')[1].children[0].innerText
    }
  })
  const pageSize = 10

  if (totalPostCount === undefined) {
    throw new Error('total post count is undefined...')
  }

  if (totalPostCount !== NaN && totalPostCount % pageSize === 0) {
    return Math.floor(totalPostCount / pageSize)
  } else if (totalPostCount !== NaN && totalPostCount % pageSize !== 0) {
    return Math.floor(totalPostCount / pageSize) + 1
  }
}

const getItems = async (data, filename) => {
  const { page, browser } = await browserSetting(data.site)
  await setWriteStream(filename)

  try {
    await page.goto(await generateURL(1, data.keyword))
    const totalPages = await getPageCount(page)
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
        const firstPostInfoOnPage = await goToPostPageAndGetInfo(
          page,
          data,
          postsOnPage[0].link,
        )

        if (
          moment(data.startDate, 'YYYY-MM-DD').isAfter(firstPostInfoOnPage.date)
        ) {
          throw new Error('no more filtered date...')
        }

        for (let i = 1; i <= postsOnPage.length - 1; i++) {
          const postInfo = await goToPostPageAndGetInfo(
            page,
            data,
            postsOnPage[i].link,
          )
          if (moment(data.endDate).isSameOrAfter(postInfo.date)) {
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
    console.log(`> ${err.name}: ${err.message}`)
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
