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
  const host = 'https://www.clien.net'
  const url = `${host}/service/search?q=${keyword}&sort=recency&p=${currentPage -
    1}&boardCd=&isBoard=false`
  console.log(url)
  return url
}

const getPostsInfoInListPage = async page => {
  const infoInListPage = await page.evaluate(() =>
    [...document.querySelectorAll('.list_item.symph_row')].map((row, index) => {
      return {
        date: row.querySelector('.timestamp').innerText.substr(0, 10),
        link:
          'https://clien.net' +
          row.querySelector('a.subject_fixed').getAttribute('href'),
        index,
      }
    }),
  )
  console.log(infoInListPage)
  return infoInListPage
}

const goToPostPageAndGetInfo = async (page, data, link) => {
  try {
    await page.goto(link)
    await page.waitForSelector('.post_author > span:nth-child(1)')

    const result = await page.evaluate(() => {
      return {
        date: document
          .querySelectorAll('.post_author > span:nth-child(1)')[0]
          .innerText.replace(/\s/g, '')
          .substring(0, 10),
        title: document.querySelectorAll('h3 > span')[0].innerText,
        username: document
          .querySelectorAll('div.post_info > div.post_contact > span > span')[0]
          .innerText.replace(/\s/g, ''),
        content: document
          .querySelectorAll('.post_article.fr-view')[0]
          .innerText.replace(/\n/g, '')
          .replace(/\,/g, ''),
        click: document
          .querySelectorAll('.view_count > strong')[0]
          .innerText.replace(/\,/g, ''),
      }
    })

    const item = {
      keyword: data.keyword,
      category: data.category,
      date: result.date,
      title: filter(result.title),
      username: filter(result.username),
      content: filter(result.content),
      click: result.click,
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

const getItems = async (data, filename) => {
  const { page, browser } = await browserSetting(data.site)
  await setWriteStream(filename)

  try {
    // there is no total page element, maxiaml page num is 50
    const totalPages = Number(50)
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
      await page.waitFor(sec(1000, 2000))

      await page.addScriptTag({ path: require.resolve('jquery') })
      const hasNoData = await page.evaluate(() =>
        document.querySelectorAll('.list_empty.search').length === 1
          ? true
          : false,
      )
      if (hasNoData) {
        throw new Error('data not found...')
      }

      if (!hasMetStart) {
        const postsOnPage = await getPostsInfoInListPage(page)
        if (postsOnPage !== []) {
          if (
            moment(data.startDate, 'YYYY-MM-DD').isAfter(postsOnPage[0].date)
          ) {
            throw new Error('no more filtered date...')
          }

          for (let i = 1; i < postsOnPage.length - 1; i++) {
            if (
              moment(data.endDate, 'YYYY-MM-DD').isSameOrAfter(
                postsOnPage[i].date,
                'YYYY-MM-DD',
              )
            ) {
              hasMetStart = true
              firstMetPostIndex = i
              break
            }
          }
        }
      }

      if (hasMetStart) {
        await page.goto(await generateURL(currentPage, data.keyword))
        await page.waitFor(sec(1000, 2000))
        let postsOnPage = await getPostsInfoInListPage(page)

        // to prevent err cannot read property 'link'
        if (postsOnPage !== []) {
          if (!doneCrawlFirstMetPage) {
            postsOnPage = postsOnPage.slice(firstMetPostIndex - 1)
            doneCrawlFirstMetPage = true
          }

          for (const post of postsOnPage) {
            const item = await goToPostPageAndGetInfo(page, data, post.link)
            if (
              !moment(data.startDate, 'YYYY-MM-DD').isAfter(
                item.date,
                'YYYY-MM-DD',
              )
            ) {
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
