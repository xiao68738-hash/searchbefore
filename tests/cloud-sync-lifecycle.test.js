/* Run the original browser module with fake Firebase modules; no network or real accounts. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");

if (!vm.SyntheticModule) {
  const run = spawnSync(process.execPath, ["--experimental-vm-modules", __filename], { stdio: "inherit", windowsHide: true });
  process.exit(run.status ?? 1);
}
const source = fs.readFileSync(path.join(__dirname, "../cloud-sync.js"), "utf8");
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}
async function harness(options = {}) {
  const store = { syncEnabled: true, syncOwnerUid: "account-a", records: [{ id: "local-a", note: "A-only", updatedAt: "2026-09-07T00:00:00.000Z" }] };
  const writes = [], reads = [];
  let authCallback, reloads = 0, confirmations = 0;
  let readHook = async () => [];
  let writeHook = async () => {};
  const account = { onUser(cb) { authCallback = cb; } };
  const sandbox = {
    navigator: { onLine: true }, location: { protocol: "https:" },
    setTimeout() { return 1; }, clearTimeout() {}, PQC_ACCOUNT: account,
    window: { PQC_ACCOUNT: account, PQC_PUBLIC_CONFIG: { firebase: { apiKey: "fake", projectId: "fake" } }, addEventListener() {}, confirm() { confirmations++; return options.confirm !== false; } },
  };
  const context = vm.createContext(sandbox);
  const appApi = { getApps: () => [{}], getApp: () => ({}), initializeApp: () => ({}) };
  const firestore = {
    getFirestore: () => ({}), collection: (_, ...parts) => ({ parts }),
    doc: (_, ...parts) => ({ parts }), where: (...parts) => parts,
    query: (ref, condition) => ({ ...ref, condition }),
    async getDocs(ref) {
      reads.push(ref);
      const rows = await readHook(ref);
      return { forEach(cb) { for (const row of rows) cb({ id: row.id, data: () => clone(row) }); } };
    },
    async setDoc(ref, body) { writes.push({ ref, body: clone(body) }); await writeHook(ref, body); },
  };
  const modules = new Map();
  async function importModule(url) {
    if (options.sdkGate) await options.sdkGate;
    if (options.failSdk && url.endsWith("firebase-firestore.js")) {
      options.failSdk = false;
      throw new Error("fake SDK network failure");
    }
    if (!modules.has(url)) {
      const exports = url.endsWith("firebase-app.js") ? appApi : firestore;
      const mod = new vm.SyntheticModule(Object.keys(exports), function() {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      }, { context });
      modules.set(url, (async () => { await mod.link(() => {}); await mod.evaluate(); return mod; })());
    }
    return modules.get(url);
  }
  new vm.Script(source, { filename: "cloud-sync.js", importModuleDynamically: importModule }).runInContext(context);
  const sync = sandbox.window.PQC_SYNC;
  sync.attach({ host: { get: k => clone(store[k] ?? null), set: (k, v) => { store[k] = clone(v); }, reload: () => reloads++ } });
  authCallback({ uid: "account-a" });
  return { sync, store, writes, reads, login: authCallback, read: fn => { readHook = fn; }, write: fn => { writeHook = fn; }, reloads: () => reloads, confirmations: () => confirmations };
}

(async () => {
  for (const stop of ["switch-account", "sign-out", "disable-sync", "switch-back", "disable-reenable"]) {
    const h = await harness(), started = deferred(), response = deferred();
    h.read(async () => { started.resolve(); return response.promise; });
    const before = clone(h.store.records);
    const run = h.sync.syncNow();
    await started.promise;
    if (stop === "switch-account") h.login({ uid: "account-b" });
    if (stop === "sign-out") h.login(null);
    if (stop === "disable-sync") h.sync.setEnabled(false);
    if (stop === "switch-back") { h.login({ uid: "account-b" }); h.login({ uid: "account-a" }); }
    if (stop === "disable-reenable") { h.sync.setEnabled(false); h.sync.setEnabled(true); }
    response.resolve([{ id: "remote-a", note: "private A result", updatedAt: "2026-09-07T01:00:00.000Z" }]);
    await run;
    assert.deepEqual(h.store.records, before, `${stop}: stale result must not mutate local data`);
    assert.equal(h.writes.length, 0, `${stop}: stale result must not trigger uploads`);
    assert.equal(h.store.syncLastAt, undefined, `${stop}: cancelled sync is not success`);
    assert.equal(h.reloads(), 0);
  }
  {
    const h = await harness(), started = deferred(), response = deferred();
    h.store.records.push({ id: "another-a", note: "also private", updatedAt: "2026-09-07T00:00:00.000Z" });
    h.write(async () => { started.resolve(); await response.promise; });
    const run = h.sync.syncNow();
    await started.promise;
    h.login({ uid: "account-b" });
    response.resolve();
    await run;
    assert.equal(h.writes.length, 1, "An already submitted write cannot be recalled, but no next write may start");
    assert.equal(h.writes[0].ref.parts[1], "account-a", "Submitted write retains its original account path");
    assert.equal(h.store.syncLastAt, undefined);
  }
  {
    const gate = deferred(), h = await harness({ sdkGate: gate.promise });
    const first = h.sync.syncNow(), second = h.sync.syncNow();
    gate.resolve();
    await Promise.all([first, second]);
    assert.equal(h.reads.length, 3, "SDK initialization must not allow two simultaneous sync runs");
    assert.equal(h.writes.length, 1);
    assert.equal(h.reloads(), 1);
  }
  {
    const gate = deferred(), h = await harness({ sdkGate: gate.promise });
    const run = h.sync.syncNow();
    h.login(null);
    gate.resolve();
    await run;
    assert.equal(h.reads.length, 0, "Sign-out while loading SDK prevents all data reads");
  }
  {
    const h = await harness({ failSdk: true });
    await h.sync.syncNow();
    assert.equal(h.sync.statusLine().tone, "warn", "SDK failure must be visible instead of looking synced");
    assert.equal(h.store.syncLastAt, undefined);
    await h.sync.syncNow();
    assert.equal(h.reads.length, 3, "Transient SDK failure must allow retry");
    assert.equal(h.sync.statusLine().tone, "ok");
  }
  for (const enabled of [false, true]) {
    const h = await harness({ confirm: enabled });
    h.store.syncLastAt = "2026-09-07T12:00:00.000Z";
    h.store.syncTombstones = [{ col: "records", id: "b-existing", updatedAt: "2026-09-07T11:00:00.000Z" }];
    h.login({ uid: "account-b" });
    await h.sync.syncNow();
    assert.equal(h.reads.length, 0, "Owner conflict blocks sync before explicit adoption");
    assert.equal(h.sync.adoptCurrentAccount(), enabled);
    assert.equal(h.confirmations(), 1);
    if (!enabled) {
      assert.equal(h.store.syncOwnerUid, "account-a");
      assert.equal(h.store.syncTombstones.length, 1);
      continue;
    }
    assert.equal(h.store.syncLastAt, "", "Previous account's checkpoint must be reset");
    assert.deepEqual(h.store.syncTombstones, [], "Do not propagate A's deletion history into B");
    h.read(async ref => ref.parts[2] === "records" ? [{ id: "b-existing", note: "B existing", updatedAt: "2026-08-01T00:00:00.000Z" }] : []);
    await h.sync.syncNow();
    assert.equal(h.store.records.length, 2, "Explicit merge keeps both local data and B's older cloud record");
    assert.ok(h.reads.every(ref => !ref.condition));
    assert.ok(h.writes.every(write => write.ref.parts[1] === "account-b" && !write.body._deleted));
  }
  {
    const h = await harness(), started = deferred(), response = deferred();
    h.write(async () => { started.resolve(); await response.promise; });
    const run = h.sync.syncNow();
    await started.promise;
    const edited = h.sync.beforeStore("records", [{ ...h.store.records[0], note: "edited while upload pending" }]);
    h.store.records = clone(edited);
    h.sync.afterStore("records");
    response.resolve();
    await run;
    assert.ok(h.store.syncLastAt < h.store.records[0].updatedAt, "Checkpoint must not claim an edit made during upload is already synced");
    h.write(async () => {});
    await h.sync.syncNow();
    assert.equal(h.writes.at(-1).body.note, "edited while upload pending", "Next sync must upload the pending edit");
  }
  console.log("Cloud sync lifecycle: cancellation, account isolation, SDK retries, one-run locking and explicit account adoption passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
