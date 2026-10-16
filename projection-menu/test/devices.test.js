// Network integrations against local mock devices: a PJLink projector and
// an mpv agent.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import { test } from 'node:test';
import { createMpvAgentDriver } from '../src/services/drivers/mpvAgentDriver.js';
import { getPower, pjlinkCommand, setPower } from '../src/services/pjlink.js';

// Minimal PJLink class 1 projector with password authentication.
async function fakeProjector(password) {
  let power = '0';
  const received = [];
  const server = net.createServer((socket) => {
    const seed = crypto.randomBytes(4).toString('hex');
    socket.write(`PJLINK 1 ${seed}\r`);
    socket.on('data', (data) => {
      const line = data.toString().trim();
      const digest = crypto.createHash('md5').update(seed + password).digest('hex');
      if (!line.startsWith(digest)) return socket.end('PJLINK ERRA\r');
      const command = line.slice(digest.length);
      received.push(command);
      if (command === '%1POWR ?') return socket.end(`%1POWR=${power}\r`);
      if (command.startsWith('%1POWR ')) {
        power = command.endsWith('1') ? '1' : '0';
        return socket.end('%1POWR=OK\r');
      }
      socket.end('%1POWR=ERR1\r');
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port, received };
}

test('PJLink: authenticated power on and query', async () => {
  const fake = await fakeProjector('secret');
  const projector = { pjlink_host: '127.0.0.1', pjlink_port: fake.port, pjlink_password: 'secret' };
  assert.equal(await getPower(projector), 'off');
  await setPower(projector, true);
  assert.equal(await getPower(projector), 'on');
  assert.deepEqual(fake.received, ['%1POWR ?', '%1POWR 1', '%1POWR ?']);
  await assert.rejects(
    pjlinkCommand({ host: '127.0.0.1', port: fake.port, password: 'wrong', command: '%1POWR ?' }),
    /كلمة مرور/,
  );
  fake.server.close();
});

test('mpv agent driver posts cues with absolute media URLs and the projector key', async () => {
  let got;
  const agent = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      got = { key: req.headers['x-projector-key'], cue: JSON.parse(body) };
      res.end('{"ok":true}');
    });
  });
  await new Promise((resolve) => agent.listen(0, '127.0.0.1', resolve));
  const driver = createMpvAgentDriver({ publicBaseUrl: 'http://192.168.1.10:3000', timeoutMs: 1000, onlineWindowMs: 30000 });
  const projector = { agent_host: '127.0.0.1', agent_port: agent.address().port, access_key: 'k1' };

  const result = await driver.send(projector, { cueId: 'c1', action: 'play', media: { kind: 'video', url: '/media/a.webm' } });
  assert.deepEqual(result, { ok: true, result: 'acked' });
  assert.equal(got.key, 'k1');
  assert.equal(got.cue.media.url, 'http://192.168.1.10:3000/media/a.webm');
  agent.close();

  const offline = await driver.send({ ...projector, agent_port: 1 }, { cueId: 'c2', action: 'stop' });
  assert.equal(offline.result, 'offline');
});
