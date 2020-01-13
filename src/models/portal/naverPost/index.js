// setups
const uploadFile = require('setups/s3')
const { setWriteStream, addRow } = require('setups/resultStream')
const browserSetting = require('setups/browser')

// utils
const filter = require('utils/filter')
const sec = require('utils/sec')
const name = require('utils/name')
const enumeration = require('utils/enumeration')
const dateFormatter = require('utils/datePortal')
const requestToES = require('utils/requestToElasticSearch')

const generateURL = (keyword, startDate, endDate) => {
  const host = 'https://m.post.naver.com/search/post.nhn'
  startDate = startDate.replace('-', '').replace('-', '')
  endDate = endDate.replace('-', '').replace('-', '')

  const url = `${host}?keyword=${encodeURI(
    keyword,
  )}&sortType=createDate.dsc&range=${startDate}000000:${endDate}235959&term=custom&navigationType=current`
  console.log(url)
  return url
}

const getPostsInfoInListPage = async (page, link) => {
  const getPostsInfoInList = await page.evaluate(() => {
    const $ = window.$
    return $.map($('ul.lst_feed > li'), (row, index) => {
      return {
        date: $(row)
          .find('.date_post')
          .text()
          .trim(),
        user: $(row)
          .find('.name')
          .text(),
        click: $(row)
          .find('.view_post')
          .text()
          .split(' ')[0],
        link:
          'https://m.post.naver.com' +
          $(row)
            .find('a.link_end')
            .attr('href'),
        index,
      }
    })
  })
  console.log(
    getPostsInfoInList.map(({ date, link, index }) => ({
      date,
      link,
      index,
    })),
  )
  return getPostsInfoInList
}

const goToPostPageAndGetInfo = async (page, data, post) => {
  await page.goto(post.link, {
    waitUntil: 'load',
    timeout: 0,
  })
  await page.waitFor(sec(1000, 2000))
  const result = await page.evaluate(() => {
    const $ = window.$
    return {
      title: $('h3.se_textarea').text(),
      content: $('.__se_component_area').text(),
    }
  })
  const item = {
    keyword: data.keyword,
    category: data.category,
    date: dateFormatter(post.date).format('YYYY-MM-DD'),
    title: filter(result.title),
    username: filter(post.user).replace(/\ /g, ''),
    content: filter(result.content),
    click: filter(post.click),
    link: post.link,
    site: data.site,

    channel: data.channel,
  }
  console.log({ date: item.date, username: item.username, link: item.link })
  return item
}

const pageDown = async page => {
  let isScrollable = await page.evaluate(
    () => window.$('#more_btn').css('display') !== 'none',
  )
  while (isScrollable) {
    let previousHeight = await page.evaluate('document.body.scrollHeight')
    console.log('go to next scroll...')
    await page.evaluate(() => window.$('#more_btn > button').click())
    await page.waitForFunction(
      `document.body.scrollHeight > ${previousHeight}`,
      {
        timeout: 5000,
      },
    )
    await page.waitFor(sec(500, 750))
    isScrollable = await page.evaluate(
      () => window.$('#more_btn').css('display') !== 'none',
    )
  }
}

const getItems = async (data, filename) => {
  const { page, browser } = await browserSetting(data.site)
  await setWriteStream(filename)

  try {
    const dates = enumeration(data.startDate, data.endDate)
    for (let date of dates) {
      console.log({ date })

      await page.goto(await generateURL(data.keyword, date, date))
      await page.addScriptTag({
        url: 'https://code.jquery.com/jquery-3.2.1.min.js',
      })

      const hasNoData = await page.evaluate(
        () => window.$('.lst_search_all_w.no_result').length === 1 && true,
      )
      if (!hasNoData) {
        await pageDown(page)
        const postsOnPage = await getPostsInfoInListPage(page)
        for (const post of postsOnPage) {
          try {
            await page.waitFor(sec(500, 750))
            const item = await goToPostPageAndGetInfo(page, data, post)
            await addRow(item, filename)
            process.env.NODE_ENV === 'batch' &&
              (await requestToES(item, data._index))
          } catch (err) {
            console.log(err)
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
