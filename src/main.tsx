import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import OpenAIApp from './OpenAIApp.tsx';
import 'katex/dist/katex.min.css';
import './index.css';

const pathname = window.location.pathname;
const RootComponent = pathname === "/openai" ? OpenAIApp : App;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootComponent />
  </StrictMode>,
);
