const filter = text =>
  text
    .replace(/\n/g, '')
    .replace(/\,/g, '')
    .replace(/\s+/g, ' ')
    .replace(/⠀+/g, ' ')
    .replace(/,/g, ' ')
    .replace(/,/gi, '')
    .replace(/,/g, '')
    .replace(/@+/g, '')
    .replace(/(<([^>]+)>)/gi, '')
    .replace('(adsbygoogle = window.adsbygoogle || []).push({});', '') // remove adsense script

module.exports = filter
