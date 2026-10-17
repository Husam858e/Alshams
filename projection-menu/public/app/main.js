// Staff app entry point (owner / designer / waiter), served at /app/.

import { render } from 'preact';
import { html } from 'htm/preact';
import { App } from './app.js';

const root = document.getElementById('root');
root.textContent = '';
render(html`<${App} />`, root);
