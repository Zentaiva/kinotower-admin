const { handle } = require('../server');

module.exports = async (req, res) => {
  try {
    await handle(req, res);
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.end('Internal Server Error');
  }
};
