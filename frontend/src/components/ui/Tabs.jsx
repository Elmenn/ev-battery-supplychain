import React from "react";

/**
 * Simple Tabs component
 */
export const Tabs = ({ children, defaultTab = 0 }) => {
  const [activeTab, setActiveTab] = React.useState(defaultTab);
  
  // Extract Tab components and their props
  const tabs = React.Children.toArray(children).filter(
    child => React.isValidElement(child) && child.type === Tab
  );
  
  const activeTabContent = tabs[activeTab]?.props?.children;

  return (
    <div className="tabs-container">
      <div className="flex border-b border-gray-200 mb-4">
        {tabs.map((tab, index) => (
          <button
            key={index}
            onClick={() => setActiveTab(index)}
            className={`px-6 py-3 font-medium text-sm transition-colors ${
              activeTab === index
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-600 hover:text-gray-900 hover:border-b-2 hover:border-gray-300"
            }`}
          >
            {tab.props.label}
          </button>
        ))}
      </div>
      <div className="tab-content">
        {activeTabContent}
      </div>
    </div>
  );
};

export const Tab = ({ label, children }) => {
  // Tab is a marker component - Tabs parent extracts props and renders content
  // Returning null prevents double-rendering of children
  return null;
};

