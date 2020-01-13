require('dotenv').config()
const moment = require('moment')
const fs = require('fs')
const AWS = require('aws-sdk')

// configuration
const env = process.env
const s3 = new AWS.S3({
  accessKeyId: env.ACCESS_KEY_ID,
  secretAccessKey: env.SECRET_ACCESS_KEY,
  region: env.REGION,
})

// utils
const join = require('utils/join')
const output = '../../outputs'

const uploadFile = filename => {
  const data = fs.readFileSync(join(__dirname, output, filename))
  return s3Upload(filename, data)
}

const s3Upload = (filename, data) => {
  const result = s3.upload(
    {
      Bucket: env.BUCKET_NAME,
      Key: filename,
      Body: data,
      ContentEncoding: 'utf-8',
      ACL: 'public-read-write',
    },
    (err, data) => data,
  )
  const abb = result.service.config
  const obj = {
    location: `https://${abb.params.Bucket}.${abb.endpoint}/${encodeURI(
      abb.params.Key,
    )}`,
    key: abb.params.Key,
    signedAt: moment(result.singlePart.signedAt).format('YYYY-MM-DD hh:mm:ss'),
  }
  return obj
}

module.exports = uploadFile
