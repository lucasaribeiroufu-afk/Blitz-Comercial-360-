import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {PublicQuote} from './components/QuoteRequests';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {window.location.pathname === "/orcamento" ? <PublicQuote /> : <App />}
  </StrictMode>,
);
