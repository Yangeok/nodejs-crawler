require('dotenv')
const fetch = require('node-fetch')
const uuidv4 = require('uuid/v4')

module.exports = async (item, _index) => {
  const id = uuidv4()
  return await fetch(`${process.env.ES_URL}/${_index}/_doc/${id}`, {
    method: 'post',
    body: JSON.stringify(item),
    headers: { 'Content-Type': 'application/json' },
  })
}
