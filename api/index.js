const { handle } = require('../server');

module.exports = async (req, res) => {
  try {
    await handle(req, res);
  } catch (e) {
    console.error(e);
    res.statusCode = 500;
    res.end('Server error');
  }
};
