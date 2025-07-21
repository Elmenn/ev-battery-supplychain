import React from 'react';
import './Header.css';

function Header({ currentTab }) {
  return (
    <div className="app-header">
      <h1>{currentTab}</h1>
    </div>
  );
}

export default Header;
