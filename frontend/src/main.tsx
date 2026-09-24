import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/index.css';

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <div>Hello World</div>
    </React.StrictMode>,
  );
}
