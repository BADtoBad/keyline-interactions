import assert from "node:assert/strict";
import test from "node:test";

import { FloatingSurfaceCoordinator } from "./.build/surfaceCoordinator.js";

function fakeDocument() {
	const classes = new Set();
	const documentListeners = new Map();
	const windowListeners = new Map();
	const add = (listeners, type, callback) => {
		if (!listeners.has(type)) listeners.set(type, new Set());
		listeners.get(type).add(callback);
	};
	const remove = (listeners, type, callback) => listeners.get(type)?.delete(callback);
	const emit = (listeners, type, target) => {
		for (const callback of listeners.get(type) ?? []) callback({ type, target });
	};
	const fakeWindow = {
		addEventListener: (type, callback) => add(windowListeners, type, callback),
		removeEventListener: (type, callback) => remove(windowListeners, type, callback),
		emit: (type) => emit(windowListeners, type, fakeWindow),
	};
	const doc = {
		body: {
			classList: {
				add: (...names) => names.forEach((name) => classes.add(name)),
				remove: (...names) => names.forEach((name) => classes.delete(name)),
				toggle: (name, force) => {
					if (force) classes.add(name);
					else classes.delete(name);
					return force;
				},
				contains: (name) => classes.has(name),
			},
		},
		defaultView: fakeWindow,
		addEventListener: (type, callback) => add(documentListeners, type, callback),
		removeEventListener: (type, callback) => remove(documentListeners, type, callback),
		emit: (type, target = doc) => emit(documentListeners, type, target),
	};
	return doc;
}

test("claiming a surface replaces the prior surface in the same document", () => {
	const coordinator = new FloatingSurfaceCoordinator();
	const doc = fakeDocument();
	const closed = [];

	const insert = coordinator.claim(doc, "insert-menu", (reason) => closed.push(reason));
	assert.equal(insert.active, true);
	assert.equal(doc.body.classList.contains("ncl-surface-insert-menu"), true);

	const action = coordinator.claim(doc, "action-menu", (reason) => closed.push(reason));
	assert.equal(insert.active, false);
	assert.equal(action.active, true);
	assert.deepEqual(closed, ["replaced"]);
	assert.equal(doc.body.classList.contains("ncl-surface-insert-menu"), false);
	assert.equal(doc.body.classList.contains("ncl-surface-action-menu"), true);

	const nativeMenu = coordinator.claim(doc, "native-menu", (reason) => closed.push(reason));
	assert.equal(action.active, false);
	assert.equal(nativeMenu.active, true);
	assert.deepEqual(closed, ["replaced", "replaced"]);
	assert.equal(doc.body.classList.contains("ncl-surface-action-menu"), false);
	assert.equal(doc.body.classList.contains("ncl-surface-native-menu"), true);
});

test("releasing a lease removes state without invoking its close callback", () => {
	const coordinator = new FloatingSurfaceCoordinator();
	const doc = fakeDocument();
	let closed = false;
	const lease = coordinator.claim(doc, "drag", () => { closed = true; });

	lease.release();
	assert.equal(closed, false);
	assert.equal(lease.active, false);
	assert.equal(coordinator.activeKind(doc), null);
	assert.equal(doc.body.classList.contains("ncl-exclusive-surface-open"), false);
});

test("documents are coordinated independently and closeAll clears both", () => {
	const coordinator = new FloatingSurfaceCoordinator();
	const first = fakeDocument();
	const second = fakeDocument();
	const reasons = [];

	coordinator.claim(first, "insert-menu", (reason) => reasons.push(`first:${reason}`));
	coordinator.claim(second, "action-menu", (reason) => reasons.push(`second:${reason}`));
	coordinator.closeAll();

	assert.deepEqual(reasons.sort(), ["first:unload", "second:unload"]);
	assert.equal(coordinator.activeKind(first), null);
	assert.equal(coordinator.activeKind(second), null);
});

test("menu surfaces close when their viewport anchor becomes stale", () => {
	const coordinator = new FloatingSurfaceCoordinator();
	const doc = fakeDocument();
	const insideMenu = {};
	const reasons = [];

	const lease = coordinator.claim(
		doc,
		"insert-menu",
		(reason) => reasons.push(reason),
		{
			dismissOnViewportChange: true,
			containsEventTarget: (target) => target === insideMenu,
		}
	);

	doc.emit("scroll", insideMenu);
	assert.equal(lease.active, true, "scrolling the menu list must keep it open");

	doc.emit("scroll", {});
	assert.equal(lease.active, false);
	assert.deepEqual(reasons, ["viewport"]);

	// Listener cleanup means later viewport events cannot close the same lease twice.
	doc.defaultView.emit("resize");
	assert.deepEqual(reasons, ["viewport"]);
});
