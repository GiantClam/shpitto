import {execFileSync} from 'node:child_process';
import http from 'node:http';

const port = 8080;
const mediaTool = execFileSync('ffmpeg', ['-version'], {encoding: 'utf8'}).split('\n', 1)[0];

if (process.argv.includes('--probe')) {
  const response = await fetch(`http://127.0.0.1:${port}/healthz`);
  if (!response.ok) process.exit(1);
  process.exit(0);
}

const server = http.createServer((request, response) => {
  if (request.url !== '/healthz') {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {'content-type': 'application/json'}).end(JSON.stringify({status: 'ready', mediaTool}));
});

server.listen(port, '0.0.0.0');
