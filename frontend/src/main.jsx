import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <div style={{padding:32,fontFamily:'sans-serif',color:'#8d3940'}}><h1>StockSense could not load</h1><pre style={{whiteSpace:'pre-wrap'}}>{this.state.error.message}</pre></div>;
    return this.props.children;
  }
}
createRoot(document.getElementById('root')).render(<React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>);
