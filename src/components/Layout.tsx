import { useState } from "react";
import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";
import Button from "./ui/Button";

export default function Layout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navigation = [
    { name: "Bảng điều khiển", href: "/dashboard", icon: "📊" },
    { name: "Tải lên", href: "/upload", icon: "📤" },
    { name: "Thư viện nhãn", href: "/labels", icon: "🏷️" },
    { name: "Mẫu dữ liệu", href: "/samples", icon: "🎬" },
    { name: "Công việc", href: "/jobs", icon: "⚙️" }
  ];

  const NavItem = ({ item }: { item: typeof navigation[0] }) => (
    <NavLink
      to={item.href}
      className={({ isActive }) =>
        `group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
          isActive
            ? "bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-lg shadow-indigo-500/25"
            : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/60"
        }`
      }
      onClick={() => setSidebarOpen(false)}
    >
      <span className="mr-3 text-lg">{item.icon}</span>
      {item.name}
      <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </NavLink>
  );

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20">
      {/* Sidebar overlay for mobile and desktop when sidebar is open */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40"
          onClick={() => setSidebarOpen(false)}
        >
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm animate-fade-in" />
        </div>
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        <div className="flex flex-col h-full bg-white/80 backdrop-blur-xl border-r border-slate-200/60 shadow-xl">
          {/* Logo */}
          <div className="flex items-center h-16 px-6 border-b border-slate-200/50">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-cyan-500 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-lg">
                V
              </div>
              <div className="ml-3">
                <div className="text-slate-800 font-semibold text-lg">VOYA</div>
                <div className="text-slate-500 text-xs">Thu thập dữ liệu</div>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-2">
            {navigation.map((item) => (
              <NavItem key={item.name} item={item} />
            ))}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-slate-200/50">
            <div className="text-xs text-slate-500 text-center">
              Phiên bản 1.0.0 © 2024 Voya Inc.
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white/60 backdrop-blur-xl border-b border-slate-200/60 px-4 lg:px-8 h-16 flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="btn btn-ghost p-2 text-slate-600 hover:text-slate-900"
              aria-label="Toggle sidebar"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="hidden lg:block">
              <h1 className="text-xl font-semibold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
                Quản lý dữ liệu
              </h1>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="hidden sm:flex items-center space-x-2">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
              <span className="text-sm text-slate-600">Đã kết nối</span>
            </div>
            
            {/* Theme and Settings */}
            <div className="flex items-center gap-2">
              <button
                className="btn btn-ghost p-2 text-slate-600 hover:text-slate-900"
                title="Toggle theme"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              </button>
              
              <button
                className="btn btn-ghost p-2 text-slate-600 hover:text-slate-900"
                title="Settings"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
            
            <Button size="sm">Phiên mới</Button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-8">
          <div className="max-w-7xl mx-auto animate-fade-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
