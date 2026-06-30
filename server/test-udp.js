const dgram = require('dgram');

function checkUdpStream(address, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        socket.close();
        resolve(false);
      }
    }, timeoutMs);

    socket.on('message', (msg, rinfo) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        socket.close();
        resolve(true); // Received data!
      }
    });

    socket.on('error', (err) => {
      console.error(`Socket error: ${err.message}`);
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        socket.close();
        resolve(false);
      }
    });

    socket.bind(port, () => {
      try {
        socket.addMembership(address);
      } catch (e) {
        console.error(`Error adding membership: ${e.message}`);
      }
    });
  });
}

async function test() {
  console.log('Testing 224.10.10.233:6000...');
  const isAlive = await checkUdpStream('224.10.10.233', 6000);
  console.log('Is Alive?', isAlive);
}

test();
