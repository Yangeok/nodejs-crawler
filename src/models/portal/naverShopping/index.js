// setups
const uploadFile = require('setups/s3')
const { setWriteStreamReviews, addRowReviews } = require('setups/resultStream')
const browserSetting = require('setups/browser')

// utils
const filter = require('utils/filter')
const sec = require('utils/sec')
const name = require('utils/name')

const generateURL = keyword => {
  const url = `https://search.shopping.naver.com/detail/detail.nhn?nv_mid=${keyword}`
  console.log(url)
  return url
}

const appendSeperator = async page => {
  await page.evaluate(() => {
    for (let seperator of document.getElementsByTagName('em')) {
      seperator.append(';')
    }
  })
}

const getResult = async (page, subject) => {
  const result = await page.evaluate(() => {
    const $ = window.$
    return $.map($('#_review_list > li'), row => {
      return {
        username: $(row)
          .find('span')
          .text()
          .split('\n')[2]
          .replace(/\ /g, ''),
        rate: $(row)
          .find('span')
          .text()
          .split('\n')[0]
          .replace('별점별점', ''),
        date:
          '20' +
          $(row)
            .find('span')
            .text()
            .split('\n')[3]
            .replace(/\ /g, '')
            .replace(/\./g, '-')
            .substring(0, 8),
        contents: $(row)
          .find('em')
          .text(),
      }
    })
  })
  const item = result.map(r => ({
    subject,
    ...r,
  }))
  // console.log(item)
  return item
}

const getSubject = async (page, i) => {
  await page.click(`#topic${i} > a`)
  const subject = await page.$eval(`#topic${i} > a`, s => s.innerText)
  return subject
}

const getItems = async (page, filename) => {
  await setWriteStreamReviews(filename)

  // 주제가 있나 없나 확인하고, 없으면 끝내기
  const hasSubjects =
    (await page.evaluate(() => window.$('#_topic_filter').length)) !== 0
      ? true
      : false
  if (hasSubjects) {
    const subjectsLength = await page.evaluate(
      () =>
        window.$(
          '#_topic_filter > .sub_list > li > a:not([data-topic-code=""])',
        ).length,
    )
    console.log(`subjectsLength: ${subjectsLength}`)

    try {
      // 주제의 총 길이를 찾는다
      for (let i = 1; i <= subjectsLength; i++) {
        // 페이지의 총 길이를 찾는다
        const subject = await getSubject(page, i)
        const paginationLength = await page.evaluate(
          () =>
            window.$(
              '#_review_paging > :not(.next_end):not(.pre):not(.pre_end)',
            ).length,
        )
        console.log(`paginationLength: ${paginationLength}`)

        for (let j = 0; j < paginationLength; j++) {
          await appendSeperator(page)
          for (let item of await getResult(page, subject)) {
            // console.log(item)
            await addRowReviews(item, filename)
          }

          // 다음페이지 클릭
          await page.evaluate(j => {
            const $ = window.$
            $(
              `#_review_paging > :not(.pre):not(.pre_end):not(.next_end):eq(${j})`,
            )
          })
          await page.waitFor(500)
        }
      }
    } catch (err) {
      console.log(err)
    }
  }
  console.log('crawl completed')
  await page.waitFor(300000)
  return await uploadFile(filename)
}

const removeBoxes = async page => {
  await page.evaluate(() => {
    const $ = window.$
    $('#header').remove()
    $('.summary_top').remove()
    $('.summary_info._itemSection').remove()
    $('#content').remove()
    $('#aside').remove()
    $('#section_spec_detail').remove()
    $('#section_price').remove()
    $('#section_spec').remove()
    $('.gpa_area').remove()
    $('#section_recommend_brand').remove()
    $('#section_recommend_withbuy').remove()
    $('#footer').remove()
  })
}
const model = async data => {
  const { page, browser } = await browserSetting(data.site)
  await page.goto(await generateURL(data.keyword))
  await removeBoxes(page)
  const filename = await name(data.keyword, data.site)
  const result = await getItems(page, filename)
  await browser.close()
  return result
}

module.exports = model
