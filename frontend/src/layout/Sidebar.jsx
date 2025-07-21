import React from 'react';
import './Sidebar.css';

function Sidebar({ currentTab, setCurrentTab }) {
  const tabs = ['Marketplace', 'My Activity', 'Verify VC'];

  return (
    <div className="sidebar">
      <h2>EV Dashboard</h2>
      {tabs.map((tab) => (
        <button
          key={tab}
          className={tab === currentTab ? 'active' : ''}
          onClick={() => setCurrentTab(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

export default Sidebar;
