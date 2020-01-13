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

const generateURL = async (currentPage = 1, keyword, startDate, endDate) => {
  const host = 'http://www.inven.co.kr'
  const url = `${host}/search/webzine/article/${encodeURI(
    keyword,
  )}/${currentPage}?sort=recency&dt=s&sDate=${startDate.replace(
    /\-/g,
    '.',
  )}&eDate=${endDate.replace(/\-/g, '.')}`
  console.log(url)
  return url
}

const getPostsInfoInListPage = async $ => {
  const infoInListPage = $('li.item')
    .toArray()
    .map((row, index) => {
      return {
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

  await page.addScriptTag({ path: require.resolve('jquery') })
  const notFound = await page.evaluate(
    () => document.getElementById('err404Wrap') !== null,
  )

  // unfreezing page infinite loading
  await page.evaluate(() => window.stop())

  if (notFound) {
    return
  }
  if (!notFound) {
    const result = await page.evaluate(() => {
      const $ = window.$
      return {
        date: $('div > div.articleDate')
          .text()
          .substring(0, 10),
        title: $('.articleTitle > h1').text(),
        username: $('div.articleWriter > span')
          .text()
          .slice(1),
        content: $('#powerbbsContent').text(),
        click: $('.articleHit')
          .text()
          .replace(/\s+/g, '')
          .split('조회:')[1]
          .split('추천:')[0]
          .replace(/\ /g, ''),
      }
    })
    const item = {
      keyword: data.keyword,
      category: data.category,
      date: filter(result.date),
      title: filter(result.title),
      username: filter(result.username),
      content: filter(result.content),
      click: filter(result.click),
      link,
      site: data.site,
      channel: data.channel,
    }
    console.log({ date: item.date, username: item.username, link: item.link })
    return item
  }
}

const getPageCount = async $ => {
  const totalPostCount = Number($('.pg:nth-last-child(2)').text())
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
    await page.goto(
      await generateURL(1, data.keyword, data.startDate, data.endDate),
    )
    const content = await page.content()
    const $ = await cheerio.load(content)
    const totalPages = await getPageCount($)
    console.log(`totalPages: ${totalPages}`)

    let crawlEnd = false
    for (
      let currentPage = 1;
      currentPage <= totalPages && !crawlEnd;
      currentPage++
    ) {
      console.log(`------------------\ncurrentPage: ${currentPage}`)
      await page.goto(
        await generateURL(
          currentPage,
          data.keyword,
          data.startDate,
          data.endDate,
        ),
      )

      await page.addScriptTag({ path: require.resolve('jquery') })
      const hasNoData = await page.evaluate(() =>
        window.$('.noresult').length === 1 ? true : false,
      )
      if (hasNoData) {
        throw new Error('data not found...')
      }

      const nextPageContent = await page.content()
      const $$ = await cheerio.load(nextPageContent)

      let postsOnPage = await getPostsInfoInListPage($$)
      for (const post of postsOnPage) {
        const item = await goToPostPageAndGetInfo(page, data, post.link)
        if (item !== undefined) {
          await addRow(item, filename)
          process.env.NODE_ENV === 'batch' &&
            (await requestToES(item, data._index))
        } else {
          continue
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
