// PJLink projector power over the LAN, against a local mock projector.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import net from 'node:net';
import { after, before, test } from 'node:test';
import { getPower, pjlinkCommand, setPower } from '../src/services/pjlink.js';
import { makeTable, startServer } from './helpers.js';

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

let fake;
let t;
before(async () => {
  fake = await fakeProjector('secret');
  t = await startServer();
});
after(async () => {
  fake.server.close();
  await t.close();
});

test('PJLink: authenticated power on and query', async () => {
  const projector = { pjlink_host: '127.0.0.1', pjlink_port: fake.port, pjlink_password: 'secret' };
  assert.equal(await getPower(projector), 'off');
  await setPower(projector, true);
  assert.equal(await getPower(projector), 'on');
  assert.deepEqual(fake.received.slice(-3), ['%1POWR ?', '%1POWR 1', '%1POWR ?']);
  await assert.rejects(pjlinkCommand({ host: '127.0.0.1', port: fake.port, password: 'wrong', command: '%1POWR ?' }), /كلمة مرور/);
  await assert.rejects(getPower({}), /لم يُحدد عنوان IP/);
});

test('PJLink through the API (owner only); errors become 502 with an Arabic message', async () => {
  const { projectorId } = makeTable(t, { number: 1 });
  const res = await t.as.owner.patch(`/api/projectors/${projectorId}`, {
    pjlink_host: '127.0.0.1',
    pjlink_port: fake.port,
    pjlink_password: 'secret',
  });
  assert.equal(res.body.pjlink_has_password, true);
  assert.ok(!('pjlink_password' in res.body), 'the password is never sent back');

  assert.deepEqual((await t.as.owner.post(`/api/projectors/${projectorId}/power`, { on: false })).body, { power: 'cooling' });
  assert.deepEqual((await t.as.owner.get(`/api/projectors/${projectorId}/power`)).body, { power: 'off' });
  assert.equal((await t.as.designer.post(`/api/projectors/${projectorId}/power`, { on: true })).status, 403);

  await t.as.owner.patch(`/api/projectors/${projectorId}`, { pjlink_password: 'wrong' });
  const bad = await t.as.owner.get(`/api/projectors/${projectorId}/power`);
  assert.equal(bad.status, 502);
  assert.match(bad.body.error, /كلمة مرور PJLink/);
});
