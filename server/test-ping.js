const { exec } = require('child_process');
const ip = "192.168.1.163";
exec(`ping -c 3 -W 1 ${ip}`, (error, stdout, stderr) => {
  console.log("Error:", error);
  console.log("Stdout:", stdout);
  console.log("Stderr:", stderr);
  console.log("Alive:", !error);
});
