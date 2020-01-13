require('dotenv').config()

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

  // when index is nii_raw, disabled exact search
  let url
  if (_index === 'nii_raw') {
    url = `${host}?where=article&prdtype=0&t=0&st=date&sm=tab_pge&date_from=${startDate}&date_to=${endDate}&date_option=6&srchby=text&dup_remove=1&where=nexearch&query=${encodeURI(
      keyword,
    )}&start=${currentPage}`
  } else {
    url = `${host}?where=article&prdtype=0&t=0&st=date&sm=tab_pge&date_from=${startDate}&date_to=${endDate}&date_option=6&srchby=text&dup_remove=1&where=nexearch&query="${encodeURI(
      keyword,
    )}"&query=${encodeURI(keyword)}&start=${currentPage}`
  }
  console.log(url)
  return url
}

const getPostsInfoInListPage = async page => {
  await page.addScriptTag({
    url: 'https://code.jquery.com/jquery-3.2.1.min.js',
  })
  const item = await page.evaluate(() => {
    const $ = window.$
    return $.map($('ul.type01 > li'), (row, index) => {
      return {
        date: $(row)
          .find('.txt_inline')
          .text()
          .replace(/\./g, '-')
          .substr(0, 10),
        link: $(row)
          .find('dt > a')
          .attr('href'),
        index,
      }
    })
  })
  const result = item.map(({ date, link, index }) => {
    return {
      date,
      link: converCafetURL(link),
      index,
    }
  })
  console.log(result)
  return result
}

const converCafetURL = link => {
  if (link.indexOf('cafe.naver.com') !== -1) {
    return link.replace('cafe', 'm.cafe')
  } else {
    return
  }
}

const goToPostPageAndGetInfo = async (page, data, post) => {
  // simplifying occured error messages
  // try {
  await page.goto(post.link, { waitUntil: 'networkidle0', timeout: 5000 })
  await page.waitFor(sec(1000, 2000))

  const notFound = await page.evaluate(() =>
    // document.getElementsByClassName('error_content').length !== 0
    document.querySelectorAll('.EmptyMessageText.EmptyMessageText--main')
      .length === 2
      ? true
      : false,
  )
  if (notFound) {
    console.log('no data...')
    return
  }

  const result = await page.evaluate(() => {
    return {
      title: document.querySelectorAll('h2.tit, .product_name')[0].innerText,
      username: document.querySelectorAll(
        '.end_user_nick, ._stopDefault > span > span.nickname > span',
      )[0].innerText,
      content: [
        ...document.querySelectorAll('.NHN_Writeform_Main, #postContent'),
      ]
        .map(el => el.innerText)
        .toString()
        .replace(/\n/g, '')
        .replace(/\,/g, ''),
      click: document
        .querySelectorAll('.no.font_l > em, .no.font_l')[0]
        .innerText.replace('조회 ', ''),
    }
  })

  const item = {
    keyword: data.keyword,
    category: data.category,
    date: dateFormatter(post.date).format('YYYY-MM-DD'),
    title: result.title,
    username: result.username,
    content: result.content,
    click: result.click,
    link: post.link,
    site: data.site,
    channel: data.channel,
  }
  console.log({ date: item.date, username: item.username, link: item.link })
  return item
  // } catch (err) {
  //   console.log(`> ${err.name}: ${err.message}`)
  // }
}

const closePopupWindow = browser => {
  browser.on('targetcreated', async target => {
    const page = await target.page()
    if (page) page.close()
  })
}

const getItems = async (data, filename) => {
  const { page, browser } = await browserSetting(data.site)

  closePopupWindow(browser)
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

        const hasNoData = await page.evaluate(() =>
          window.$$('#notfound').length === 1 ? true : false,
        )
        if (hasNoData) {
          isIterable = false
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
            if (!post.link) {
              // isIterable = false
              break
            }
            // await page.goto(post.link, {
            //   waitUntil: 'networkidle0',
            //   timeout: 5000,
            // })
            // await page.keyboard.press('Enter') // alert창 제거용

            // when it needs to login
            // const hasToSignin = await page.evaluate(() =>
            //   window.$$('.btn_type2')[0] !== undefined ? true : false,
            // )
            // if (hasToSignin) {
            //   break
            // }

            const item = await goToPostPageAndGetInfo(page, data, post)
            if (item !== undefined) {
              await addRow(item, filename)
              process.env.NODE_ENV === 'batch' &&
                (await requestToES(item, data._index))
            }
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

const haveLogin = async page => {
  const env = process.env
  const naverId = env.NAVER_ID
  const naverPw = env.NAVER_PW

  await page.goto('https://nid.naver.com/nidlogin.login')
  await page.evaluate(
    (id, pw) => {
      document.querySelector('#id').value = id
      document.querySelector('#pw').value = pw
    },
    naverId,
    naverPw,
  )

  await page.click('.btn_global')
  await page.waitForNavigation()
}

const model = async data => {
  const filename = await name(data.keyword, data.site)
  return await getItems(data, filename)
}

module.exports = model
