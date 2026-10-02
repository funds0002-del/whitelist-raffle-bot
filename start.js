require('child_process').spawn('node', ['index.js'], { stdio: 'inherit' });
require('./server.js');