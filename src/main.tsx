import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import LiveApp from './live/LiveApp';
import MultiApp from './live/MultiApp';
import './styles.css';

// The live command center (connected to the SEEK backend) by default; ?sim opens the original simulation.
const sim = new URLSearchParams(window.location.search).has('sim');
const multi = new URLSearchParams(window.location.search).has('multi');
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>{multi ? <MultiApp /> : sim ? <App /> : <LiveApp />}</React.StrictMode>);
