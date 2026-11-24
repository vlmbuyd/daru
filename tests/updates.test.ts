import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';

const {createUpdates} = createRequire(import.meta.url)('../electron/updates.cjs');

test('updates stay off without a packaged feed and install only after download', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'daru-update-'));
  try {
    const app = {isPackaged: true, getVersion: () => '0.1.1'};
    const disabled = createUpdates(app, () => {throw Error('unexpected updater');}, 'darwin', directory);
    assert.equal(disabled.status().phase, 'disabled');
    await writeFile(join(directory, 'app-update.yml'), 'provider: github');
    const updater = new EventEmitter();
    let installed = 0;
    Object.assign(updater, {
      checkForUpdates: async () => {updater.emit('update-available');},
      quitAndInstall: () => {installed++;},
    });
    const updates = createUpdates(app, () => updater, 'darwin', directory);
    assert.equal(updates.install(), false);
    assert.equal((await updates.check()).phase, 'downloading');
    updater.emit('update-downloaded', {version: '0.1.2'});
    assert.equal(updates.status().nextVersion, '0.1.2');
    assert.equal(updates.install(), true);
    assert.equal(installed, 1);
  } finally {await rm(directory, {recursive: true, force: true});}
});
