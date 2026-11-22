const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { stripTypeScriptTypes } = require('node:module');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../../functions/d1-custody');

function realm(existingGlobal) {
  const effects = { serve: 0, routers: 0, env: 0, clients: 0, network: 0, handlers: 0 };
  const forbidden = (name) => () => { effects[name]++; throw Error(`Unexpected ${name}`); };
  const sandbox = {
    effects,
    fetch: forbidden('network'),
    Deno: {
      env: { get: forbidden('env') },
      serve(handler) {
        assert.equal(typeof handler, 'function');
        effects.serve++;
      },
    },
  };
  if (existingGlobal !== undefined) {
    Object.defineProperty(sandbox, 'global', {
      value: existingGlobal, writable: false, configurable: false, enumerable: false,
    });
  }
  const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  assert.equal(vm.runInContext('typeof process', context), 'undefined');
  return { context, effects };
}

async function start(context) {
  // Only the entry and its dependency-free compatibility import are real modules.
  // The runtime stub reproduces the SDK's observed top-level read, without loading
  // financial code. This checks ESM ordering, not complete hosted compatibility.
  const inert = {
    '@supabase/supabase-js': `export function createClient() {
      effects.clients++; throw Error('Unexpected client');
    }`,
    './deployment-runtime.ts': `const anyGlobal = global;
      export function createDeploymentRuntime() { effects.handlers++; throw Error('Unexpected A'); }
      export function createVideoAutoRuntime() { effects.handlers++; throw Error('Unexpected B'); }`,
    './deployment-rpc-client.ts': `export function createDeploymentRpcClient() {
      effects.clients++; throw Error('Unexpected RPC adapter');
    }`,
    './deployment-routing.ts': `export function createIndependentCustodyRouter(a, b) {
      if (typeof a !== 'function' || typeof b !== 'function') throw Error('Missing route factory');
      effects.routers++;
      return () => { effects.handlers++; throw Error('Unexpected request'); };
    }`,
  };
  const entry = new vm.SourceTextModule(stripTypeScriptTypes(
    fs.readFileSync(path.join(root, 'deployment-index.ts'), 'utf8'),
  ), { context, identifier: 'deployment-index.ts' });
  await entry.link((specifier) => {
    let source;
    if (specifier === './deployment-global-compat.ts') {
      source = fs.readFileSync(path.join(root, 'deployment-global-compat.ts'), 'utf8');
    } else {
      assert(Object.hasOwn(inert, specifier), `Unexpected import: ${specifier}`);
      source = inert[specifier];
    }
    return new vm.SourceTextModule(source, { context, identifier: specifier });
  });
  await entry.evaluate({ timeout: 1000 });
}

test('entry initializes the absent global before SDK-style dependency evaluation', async () => {
  const { context, effects } = realm();
  assert.equal(vm.runInContext('typeof global', context), 'undefined');
  await start(context);
  assert.equal(vm.runInContext('global === globalThis && global.Array === Array', context), true);
  assert.deepEqual(effects, { serve: 1, routers: 1, env: 0, clients: 0, network: 0, handlers: 0 });
  const before = vm.runInContext('Object.getOwnPropertyDescriptor(globalThis, "global")', context);
  await start(context);
  const after = vm.runInContext('Object.getOwnPropertyDescriptor(globalThis, "global")', context);
  assert.deepEqual(after, before);
  assert.deepEqual(effects, { serve: 2, routers: 2, env: 0, clients: 0, network: 0, handlers: 0 });
});

test('entry preserves an existing immutable global and performs no operational work', async () => {
  const existing = Object.freeze({ marker: 'existing runtime global' });
  const { context, effects } = realm(existing);
  const before = vm.runInContext('Object.getOwnPropertyDescriptor(globalThis, "global")', context);
  await start(context);
  assert.equal(vm.runInContext('global', context), existing);
  assert.deepEqual(vm.runInContext('Object.getOwnPropertyDescriptor(globalThis, "global")', context), before);
  assert.deepEqual(effects, { serve: 1, routers: 1, env: 0, clients: 0, network: 0, handlers: 0 });
});

test('compat preserves existing accessors and undefined bindings without reading them', () => {
  const source = fs.readFileSync(
    path.join(root, 'deployment-global-compat.ts'), 'utf8',
  );
  const setups = [
    `Object.defineProperty(globalThis, 'global', {
      get() { effects.reads++; throw Error('Unexpected getter'); },
      configurable: false,
      enumerable: true,
    });`,
    `Object.defineProperty(globalThis, 'global', {
      value: undefined,
      writable: false,
      configurable: false,
      enumerable: false,
    });`,
  ];

  for (const setup of setups) {
    const context = vm.createContext(Object.create(null), {
      codeGeneration: { strings: false, wasm: false },
    });
    vm.runInContext(`
      globalThis.effects = { reads: 0 };
      ${setup}
    `, context);
    const before = vm.runInContext(
      'Object.getOwnPropertyDescriptor(globalThis, "global")', context,
    );

    vm.runInContext(source, context, { timeout: 1000 });
    vm.runInContext(source, context, { timeout: 1000 });

    const after = vm.runInContext(
      'Object.getOwnPropertyDescriptor(globalThis, "global")', context,
    );
    assert.deepEqual(after, before);
    assert.equal(vm.runInContext('effects.reads', context), 0);
  }
});
