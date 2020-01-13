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

const generateURL = async (
  currentPage = 1,
  keyword,
  startDate,
  endDate,
  _index,
) => {
  const host = 'https://search.naver.com/search.naver'
  startDate = startDate.replace('-', '.').replace('-', '.')
  endDate = endDate.replace('-', '.').replace('-', '.')

  let url
  if (_index === 'nii_raw') {
    url = `${host}?&where=news&where=nexearch&query=${encodeURI(
      keyword,
    )}&ds=${startDate}&de=${endDate}&sort=1&DA=STC&start=${currentPage * 10 -
      9}&refresh_start=0&mynews=0&pd=3&sm=tab_pge&photo=0&field=0`
  } else {
    url = `${host}?&where=news&where=nexearch&query="${encodeURI(
      keyword,
    )}"&query=${encodeURI(
      keyword,
    )}&ds=${startDate}&de=${endDate}&sort=1&DA=STC&start=${currentPage * 10 -
      9}&refresh_start=0&mynews=0&pd=3&sm=tab_pge&photo=0&field=0`
  }

  console.log(url)
  return url
}

const getPostsInfoInListPage = async page => {
  await page.waitFor(sec(1000, 2000))
  const getPostsInfoInList = await page.evaluate(() => {
    const convertNewsURL = link => {
      if (link.indexOf('sports.news.naver.com') !== -1) {
        return link.replace('sports.news', 'm.sports')
      } else if (link.indexOf('entertain.naver.com') !== -1) {
        const qs = [...new URLSearchParams(link).values()]
        const url = new URL(link)
        return `${url.origin.replace(
          'entertain',
          'n.news',
        )}/entertain/article/${qs[0]}/${qs[1]}`
      } else if (link.indexOf('news.naver.com') !== -1) {
        return link.replace('news', 'm.news').replace('main/', '')
      } else {
        return
      }
    }

    const $ = window.$
    return $.map($('ul.type01 > li'), (row, index) => {
      return {
        date: $(row)
          .find('.txt_inline')
          .text()
          .split(' ')[2],
        link: convertNewsURL(
          $(row)
            .find('a._sp_each_url')
            .attr('href'),
        ),
        naverNews: $(row)
          .find('._sp_each_url')
          .text(),
        index,
      }
    })
      .filter(el => el.naverNews === '네이버뉴스')
      .map(({ date, link, index }) => ({
        date,
        link,
        index,
      }))
  })
  console.log(getPostsInfoInList)
  return getPostsInfoInList
}

const goToPostPageAndGetInfo = async (page, data, post) => {
  await page.goto(post.link)

  const result = await page.evaluate(() => {
    return {
      date: document
        .querySelectorAll('.media_end_head_info_datestamp_time')[0]
        .innerText.replace(/\./g, '-')
        .substr(0, 10),
      username: document
        .querySelectorAll('.media_end_head_top_logo_img')[0]
        .getAttribute('alt'),
      title: document.querySelectorAll('.media_end_head_headline')[0].innerText,
      content: document
        .querySelectorAll('#contents, .main_article')[0]
        .innerText.replace(/\n/g, '')
        .replace(/\,/g, ''),
    }
  })
  const item = {
    keyword: data.keyword,
    category: data.category,
    date: dateFormatter(result.date).format('YYYY-MM-DD'),
    title: filter(result.title),
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
          data._index,
        ),
      )
      await page.addScriptTag({
        path: require.resolve('jquery'),
      })
      const hasNoData = await page.evaluate(() =>
        window.$$('#notfound').length == 1 ? true : false,
      )
      if (hasNoData) {
        // isIterable = false
        break
      }

      const EndOfNextPageButton = await page.evaluate(() =>
        window.$$('a.next')[0] !== undefined ? true : false,
      )

      const postsOnPage = await getPostsInfoInListPage(page)
      for (const post of postsOnPage) {
        try {
          const item = await goToPostPageAndGetInfo(page, data, post)

          // remove invalid date
          if (item.date === 'Invalid date') break
          await addRow(item, filename)
          process.env.NODE_ENV === 'batch' &&
            (await requestToES(item, data._index))
        } catch (err) {
          console.log(err)
        }
      }
      await page.waitFor(sec(500, 750))
      if (!EndOfNextPageButton) {
        // isIterable = false
        break
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
