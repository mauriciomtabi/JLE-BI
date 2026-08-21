const cron = require('./api/cron.js');
const req = { method: 'GET', headers: {}, query: {} };
const res = {
  setHeader: () => {},
  status: (code) => ({
    json: (data) => console.log(new Date().toISOString(), 'Cron check:', code, JSON.stringify(data)),
    end: () => {}
  })
};
cron(req, res).catch(console.error);
