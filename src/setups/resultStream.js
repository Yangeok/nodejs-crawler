const fs = require('fs')

// utils
const join = require('utils/join')
const output = '../../outputs'

const setWriteStream = async filename => {
  const fields = [
    'keyword',
    'category',
    'date',
    'title',
    'username',
    'content',
    'click',
    'link',
    'channel',
    'site',
  ]
  const logs = fs.createWriteStream(join(__dirname, output, filename))
  await logs.write(`${fields.join(',')}\n`)
}
const addRow = async (item, filename) => {
  await fs.appendFile(
    join(__dirname, output, filename),
    `${item.keyword},${item.category},${item.date},${item.title},${item.username},${item.content},${item.click},${item.link},${item.channel},${item.site}\n`,
    err => err,
  )
}

module.exports = {
  setWriteStream,
  addRow,
}
