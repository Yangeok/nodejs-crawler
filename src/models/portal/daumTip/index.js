// setups
const uploadFile = require('setups/s3')
const { setWriteStream, addRow } = require('setups/resultStream')
const browserSetting = require('setups/browser')

// utils
const filter = require('utils/filter')
const sec = require('utils/sec')
const name = require('utils/name')
const dateFormatter = require('utils/datePortal')
const requestToES = require('utils/requestToElasticSearch')

const generateURL = async (currentPage = 1, keyword, startDate, endDate) => {
  const host = 'http://search.daum.net/search'
  startDate = startDate.replace('-', '').replace('-', '')
  endDate = endDate.replace('-', '').replace('-', '')

  const url = `${host}?w=knowledge&q=${encodeURI(
    keyword,
  )}&DA=PGD&period=u&lpp=10&sd=${startDate}000000&ed=${endDate}235959&sort=recency&DA=STC&page=${currentPage}`
  console.log(url)
  return url
}

const getPostsInfoInListPage = async page => {
  const result = await page.evaluate(() => {
    const $ = window.$
    return $.map($('#knowResultUL > li'), (row, index) => {
      return {
        date: $(row)
          .find('.date')
          .text()
          .replace(/\n/g, ''),
        link: $(row)
          .find('a')
          .attr('href'),
        index,
      }
    })
  })

  // add layer function convertTipURL
  const item = result.map(({ date, link, index }) => {
    return {
      date,
      link: convertTipURL(link),
      index,
    }
  })
  console.log(item)
  return item
}

const convertTipURL = link => {
  if (link.indexOf('tip.daum.net') !== -1) {
    return link.replace('tip', 'm.tip')
  } else {
    return
  }
}

const goToPostAndGetInfo = async (page, data, post) => {
  // using networkidle 0 to prevent frozen page
  await page.goto(post.link, { waitUntil: 'networkidle0', timeout: 5000 })

  const result = await page.evaluate(() => {
    return {
      title: '',
      username: document
        .querySelectorAll('.txt_append')[0]
        .innerText.replace('닉네임', '')
        .slice(0, -1),
      content: [...document.querySelectorAll('.txt_collect')]
        .map(el => el.innerText)
        .toString()
        .replace(/\n/g, '')
        .replace(/\,/g, ''),
    }
  })

  const item = {
    keyword: data.keyword,
    category: data.category,
    date: dateFormatter(post.date).format('YYYY-MM-DD'),
    title: result.title,
    username: result.username,
    content: filter(result.content),
    click: '',
    link: post.link,
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
    let currentPage = 1
    let isIterable = true

    while (isIterable) {
      await page.goto(
        await generateURL(
          currentPage,
          data.keyword,
          data.startDate,
          data.endDate,
        ),
      )

      const hasNoData = await page.evaluate(
        () => window.$('#noResult').length === 1 && true,
      )
      if (hasNoData) {
        throw new Error('no data exist...')
      }
      const EndOfNextPageButton = await page.evaluate(() =>
        window.$('.btn_page.btn_next')[0]
          ? window.$$('.btn_page.btn_next')[0].innerText.includes('다음')
            ? true
            : false
          : false,
      )

      const postsOnPage = await getPostsInfoInListPage(page)
      for (const post of postsOnPage) {
        try {
          const item = await goToPostAndGetInfo(page, data, post)
          await page.waitFor(sec(500, 750))
          await addRow(item, filename)
          process.env.NODE_ENV === 'batch' &&
            (await requestToES(item, data._index))
        } catch (err) {
          console.log(err)
        }
      }

      if (!EndOfNextPageButton) {
        isIterable = false
      } else {
        currentPage += 1
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
