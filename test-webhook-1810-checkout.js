const http = require('http');

const PORT = 3000;
const HOST = 'localhost';

const payload = {
  roomNumber: '1810'
};

const data = JSON.stringify(payload);

const options = {
  hostname: HOST,
  port: PORT,
  path: `/api/v1/webhooks/pms/checkout`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length,
    'x-api-key': 'default-secret-key-123'
  }
};

console.log(`Sending CHECKOUT request for room 1810 to Webhook API...`);

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
