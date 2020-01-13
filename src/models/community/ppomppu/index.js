const moment = require('moment')

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
  const host = 'http://m.ppomppu.co.kr'
  const url = `${host}/new/search_result.php?search_type=sub_memo&page_no=${currentPage}&keyword=${encodeURI(
    keyword,
  )}&page_size=20&bbs_id=&order_type=date&bbs_cate=2`
  console.log(url)
  return url
}

const getPostsInfoInListPage = async page => {
  const infoInListPage = await page.evaluate(() =>
    window
      .$('.bbsList > li')
      .toArray()
      .map((row, index) => {
        return {
          date:
            '20' +
            $(row)
              .find('.hi')
              .text()
              .split('| ')[1]
              .substr(0, 8),
          link:
            'http://m.ppomppu.co.kr' +
            $(row)
              .find('a.noeffect')
              .attr('href'),
          index,
        }
      }),
  )
  console.log(infoInListPage)
  return infoInListPage
}

const goToPostPageAndGetInfo = async (page, data, link) => {
  await page.goto(link)
  await page.waitFor(sec(1000, 2000))

  const hasNoData = await page.evaluate(() =>
    window.$('.error2').length === 1 ? true : false,
  )

  if (!hasNoData) {
    const result = await page.evaluate(() => {
      const $ = window.$
      return {
        date: $('h4 > div > span.hi')
          .text()
          .replace(/[^0-9-]/g, '')
          .substring(0, 10),
        title: $('div > h4')
          .text()
          .split('|')[0]
          .split('\n')[1],
        username: $('.info > .ct')
          .text()
          .split(' | ')[0],
        content: $('div.cont').text(),
        click: $('div.info')
          .text()
          .split(' / ')[0]
          .split('조회 : ')[1],
      }
    })

    const item = {
      keyword: data.keyword,
      category: data.category,
      date: result.date,
      title: filter(result.title),
      username: result.username,
      content: filter(result.content),
      click: result.click,
      link,
      site: data.site,
      channel: data.channel,
    }
    console.log({ date: item.date, username: item.username, link: item.link })
    return item
  }
}

const getPageCount = async page => {
  const totalPostCount = await page.evaluate(() =>
    Number(
      window
        .$('#result-tab2 > h3')
        .text()
        .replace(/\ /g, '')
        .replace(/\n/g, '')
        .replace(/\,/g, '')
        .split('[')[1]
        .split('건')[0],
    ),
  )
  const pageSize = 25

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
    await page.addScriptTag({
      url: 'https://code.jquery.com/jquery-3.2.1.min.js',
    })
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

      console.log(`hasMetStart: ${hasMetStart}`)
      if (!hasMetStart) {
        const postsOnPage = await getPostsInfoInListPage(page)
        // const firstPostInfoOnPage = await goToPostPageAndGetInfo(
        //   page,
        //   data,
        //   postsOnPage[0].link,
        // )

        // // 회원가입해야 보이는 게시물로 data가 undefined가 발생하면 반복문을 중단
        // if (firstPostInfoOnPage === undefined) {
        //   break
        // }

        if (
          // moment(data.startDate, 'YYYY-MM-DD').isAfter(firstPostInfoOnPage.date)
          moment(data.startDate, 'YYYY-MM-DD').isAfter(postsOnPage[0].date)
        ) {
          break
        }

        for (let i = 1; i < postsOnPage.length - 1; i++) {
          // const postInfo = await goToPostPageAndGetInfo(
          //   page,
          //   data,
          //   postsOnPage[i].link,
          // )

          // 회원가입해야 보이는 게시물로 data가 undefined가 발생하면 반복문을 중단
          // if (postInfo === undefined) {
          //   break
          // }

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
        let postsOnPage = await getPostsInfoInListPage(page)
        if (!doneCrawlFirstMetPage) {
          postsOnPage = postsOnPage.slice(firstMetPostIndex - 1)
          doneCrawlFirstMetPage = true
        }

        for (const post of postsOnPage) {
          const item = await goToPostPageAndGetInfo(page, data, post.link)

          // needs to sign up to be shown data
          if (item === undefined) {
            break
          }

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
