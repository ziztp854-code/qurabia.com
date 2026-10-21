/** Linux-only, read-only descriptor probe. It never reads descriptor contents. */
import fs from 'node:fs';

export function snapshotDescriptors(pid = process.pid) {
  const base = `/proc/${pid}`;
  const socketRows = new Map();
  for (const protocol of ['tcp', 'tcp6', 'udp', 'udp6', 'unix']) {
    try {
      const rows = fs.readFileSync(`${base}/net/${protocol}`, 'utf8').trim().split('\n').slice(1);
      for (const row of rows) {
        const parts = row.trim().split(/\s+/);
        const inode = protocol === 'unix' ? parts[6] : parts[9];
        socketRows.set(inode, {
          protocol,
          ...(protocol === 'unix'
            ? { state: parts[5] }
            : { local: parts[1], remote: parts[2], state: parts[3] }),
        });
      }
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'EACCES') throw error;
    }
  }
  const entries = fs.readdirSync(`${base}/fd`);
  const descriptors = [];
  for (const fd of entries) {
    try {
      const target = fs.readlinkSync(`${base}/fd/${fd}`);
      const socket = /^socket:\[(\d+)\]$/.exec(target);
      const type = socket
        ? socketRows.get(socket[1])?.protocol || 'socket-unlisted'
        : target.startsWith('pipe:')
          ? 'pipe'
          : target.startsWith('anon_inode:')
            ? target
            : target === '/dev/null'
              ? 'dev-null'
              : 'file';
      descriptors.push({
        fd: Number(fd),
        type,
        target: type === 'file' ? '[file-path-omitted]' : target,
        ...(socket ? socketRows.get(socket[1]) || {} : {}),
      });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const types = {};
  for (const item of descriptors) types[item.type] = (types[item.type] || 0) + 1;
  return {
    at: Date.now(),
    pid,
    // readdir(self/fd) momentarily counts its own directory descriptor. Keep
    // both quantities so historical raw readdir counts remain interpretable.
    listedEntries: entries.length,
    stableCount: descriptors.length,
    types,
    descriptors,
  };
}

export function compareDescriptorTypes(before, after) {
  return Object.fromEntries(
    [...new Set([...Object.keys(before.types), ...Object.keys(after.types)])].map((key) => [
      key,
      (after.types[key] || 0) - (before.types[key] || 0),
    ]),
  );
}
