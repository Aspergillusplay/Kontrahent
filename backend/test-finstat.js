const axios = require('axios');
const cheerio = require('cheerio');

axios.get('https://www.finstat.sk/databaza-firiem-organizacii?Sort=sales-desc').then(res => {
  const $ = cheerio.load(res.data);
  const cells = $('table.table tbody tr, table.table tr').not('thead tr').first().find('td');
  const arr = [];
  cells.each((i, c) => arr.push($(c).text().trim().replace(/\s+/g, ' ')));
  console.log(arr);
});
