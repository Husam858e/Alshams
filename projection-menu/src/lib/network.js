import os from 'node:os';

// Private ranges in the order a restaurant router most likely uses them.
const PRIVATE_RANGES = [/^192\.168\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./];
// Virtual adapters (Docker, VMs, VPNs) are rarely what tablets can reach.
const VIRTUAL_IFACE = /^(docker|br-|veth|virbr|vmnet|vboxnet|tun|tap|utun|zt|tailscale|wg)/i;

// Lower is better. Link-local (169.254.x.x) means DHCP never answered.
function rank(name, ip) {
  const range = PRIVATE_RANGES.findIndex((re) => re.test(ip));
  const base = ip.startsWith('169.254.') ? 20 : range === -1 ? PRIVATE_RANGES.length : range;
  return base + (VIRTUAL_IFACE.test(name) ? 10 : 0);
}

// Non-internal IPv4 addresses of this machine, the most likely LAN address first.
export function lanAddresses(interfaces = os.networkInterfaces()) {
  const found = [];
  for (const [name, addrs] of Object.entries(interfaces ?? {})) {
    for (const a of addrs ?? []) {
      // `family` is a number on some older Node releases.
      if ((a.family === 'IPv4' || a.family === 4) && !a.internal) found.push({ ip: a.address, rank: rank(name, a.address) });
    }
  }
  return found.sort((a, b) => a.rank - b.rank).map((a) => a.ip);
}

export const lanUrls = (port, interfaces) => lanAddresses(interfaces).map((ip) => `http://${ip}:${port}`);
