// api/cron-check.js
// Wrapper que delega diretamente para o handler centralizado api/cron.js
// Garante que qualquer chamada externa use as mesmas regras e travas anti-duplicidade.

const cronHandler = require('./cron');

module.exports = async (req, res) => {
    return cronHandler(req, res);
};
