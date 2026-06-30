const { clearGuestApps } = require('./dist/services/adb.service.js');

async function run() {
  console.log('Clearing apps for 192.168.1.163...');
  try {
    await clearGuestApps('192.168.1.163');
    console.log('Done!');
  } catch(e) {
    console.error(e);
  }
}
run();
