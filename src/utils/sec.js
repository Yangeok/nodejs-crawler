const RandomWaitFor = (min, max) =>
  Math.floor(Math.random() * (max - min) + min)

module.exports = RandomWaitFor
