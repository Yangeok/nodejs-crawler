const fs = require('fs')
const moment = require('moment')
const puppeteer = require('puppeteer')
const cheerio = require('cheerio')
const filter = require('../../../../../utils/filter')
const sleep = require('../../../../../utils/sleep')
const {
  totalPostCountSelector,
  infoInListPageSelector,
  linkSelector,
  dateSelector,
  titleSelector,
  userSelector,
  contentSelector,
  clickSelector,
} = require('./selectors')

const width = 400,
  height = 900
const options = {
  headless: false,
  slowMo: true,
  args: [
    `--window-size=${width},${height}`,
    '--no-sandbox',
    '--disable-setuid-sandbox',
  ],
}
const iPhone = puppeteer.devices['iPhone 6']

module.exports = class Service {
  constructor(keyword, startDate, endDate, output = 'humoruniv.txt') {
    this.keyword = keyword
    this.startDate = startDate
    this.endDate = endDate
    this.output = `./outputs/${moment().format('YYYY-MM-DD')}_${
      this.keyword
    }_${output}`
    this.host = 'http://web.humoruniv.com'
    this.fields = ['date', 'title', 'user', 'content', 'click', 'link']
    this.logs = fs.createWriteStream(this.output)
    this.logs.write(`${this.fields.join(',')}\n`)
    this.init()
  }

  async init() {
    const browser = await puppeteer.launch(options)
    const page = await browser.newPage()
    await page.setViewport({ width, height })
    // await page.emulate(iPhone);
    await page.setRequestInterception(true)
    await page.on('request', req => {
      if (
        req.resourceType() == 'stylesheet' ||
        req.resourceType() == 'font' ||
        req.resourceType() == 'image'
      ) {
        req.abort()
      } else {
        req.continue()
      }
    })
    await page.goto(await this.generateURL())
    await page.type('input.input_text', this.keyword)
    await Promise.all([
      page.click('table > tbody > tr > td:last-child > a'),
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
    ])
    await page.setJavaScriptEnabled(false)
    const content = await page.content()
    const $ = await cheerio.load(content)
    this.getItems($, page)
  }

  async getItems($, page) {
    try {
      const totalPages = Number(
        $(totalPostCountSelector)
          .text()
          .split(' 개 / ')[1]
          .replace(/\ /g, '')
          .replace(/\,/g, '')
          .replace('Page', ''),
      )
      // console.log(totalPages);

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
        // await page.goto(await this.generateURL(currentPage));
        // await page.type('input.input_text', this.keyword);
        // await Promise.all([
        //   page.click('table > tbody > tr > td:last-child > a'),
        //   page.waitForNavigation({ waitUntil: 'networkidle0' })
        // ]);
        const content = await page.content()
        const $$ = cheerio.load(content)

        console.log(`hasMetStart: ${hasMetStart}`)
        if (!hasMetStart) {
          const postsOnPage = await this.getPostsInfoInListPage($$)
          // console.log(postsOnPage[0].link);
          const firstPostInfoOnPage = await this.goToPostPageAndGetInfo(
            page,
            postsOnPage[0].link,
          )
          // console.log(firstPostInfoOnPage);
          if (
            moment(this.startDate, 'YYYY-MM-DD').isAfter(
              firstPostInfoOnPage.date,
            )
          ) {
            break
          }
          for (let i = 1; i < postsOnPage.length - 1; i++) {
            const postInfo = await this.goToPostPageAndGetInfo(
              page,
              postsOnPage[i].link,
            )
            if (moment(this.endDate, 'YYYY-MM-DD').isAfter(postInfo.date)) {
              hasMetStart = true
              firstMetPostIndex = i
              break
            }
          }
        }

        if (hasMetStart) {
          await page.goto(await this.generateURL(currentPage))
          const nextPageContent = await page.content()
          const $$$ = await cheerio.load(nextPageContent)

          let postsOnPage = await this.getPostsInfoInListPage($$$)

          if (!doneCrawlFirstMetPage) {
            postsOnPage = postsOnPage.slice(firstMetPostIndex - 1)
            doneCrawlFirstMetPage = true
          }

          for (const post of postsOnPage) {
            const item = await this.goToPostPageAndGetInfo(page, post.link)
            if (!moment(this.startDate).isAfter(item.date)) {
              await this.logs.write(
                `${item.date},${item.title},${item.user},${item.content},${item.click},${item.link}\n`,
              )
            } else {
              crawlEnd = true
              break
            }
          }
        }
      }
    } catch (err) {
      throw err
    } finally {
      console.log('------------------')
      console.log('Crawling completed')
      // await page.close();
      // process.exit();
    }
  }

  async generateURL(currentPage = 1) {
    const url = `${this.host}/search/search.html?section=humoruniv&search_text=&board=&search_type=&order=uptime&page=${currentPage}`
    // console.log(url);
    return url
  }

  async getPostsInfoInListPage($) {
    const infoInListPage = $(infoInListPageSelector)
      .toArray()
      .map((row, index) => {
        return {
          link: $(row)
            .find('a[style="text-decoration: underline;"]')
            .attr('href'),
          index,
        }
      })
    // console.log(infoInListPage);
    return infoInListPage
  }

  async goToPostPageAndGetInfo(page, link) {
    await page.goto(link)
    const content = await page.content()
    const $ = await cheerio.load(content)
    const item = {
      date: $(dateSelector)
        .text()
        .replace(' ', '')
        .substring(0, 10),
      title: filter($(titleSelector).text()),
      user: filter(
        $(userSelector)
          .text()
          .split(' ')[0],
      ),
      content: filter($(contentSelector).text()),
      click: filter(
        $(clickSelector)
          .text()
          .split('조회수 ')[1]
          .split('작성시간')[0],
      ),
      link,
    }
    // console.log(item);
    return item
  }

  async getPageCount(totalPosts, pageSize) {
    if (totalPosts === NaN) {
      throw new Error('total post count: NAN')
    }
    if (totalPosts % pageSize === 0) {
      return Math.floor(totalPosts / pageSize)
    } else {
      return Math.floor(totalPosts / pageSize) + 1
    }
  }
}
