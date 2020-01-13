const moment = require('moment')

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

const generateURL = async (
  currentPage = 1,
  keyword,
  startDate,
  endDate,
  _index,
) => {
  const host = 'https://search.naver.com/search.naver'
  startDate = startDate.replace('-', '').replace('-', '')
  endDate = endDate.replace('-', '').replace('-', '')

  let url
  if (_index === 'nii_raw') {
    url = `${host}?where=kin&kin_display=10&title=0&&answer=0&grade=0&choice=0&sec=0&st=date&sm=tab_pge&nso=so%3Add%2Ca%3Aall%2Cp%3Afrom${startDate}to${endDate}&where=nexearch&query=${encodeURI(
      keyword,
    )}&kin_start=${currentPage}`
  } else {
    url = `${host}?where=kin&kin_display=10&title=0&&answer=0&grade=0&choice=0&sec=0&st=date&sm=tab_pge&nso=so%3Add%2Ca%3Aall%2Cp%3Afrom${startDate}to${endDate}&where=nexearch&query="${encodeURI(
      keyword,
    )}"&query=${encodeURI(keyword)}&kin_start=${currentPage}`
  }
  console.log(url)
  return url
}

const getPostsInfoInListPage = async page => {
  const getPostsInfoInList = await page.evaluate(() => {
    const $ = window.$
    return $.map($('ul.type01 > li'), (row, index) => {
      return {
        date: $(row)
          .find('.txt_inline')
          .text()
          .replace(/\./g, '-')
          .substr(0, 10),
        link: $(row)
          .find('dt.question > a')
          .attr('href')
          .replace('kin.naver.com', 'm.kin.naver.com'),
        index,
      }
    })
  })
  console.log(getPostsInfoInList)
  return getPostsInfoInList
}

const goToPostPageAndGetInfo = async (page, data, post) => {
  await page.goto(post.link)
  await page.evaluate(() => window.stop())

  const result = await page.evaluate(() => {
    return {
      title: document
        .querySelectorAll('.heading')[0]
        .innerText.replace(/\n/g, '')
        .replace(/\,/g, '')
        .replace('[질문] ', ''),
      username: document.querySelectorAll('.info_zone > span')[0].innerText,
      content: [...document.querySelectorAll('.user_content')]
        .map(el => el.innerText)
        .toString()
        .replace(/\,/g, '')
        .replace(/\n/g, ''),
    }
  })
  const item = {
    keyword: data.keyword,
    category: data.category,
    date: moment(dateFormatter(post.date)).format('YYYY-MM-DD'),
    title: filter(result.title),
    username: filter(result.username),
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

    console.log('-----------------------------')
    console.log(`> currentPage: ${currentPage}`)

    const dates = enumeration(data.startDate, data.endDate)
    for (let date of dates) {
      console.log({ date })

      let pageQueryString = 1
      currentPage = 1
      isIterable = true

      while (isIterable) {
        await page.goto(
          await generateURL(
            pageQueryString,
            data.keyword,
            date,
            date,
            data._index,
          ),
        )
        await page.addScriptTag({ path: require.resolve('jquery') })

        const hasNoData = await page.evaluate(() =>
          window.$$('#notfound').length == 1 ? true : false,
        )
        if (hasNoData) {
          // isIterable = false
          break
        }

        let totalPosts = await page.evaluate(() =>
          Number(
            window
              .$$('.title_num')[0]
              .innerText.split(' / ')[1]
              .split('건')[0]
              .replace(/\,/g, ''),
          ),
        )
        pageQueryString = currentPage * 10 - 9
        console.log({ pageQueryString, totalPosts })
        if (pageQueryString > totalPosts || pageQueryString > 991) {
          // isIterable = false
          break
        } else if (totalPosts === NaN) {
          // isIterable = false
          break
        }

        const EndOfNextPageButton = await page.evaluate(() =>
          window.$$('a.next')[0] !== undefined ? true : false,
        )

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

        if (!EndOfNextPageButton) {
          // isIterable = false
          break
        } else {
          currentPage += 1
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
