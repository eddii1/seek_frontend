import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import LiveApp from './live/LiveApp';
import './styles.css';

// The live command center (connected to the SEEK backend) by default; ?sim opens the original simulation.
const sim = new URLSearchParams(window.location.search).has('sim');
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>{sim ? <App /> : <LiveApp />}</React.StrictMode>);
