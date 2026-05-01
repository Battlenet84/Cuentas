const childProcess = require('node:child_process');

const originalExec = childProcess.exec;

childProcess.exec = function patchedExec(command, options, callback) {
  if (typeof command === 'string' && command.trim().toLowerCase() === 'net use') {
    const done = typeof options === 'function' ? options : callback;
    if (typeof done === 'function') {
      queueMicrotask(() => done(null, '', ''));
    }
    return {
      stdout: { on() {} },
      stderr: { on() {} },
      on() {},
      once() {},
      kill() {}
    };
  }

  return originalExec.apply(this, arguments);
};
