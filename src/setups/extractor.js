const models = require('../models')

const extractor = async data => {
  let targetChannel
  switch (data.site) {
    // Community
    case 'bobaedream':
      targetChannel = async keyword => await models.bobaedream(data, keyword)
      break
    case 'clien':
      targetChannel = async keyword => await models.clien(data, keyword)
      break
    case 'cobak':
      targetChannel = async keyword => await models.cobak(data, keyword)
      break
    case 'coinpan':
      targetChannel = async keyword => await models.coinpan(data, keyword)
      break
    case 'cook82':
      targetChannel = async keyword => await models.cook82(data, keyword)
      break
    case 'dcinside':
      targetChannel = async keyword => await models.dcinside(data, keyword)
      break
    case 'ddengle':
      targetChannel = async keyword => await models.ddengle(data, keyword)
      break
    case 'dogdrip':
      targetChannel = async keyword => await models.dogdrip(data, keyword)
      break
    case 'gasengi':
      targetChannel = async keyword => await models.gasengi(data, keyword)
      break
    case 'hygall':
      targetChannel = async keyword => await models.hygall(data, keyword)
      break
    case 'ilbe':
      targetChannel = async keyword => await models.ilbe(data, keyword)
      break
    case 'inven':
      targetChannel = async keyword => await models.inven(data, keyword)
      break
    case 'moneynet':
      targetChannel = async keyword => await models.moneynet(data, keyword)
      break
    case 'mlbpark':
      targetChannel = async keyword => await models.mlbpark(data, keyword)
      break
    case 'natePann':
      targetChannel = async keyword => await models.natePann(data, keyword)
      break
    case 'ppomppu':
      targetChannel = async keyword => await models.ppomppu(data, keyword)
      break
    case 'ruliweb':
      targetChannel = async keyword => await models.ruliweb(data, keyword)
      break
    case 'ygosu':
      targetChannel = async keyword => await models.ygosu(data, keyword)
      break

    // Portal
    case 'daumBlog':
      targetChannel = async keyword => await models.daumBlog(data, keyword)
      break
    case 'daumBrunch':
      targetChannel = async keyword => await models.daumBrunch(data, keyword)
      break
    case 'daumCafe':
      targetChannel = async keyword => await models.daumCafe(data, keyword)
      break
    case 'daumNews':
      targetChannel = async keyword => await models.daumNews(data, keyword)
      break
    case 'daumTip':
      targetChannel = async keyword => await models.daumTip(data, keyword)
      break
    case 'daumTistory':
      targetChannel = async keyword => await models.daumTistory(data, keyword)
      break
    case 'naverBlog':
      targetChannel = async keyword => await models.naverBlog(data, keyword)
      break
    case 'naverCafe':
      targetChannel = async keyword => await models.naverCafe(data, keyword)
      break
    case 'naverKin':
      targetChannel = async keyword => await models.naverKin(data, keyword)
      break
    case 'naverNews':
      targetChannel = async keyword => await models.naverNews(data, keyword)
      break
    case 'naverPost':
      targetChannel = async keyword => await models.naverPost(data, keyword)
      break

    // SNS
    case 'instagram':
      targetChannel = async keyword => await models.instagram(data, keyword)
      break
    case 'twitter':
      targetChannel = async keyword => await models.twitter(data, keyword)
      break
    default:
      targetChannel = () => null
      break
  }

  if (targetChannel === null) {
    console.log(`no such target channel: ${data.channel}`)
  }
  try {
    return await targetChannel(data)
  } catch (err) {
    console.log(`> ${err.name}: ${err.message}`)
  }
}

module.exports = extractor
