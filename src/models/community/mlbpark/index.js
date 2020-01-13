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
const requestToES = require('utils/requestToElasticSearch')

const generateURL = async (currentPage = 1, keyword) => {
  const host = 'http://mlbpark.donga.com'
  const url = `${host}/mp/b.php?p=${(currentPage - 1) * 30 +
    1}&m=search&b=bullpen&query=${keyword}&select=sct&user=`
  console.log(url)
  return url
}

const getPostsInfoInListPage = async $ => {
  const infoInListPage = $('div.tbl_box > table > tbody > tr')
    .toArray()
    .map((row, index) => {
      return {
        date: $(row)
          .find('.date')
          .text()
          .includes(':')
          ? moment().format('YYYY-MM-DD')
          : $(row)
              .find('.date')
              .text(),
        link: $(row)
          .find('a.bullpenbox')
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
    date: $('div.text3 > span.val')
      .text()
      .substring(0, 10),
    title: filter($('div.left_cont > div.titles').text()),
    username: filter($('div.text1 > span').text()),
    content: filter($('.ar_txt').text()),
    click: $('div.text2 > span:nth-child(4)')
      .text()
      .replace(/\,/g, ''),
    link,
    site: data.site,
    channel: data.channel,
  }
  console.log({ date: item.date, username: item.username, link: item.link })
  return item
}

const getItems = async (data, filename) => {
  const { page, browser } = await browserSetting(data.site)
  await setWriteStream(filename)

  try {
    // there is no total page element, maxiaml page num is 50
    const totalPages = 50
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

      console.log(`hasMetStart: ${hasMetStart}`)
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
        await page.waitFor(sec(500, 1200))
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
