const http = require('http');

const PORT = 3000;
const HOST = 'localhost';

const args = process.argv.slice(2);
const command = args[0];

if (!command || !['checkin', 'checkout'].includes(command)) {
  console.log('Usage: node test-pms.js <checkin|checkout>');
  console.log('Example: node test-pms.js checkin');
  process.exit(1);
}

const payload = command === 'checkin' ? {
  roomNumber: '1101',
  guestName: 'Mr. John Doe',
  guestTag: 'VIP',
  deviceId: 'BOX-101-A', // Matches the active deviceId in App.tsx
  ip: '192.168.1.62' // Use your actual box IP if testing ADB
} : {
  roomNumber: '1101',
  deviceId: 'BOX-101-A',
  ip: '192.168.1.62' // Use your actual box IP if testing ADB
};

const data = JSON.stringify(payload);

const options = {
  hostname: HOST,
  port: PORT,
  path: `/api/v1/pms/${command}`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

console.log(`Sending ${command.toUpperCase()} request to PMS API...`);

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
