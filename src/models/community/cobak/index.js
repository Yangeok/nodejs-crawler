const moment = require('moment')

// setups
const uploadFile = require('setups/s3')
const { setWriteStream, addRow } = require('setups/resultStream')
const browserSetting = require('setups/browser')
const requestToES = require('utils/requestToElasticSearch')

// utils
const filter = require('utils/filter')
const name = require('utils/name')

const generateURL = async (currentPage = 0, keyword) => {
  const host = 'https://cobak.co.kr'
  const url = `${host}/api/v1/posts/search_post?format=json&query%5Boffset%5D=20&q=${encodeURI(
    keyword,
  )}&page=${currentPage}`
  console.log(url)
  return url
}

const getItems = async (data, filename) => {
  const { page, browser } = await browserSetting(data.site)
  await setWriteStream(filename)

  let currentPage = 0
  try {
    let isIterable = true
    while (isIterable) {
      const url = await generateURL(currentPage, data.keyword)
      await page.goto(url)
      await page.addScriptTag({
        path: require.resolve('jquery'),
      })

      const result = await page.evaluate(() =>
        JSON.parse(document.body.innerText),
      )
      if (result.list.length > 0) {
        const lists = result.list

        for (let list of lists) {
          if (
            list.topic.name !== '뉴스' &&
            result.list[0].title !== // notice
              '[Cobak 처음이세요?] 코박 이용꿀팁 모아보기'
          ) {
            let currentDate = moment.unix(list.timestamp).format('YYYY-MM-DD')

            const isSameOrAfterStartDate = moment(currentDate).isSameOrAfter(
              data.startDate,
              'YYYY-MM-DD',
            )
            const isSameOrBeforeEndDate = moment(currentDate).isSameOrBefore(
              data.endDate,
              'YYYY-MM-DD',
            )
            const isBeforeStartDate = moment(currentDate).isBefore(
              data.startDate,
              'YYYY-MM-DD',
            )

            if (isSameOrAfterStartDate && isSameOrBeforeEndDate) {
              const item = {
                keyword: data.keyword,
                category: data.category,
                date: currentDate,
                title: filter(list.title),
                username: filter(list.user.nickname),
                content: filter(
                  list.contents_highlight.replace(/\n/g, '').replace(/\,/g, ''),
                ),
                click: list.shown_count,
                link: 'https://cobak.co.kr/community/33/post/' + list.id,
                site: data.site,
                channel: data.channel,
              }

              console.log({
                date: item.date,
                username: item.username,
                link: item.link,
              })
              await addRow(item, filename)
              process.env.NODE_ENV === 'batch' &&
                (await requestToES(item, data._index))
            } else if (list.user.nickname !== '코박누나' && isBeforeStartDate) {
              isIterable = false
              throw new Error('no more filtered date...')
            }
          }
        }
      } else {
        isIterable = false
        throw new Error('no more data list')
      }
      currentPage += 1
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
