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
    url = `${host}?where=post&st=date&sm=tab_opt&date_from=${startDate}&date_to=${endDate}&date_option=8&srchby=all&dup_remove=1&where=nexearch&query=${encodeURI(
      keyword,
    )}&start=${currentPage}`
  } else {
    url = `${host}?where=post&st=date&sm=tab_opt&date_from=${startDate}&date_to=${endDate}&date_option=8&srchby=all&dup_remove=1&where=nexearch&query="${encodeURI(
      keyword,
    )}"&query=${encodeURI(keyword)}&start=${currentPage}`
  }
  console.log(url)
  return url
}

const converBlogtURL = link => {
  if (link.indexOf('blog.naver.com') !== -1) {
    return link.replace('blog', 'm.blog')
  } else if (link.indexOf('blog.me') !== -1) {
    return link.replace('.blog.me', '').replace('//', '//m.blog.naver.com/')
  } else {
    return
  }
}

const getPostsInfoInListPage = async page => {
  const result = await page.evaluate(() => {
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

  // add layer function convertTipURL
  const item = result
    .map(({ date, link, index }) => {
      return {
        date,
        link: converBlogtURL(link),
        index,
      }
    })
    .filter(({ link }) => link !== undefined)
  console.log(item)
  return item
}

const removeLinkBanner = async page => {
  await page.evaluate(
    () =>
      $$('.se-oglink-summary')[0] !== undefined &&
      $$('.se-oglink-summary')[0].remove(),
  )
}

const goToPostPageAndGetInfo = async (page, data, post) => {
  await page.goto(post.link, { waitUntil: 'networkidle0', timeout: 5000 })
  await removeLinkBanner(page)

  const result = await page.evaluate(() => {
    const $$ = window.$$

    let content
    if ($$('.se-main-container')[0] !== undefined) {
      content = $$('.se-main-container')[0].innerText
    } else if ($$('.se_component_wrap')[1] !== undefined) {
      content = $$('.se_component_wrap')[1].innerText
    } else if ($$('#viewTypeSelector')[0] !== undefined) {
      content = $$('#viewTypeSelector')[0].innerText
    } else if ($$('.se_textarea')[0] !== undefined) {
      content = $$('.se_textarea')[0].innerText
    }

    return {
      title: $$('.se-title-text, .tit_h3, h3.se_textarea')[0].innerText,
      user: $$('strong.ell')[0].innerText,
      content,
    }
  })

  const item = {
    keyword: data.keyword,
    category: data.category,
    date: dateFormatter(post.date).format('YYYY-MM-DD'),
    title: filter(result.title),
    username: filter(result.user),
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
            if (post.link === undefined) break
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
