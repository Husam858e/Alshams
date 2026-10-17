import crypto from 'node:crypto';
import net from 'node:net';

// PJLink (Class 1) — the vendor-neutral LAN protocol most business/installation
// projectors (Epson, NEC, Panasonic, Sony, Optoma, ...) speak on TCP 4352.
// It controls the projector itself (power, input, mute), not the content:
// content always comes from the device connected over HDMI.
//
//   greeting  : "PJLINK 0"            (no auth)  |  "PJLINK 1 <random>" (auth)
//   request   : [md5(random + password)] "%1POWR 1\r"
//   response  : "%1POWR=OK"  |  "%1POWR=ERR3"  |  "PJLINK ERRA" (bad password)

const ERRORS = {
  ERR1: 'أمر غير معروف',
  ERR2: 'معامل غير صالح',
  ERR3: 'البرجكتر غير جاهز (تبريد/تسخين)',
  ERR4: 'عطل في البرجكتر',
  ERRA: 'كلمة مرور PJLink غير صحيحة',
};

export function pjlinkCommand({ host, port = 4352, password = '', command, timeoutMs = 4000 }) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let buffer = '';
    let sent = false;
    const fail = (err) => {
      socket.destroy();
      reject(err instanceof Error ? err : new Error(err));
    };

    socket.setTimeout(timeoutMs, () => fail('انتهت مهلة الاتصال بالبرجكتر'));
    socket.on('error', (err) => fail(`تعذر الاتصال بالبرجكتر: ${err.code ?? err.message}`));
    socket.on('data', (chunk) => {
      buffer += chunk.toString('latin1');
      let idx;
      while ((idx = buffer.indexOf('\r')) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!sent) {
          const [, authFlag, seed] = line.split(' ');
          if (line === 'PJLINK ERRA') return fail(ERRORS.ERRA);
          if (!line.startsWith('PJLINK ')) return fail(`رد غير متوقع: ${line}`);
          const digest = authFlag === '1' ? crypto.createHash('md5').update(seed + password).digest('hex') : '';
          socket.write(`${digest}${command}\r`);
          sent = true;
          continue;
        }
        socket.end();
        if (line === 'PJLINK ERRA') return reject(new Error(ERRORS.ERRA));
        const value = line.split('=')[1] ?? '';
        if (ERRORS[value]) return reject(new Error(ERRORS[value]));
        return resolve(value);
      }
    });
  });
}

const POWER_STATES = { 0: 'off', 1: 'on', 2: 'cooling', 3: 'warming' };

export async function setPower(projector, on) {
  await pjlinkCommand({ ...target(projector), command: `%1POWR ${on ? 1 : 0}` });
}

export async function getPower(projector) {
  const value = await pjlinkCommand({ ...target(projector), command: '%1POWR ?' });
  return POWER_STATES[value] ?? value;
}

function target(projector) {
  if (!projector.pjlink_host) throw new Error('لم يُحدد عنوان IP للبرجكتر (PJLink)');
  return { host: projector.pjlink_host, port: projector.pjlink_port || 4352, password: projector.pjlink_password || '' };
}
