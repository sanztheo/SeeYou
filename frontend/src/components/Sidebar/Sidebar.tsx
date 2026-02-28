import { useState } from "react";

interface SidebarProps {
  children?: React.ReactNode;
}

export function Sidebar({ children }: SidebarProps): React.ReactElement {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className={`fixed top-0 left-0 h-full z-10 transition-all duration-300 ${
        collapsed ? "w-12" : "w-72"
      } bg-gray-900/95 backdrop-blur-sm border-r border-gray-700/50 flex flex-col`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-700/50">
        {!collapsed && (
          <h1 className="text-sm font-bold tracking-[0.3em] text-gray-100 uppercase">
            SeeYou
          </h1>
        )}
        <button
          onClick={() => setCollapsed((prev) => !prev)}
          className="p-1.5 rounded hover:bg-gray-700/50 text-gray-400 hover:text-gray-200 transition-colors"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`w-4 h-4 transition-transform ${collapsed ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
      </div>

      {/* Content */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto p-3">{children}</div>
      )}
    </div>
  );
}
