import http from 'node:http';
import {randomUUID} from 'node:crypto';

const port = Number(globalThis.process['env'].MAIL_CAPTURE_PORT ?? 8025);
const messages = new Map();

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function messageView(message) {
  return {ID: message.id, Subject: message.subject, To: message.to, Text: message.text};
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    if (request.method === 'POST' && url.pathname === '/api/v1/send') {
      const body = await readJson(request);
      const id = randomUUID();
      const to = Array.isArray(body.To) ? body.To.map((entry) => entry?.Email).filter(Boolean) : [];
      messages.set(id, {id, subject: String(body.Subject ?? ''), to, text: String(body.Text ?? '')});
      response.writeHead(200, {'content-type': 'application/json'}).end(JSON.stringify({ID: id}));
      return;
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/search') {
      const query = url.searchParams.get('query') ?? '';
      const recipient = query.match(/to:([^\s]+)/i)?.[1];
      const subject = query.match(/subject:(.+)$/i)?.[1];
      const result = [...messages.values()].filter((message) => (!recipient || message.to.includes(recipient)) && (!subject || message.subject === subject));
      response.writeHead(200, {'content-type': 'application/json'}).end(JSON.stringify({messages: result.map(messageView)}));
      return;
    }
    const detail = url.pathname.match(/^\/api\/v1\/message\/([^/]+)$/);
    if (request.method === 'GET' && detail) {
      const message = messages.get(detail[1]);
      if (!message) { response.writeHead(404).end(); return; }
      response.writeHead(200, {'content-type': 'application/json'}).end(JSON.stringify(messageView(message)));
      return;
    }
    if (request.method === 'DELETE' && url.pathname === '/api/v1/messages') {
      const body = await readJson(request);
      for (const id of body.IDs ?? []) messages.delete(String(id));
      response.writeHead(200, {'content-type': 'application/json'}).end('{}');
      return;
    }
    response.writeHead(404).end();
  } catch (error) {
    response.writeHead(400, {'content-type': 'text/plain'}).end(error instanceof Error ? error.message : String(error));
  }
});

server.listen(port, '127.0.0.1', () => console.log(`local mail capture listening on ${port}`));
