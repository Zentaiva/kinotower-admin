const { handle } = require('../server');

module.exports = async (req, res) => {
  try {
    await handle(req, res);
  } catch (err) {
    console.error('=== CRASH ===');
    console.error(err.name, err.message);
    console.error(err.stack);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain');
    res.end(`Error: ${err.name}: ${err.message}\n\n${err.stack}`);
  }
};
