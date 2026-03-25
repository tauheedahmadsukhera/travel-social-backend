import 'react-native-gesture-handler';

if (typeof globalThis.WeakRef === 'undefined') {
	globalThis.WeakRef = class WeakRef {
		constructor(value) {
			this._value = value;
		}

		deref() {
			return this._value;
		}
	};
}

if (typeof globalThis.FinalizationRegistry === 'undefined') {
	globalThis.FinalizationRegistry = class FinalizationRegistry {
		register() {}
		unregister() {
			return false;
		}
	};
}

const React = require('react');
const { registerRootComponent } = require('expo');
const { ExpoRoot } = require('expo-router');

const ctx = require.context('./app');

function App() {
	return <ExpoRoot context={ctx} />;
}

registerRootComponent(App);
