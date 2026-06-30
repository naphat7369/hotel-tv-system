const http = require('http');

const PORT = 3000;
const HOST = 'localhost';

const payload = {
  "service":"create",
  "token":"fbba2a069d8f3f9186ff4ef94ca9d60e",
  "account":"1315",
  "password":"g315",
  "room":"1810",
  "pdpa":"N",
  "guest":"Kanti Kiran Gottipati",
  "phone":"91 124 4395000",
  "email":"ffdvj7t800@m.expediapartnercentral.com",
  "sex":"M",
  "nation":"IND",
  "idcard":"None",
  "checkin":"2025-02-10T00:00:00",
  "checkout":"2025-02-11T00:00:00",
  "expired":"2025-02-11T17:00:00"
};

const data = JSON.stringify(payload);

const options = {
  hostname: HOST,
  port: PORT,
  // We send it to our checkin webhook!
  path: `/api/v1/webhooks/pms/checkin`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length,
    'x-api-key': 'default-secret-key-123'
  }
};

console.log(`Sending Real Data request for room ${payload.room} to Webhook API...`);

const req = http.request(options, (res) => {
  let resData = '';
  res.on('data', (chunk) => {
    resData += chunk;
  });
  res.on('end', () => {
    console.log(`Status Code: ${res.statusCode}`);
    console.log(`Response: ${resData}`);
  });
});

req.on('error', (error) => {
  console.error(`Error sending request: ${error.message}`);
});

req.write(data);
req.end();
