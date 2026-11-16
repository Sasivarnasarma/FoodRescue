import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = ts.transpileModule(
  readFileSync(
    new URL('../src/hooks/use-device-permission.ts', import.meta.url),
    'utf8',
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;

const allowed = { granted: true, canAskAgain: true, status: 'granted' };
const blocked = { granted: false, canAskAgain: false, status: 'denied' };
const askable = { granted: false, canAskAgain: true, status: 'undetermined' };
const flush = () => new Promise((resolve) => setImmediate(resolve));

// Run the real hook with controlled native APIs and React lifecycle primitives.
function mountPermission(initial = blocked) {
  const slots = [];
  let index = 0;
  let mounted = false;
  let listener;
  let cleanup;
  let read = async () => initial;
  let settingsCalls = 0;
  let requestCalls = 0;
  const api = {
    getCameraPermissionsAsync: () => read(),
    requestCameraPermissionsAsync: async () => {
      requestCalls += 1;
      return allowed;
    },
  };
  const exports = {};
  runInNewContext(source, {
    exports,
    require: (name) => {
      if (name === 'react')
        return {
          useState: (initialValue) => {
            const position = index++;
            if (!mounted) slots[position] = initialValue;
            return [slots[position], (value) => (slots[position] = value)];
          },
          useRef: (value) => {
            const position = index++;
            if (!mounted) slots[position] = { current: value };
            return slots[position];
          },
          useEffect: (effect) => {
            if (!mounted) cleanup = effect();
          },
        };
      if (name === 'expo-camera') return { Camera: api };
      if (name === 'expo-location') return {};
      if (name === 'react-native')
        return {
          AppState: {
            addEventListener: (_, callback) => {
              listener = callback;
              return { remove: () => (listener = undefined) };
            },
          },
          Linking: { openSettings: async () => (settingsCalls += 1) },
        };
      return require(name);
    },
  });
  const render = () => {
    index = 0;
    const result = exports.useDevicePermission('camera');
    mounted = true;
    return result;
  };
  render();
  return {
    render,
    setRead: (callback) => (read = callback),
    resume: () => listener?.('active'),
    unmount: () => cleanup(),
    settingsCalls: () => settingsCalls,
    requestCalls: () => requestCalls,
  };
}

test('camera permission refreshes after granting access in Settings', async () => {
  const hook = mountPermission();
  await flush();
  assert.equal(hook.render().permission.granted, false);
  hook.setRead(async () => allowed);
  hook.resume();
  await flush();
  assert.equal(hook.render().permission.granted, true);
});

test('a stale blocked button rechecks access before opening Settings', async () => {
  const hook = mountPermission();
  await flush();
  hook.setRead(async () => allowed);
  await hook.render().openSettings();
  assert.equal(hook.render().permission.granted, true);
  assert.equal(hook.settingsCalls(), 0);
  assert.equal(hook.requestCalls(), 0);
});

test('Settings is used only for blocked permission; askable access prompts', async () => {
  const hook = mountPermission();
  await flush();
  await hook.render().openSettings();
  assert.equal(hook.settingsCalls(), 1);
  hook.setRead(async () => askable);
  await hook.render().openSettings();
  assert.equal(hook.settingsCalls(), 1);
  assert.equal(hook.requestCalls(), 1);
  assert.equal(hook.render().permission.granted, true);
});

test('a late permission read cannot overwrite a newer foreground result', async () => {
  const hook = mountPermission();
  await flush();
  let finishOldRead;
  hook.setRead(() => new Promise((resolve) => (finishOldRead = resolve)));
  hook.resume();
  hook.setRead(async () => allowed);
  hook.resume();
  await flush();
  finishOldRead(blocked);
  await flush();
  assert.equal(hook.render().permission.granted, true);
});

test('permission read failure can recover on retry without opening Settings', async () => {
  const hook = mountPermission();
  await flush();
  hook.setRead(async () => {
    throw new Error('Native permission read failed');
  });
  hook.resume();
  await flush();
  assert.ok(hook.render().error);
  hook.setRead(async () => allowed);
  await hook.render().request();
  assert.equal(hook.render().error, '');
  assert.equal(hook.render().permission.granted, true);
  assert.equal(hook.settingsCalls(), 0);
  hook.unmount();
});
