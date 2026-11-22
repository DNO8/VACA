// Some bundled Node dependencies read `global` during module initialization.
// Import this dependency-free module before the deployment runtime graph.
if (!Reflect.has(globalThis, "global")) {
  Object.defineProperty(globalThis, "global", {
    value: globalThis,
    writable: true,
    configurable: true,
  });
}
