import test from 'node:test';
import assert from 'node:assert/strict';
import { ICON_DEFAULTS, normalizeFileIconSettings, normalizeIconOverride, resolveFileIcon, moveFileIconOverrides, iconColorCss } from './.build/fileIconModel.js';
const defaults = () => normalizeFileIconSettings();
test('all existing and new file types have a native glyph and a color', () => {
    const cases = { 'a.md': 'markdown', 'a.PDF': 'pdf', 'a.epub': 'epub', 'a.jpg': 'image', 'a.flac': 'audio', 'a.mov': 'video', 'a.canvas': 'canvas', 'a.ts': 'code', 'a.zip': 'archive', 'a.unknown': 'generic', 'README': 'generic' };
    for (const [path, kind] of Object.entries(cases)) {
        const icon = resolveFileIcon(defaults(), path);
        assert.equal(icon.kind, kind); assert.equal(icon.icon, ICON_DEFAULTS[kind].icon); assert.ok(icon.color);
    }
});
test('file icon and color independently override type defaults', () => {
    const s = defaults(); s.types.markdown = { icon: 'notebook', color: 'green' }; s.files['a.md'] = { color: 'purple' };
    assert.equal(resolveFileIcon(s, 'a.md').icon, 'notebook'); assert.equal(resolveFileIcon(s, 'a.md').color, 'purple');
    s.files['a.md'] = { icon: 'star' };
    assert.equal(resolveFileIcon(s, 'a.md').icon, 'star'); assert.equal(resolveFileIcon(s, 'a.md').color, 'green');
});
test('reset to automatic and monochrome retain underlying choices', () => {
    const s = defaults(); s.files['a.pdf'] = { color: '#123abc', icon: 'star' }; s.monochrome = true;
    assert.equal(resolveFileIcon(s, 'a.pdf').color, 'gray'); assert.equal(resolveFileIcon(s, 'a.pdf').icon, 'star');
    s.monochrome = false; assert.equal(resolveFileIcon(s, 'a.pdf').color, '#123abc');
    delete s.files['a.pdf']; assert.equal(resolveFileIcon(s, 'a.pdf').color, ICON_DEFAULTS.pdf.color);
});
test('folder custom identity remains consistent when expanded', () => {
    const s = defaults(); assert.equal(resolveFileIcon(s, 'Projects', true, '', true).icon, 'keyline-folder-open');
    s.files.Projects = { icon: 'briefcase' };
    assert.equal(resolveFileIcon(s, 'Projects', true, '', true).icon, 'briefcase');
    assert.equal(resolveFileIcon(s, 'Projects', true, '', false).icon, 'briefcase');
});
test('rename and folder moves preserve overrides with segment boundaries', () => {
    const s = defaults(); s.files = { Projects: { icon: 'star' }, 'Projects/a.md': { color: 'red' }, 'Projects2/a.md': { color: 'green' } };
    assert.equal(moveFileIconOverrides(s, 'Projects', 'Work'), true);
    assert.deepEqual(s.files.Work, { icon: 'star' }); assert.deepEqual(s.files['Work/a.md'], { color: 'red' });
    assert.deepEqual(s.files['Projects2/a.md'], { color: 'green' }); assert.ok(!s.files.Projects);
});
test('deletion removes only the deleted path subtree', () => {
    const s = defaults(); s.files = { 'A/x.md': { icon: 'star' }, 'AB/y.md': { icon: 'heart' } };
    assert.equal(moveFileIconOverrides(s, 'A', null), true); assert.deepEqual(Object.keys(s.files), ['AB/y.md']);
    assert.equal(moveFileIconOverrides(s, 'missing', null), false);
});
test('settings roundtrip, duplicate basenames and disabled state are stable', () => {
    const s = defaults(); s.enabled = false; s.files['A/same.md'] = { icon: 'star' }; s.files['B/same.md'] = { icon: 'heart' };
    const restored = normalizeFileIconSettings(JSON.parse(JSON.stringify(s)));
    assert.deepEqual(restored, s); assert.equal(resolveFileIcon(restored, 'B/same.md').icon, 'heart');
});
test('invalid data cannot inject CSS, SVG or arbitrary type keys', () => {
    const s = normalizeFileIconSettings({ files: { '/bad': { icon: 'star' }, '../bad': { icon: 'star' }, ok: { color: 'url(https://example.invalid)', icon: '<svg>' } }, types: { invalid: { icon: 'star' } } });
    assert.deepEqual(Object.keys(s.files), []); assert.deepEqual(s.types, {});
    assert.deepEqual(normalizeIconOverride({ icon: 'lucide-file-text', color: '#ABC123' }), { icon: 'file-text', color: '#abc123' });
    assert.equal(iconColorCss('url(bad)'), 'var(--ncl-icon-gray)');
});
test('prototype-like filenames are treated as literal keys', () => {
    const s = normalizeFileIconSettings(JSON.parse('{"files":{"__proto__":{"icon":"star"}}}'));
    assert.equal(resolveFileIcon(s, '__proto__').icon, 'star'); assert.equal(resolveFileIcon(s, 'constructor').icon, 'keyline-file-text');
    const fresh = defaults(); fresh.files.__proto__ = { icon: 'heart' };
    assert.equal(Object.getPrototypeOf(fresh.files), null);
    assert.equal(resolveFileIcon(fresh, '__proto__').icon, 'heart');
});
test('restoring defaults preserves explicit Lucide choices and color-only overrides', () => {
    const s = normalizeFileIconSettings({ files: { 'A.md': { icon: 'file-text', color: 'pink' }, Projects: { icon: 'folder' } }, types: { image: { icon: 'file-image' } } });
    assert.equal(resolveFileIcon(s, 'A.md').icon, 'file-text');
    assert.equal(resolveFileIcon(s, 'Projects', true, '', true).icon, 'folder');
    assert.equal(resolveFileIcon(s, 'A.png').icon, 'file-image');
    s.files['B.md'] = { color: '#123456' };
    assert.equal(resolveFileIcon(s, 'B.md').icon, 'keyline-file-text');
    assert.equal(resolveFileIcon(s, 'B.md').color, '#123456');
    delete s.files['A.md'];
    assert.equal(resolveFileIcon(s, 'A.md').icon, 'keyline-file-text');
    assert.equal(resolveFileIcon(s, 'Other', true).icon, 'keyline-folder');
});
