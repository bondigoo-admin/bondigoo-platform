import React from 'react';
import { Loader2 } from 'lucide-react';

const LoadingSpinner = () => (
  <div style={{ 
    display: 'flex', 
    flexDirection: 'column', 
    alignItems: 'center', 
    justifyContent: 'center', 
    height: '100vh', 
    width: '100%',
  }}>
    <Loader2 className="animate-spin" size={32} style={{ color: '#4a90e2' }} />
   
  </div>
);

export default LoadingSpinner;