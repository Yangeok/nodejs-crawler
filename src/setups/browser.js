// const puppeteer = require('puppeteer')
const puppeteer = require('puppeteer-extra')
puppeteer.use(require('puppeteer-extra-plugin-anonymize-ua')())
puppeteer.use(require('puppeteer-extra-plugin-stealth')())
const env = process.env

const browser = async channel => {
  const options = {
    headless: env.NODE_ENV === 'development' ? false : true,
    slowMo: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
    ],
  }
  const browser = await puppeteer.launch(options)
  const page = await browser.newPage()

  // disable alert window
  await page.on('dialog', async dialog => {
    console.log(`dialog message:' ${dialog.message()}`)
    // await dialog.dismiss()
    await dialog.accept()
  })
  await page.setDefaultNavigationTimeout(0)

  switch (channel) {
    // blocking stylesheet, font
    case 'bobaedream': // image infinite loading issue
    case 'naverKin': // image infinite loading issue
      await page.setRequestInterception(true)
      await page.on('request', req =>
        ['stylesheet', 'font'].indexOf(req.resourceType()) !== -1
          ? req.abort()
          : req.continue(),
      )
      break

    // blocking font, image
    case 'twitter':
      await page.setRequestInterception(true)
      await page.on('request', req =>
        ['font', 'image'].indexOf(req.resourceType()) !== -1
          ? req.abort()
          : req.continue(),
      )
      break

    // blocking stylesheet
    case '':
      await page.setRequestInterception(true)
      await page.on('request', req =>
        ['stylesheet'].indexOf(req.resourceType()) !== -1
          ? req.abort()
          : req.continue(),
      )
      break

    // blocking stylesheet, font, image
    // community
    case 'coinpan':
    case 'cobak':
    case 'cook82':
    case 'clien':
    case 'dogdrip':
    case 'ddengle':
    case 'gasengi':
    case 'hygall':
    case 'ppomppu':
    case 'moneynet':
    case 'ruliweb':
    case 'ygosu':
    // portal
    case 'daumBlog':
    case 'daumBrunch':
    case 'daumCafe':
    case 'daumNews':
    case 'daumTistory':
    case 'daumTip':
    case 'naverBlog':
    case 'naverCafe':
    case 'naverPost':
    case 'naverNews':
      await page.setRequestInterception(true)
      await page.on('request', req => {
        if (
          ['stylesheet', 'font', 'image'].indexOf(req.resourceType()) !== -1
        ) {
          req.abort()
        } else {
          req.continue()
        }
      })
      break

    // blocking all the thing
    case 'dcinside':
    case 'ilbe':
    case 'inven':
    case 'mlbpark':
    case 'natePann':
    case 'slrclub':
      await page.setRequestInterception(true)
      await page.on('request', req =>
        ['stylesheet', 'font', 'image', 'script'].indexOf(
          req.resourceType(),
        ) !== -1
          ? req.abort()
          : req.continue(),
      )
      break
    default:
      break
  }

  return await {
    page,
    browser,
  }
}

module.exports = browser
