import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { KEYLINE_IDENTITY_ASSETS, getKeylineIdentityAsset } from './.build/fileIconAssets.js';

// Independent golden values from pre-Quiet archived paths, not regenerated
// from current production assets. A change of drawing must fail this check.
test('default drawings exactly match the accepted pre-Quiet path data', () => {
    const golden = {
        'keyline-folder': 'b1be3702274ae21f3951ec9c7755afd2c0c8938c83aa5eea46c85ccb45f70d8f',
        'keyline-folder-open': '0b673e32c39d71665a5b222c0d99d179cb26bf97e957e3accdf1a6a0caeee866',
        'keyline-file-text': '243be92dd0f643c7da3144fb009b6ee40c563c532dd6e2b24a70ac3a91b12937',
        'keyline-file-image': '6f297f4b97cd64c3a46920524a7516c032439671d71707ccf76b6febe9818eb1',
    };
    assert.deepEqual(Object.keys(KEYLINE_IDENTITY_ASSETS), Object.keys(golden));
    for (const [id, hash] of Object.entries(golden)) {
        const asset = getKeylineIdentityAsset(id);
        assert.equal(createHash('sha256').update(asset.path).digest('hex'), hash, id);
        assert.equal(asset.paint, id === 'keyline-folder-open' ? 'stroke' : 'fill');
    }
});
test('theme asset names do not replace native or external icon identifiers', () => {
    for (const id of ['folder', 'file-text', 'lucide-file-text', 'star', 'constructor', '__proto__', 'keyline-missing']) {
        assert.equal(getKeylineIdentityAsset(id), undefined);
    }
});
