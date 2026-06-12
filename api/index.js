const { handle } = require('../server');

module.exports = async (req, res) => {
  await handle(req, res);
};
