import React from 'react';
import { Car, Map, BarChart3, Settings, Bell, User, Cloud, CloudOff, RefreshCw, Wifi, WifiOff, FileSpreadsheet, Shield, ChevronRight } from 'lucide-react';
import { GasConfig, UserProfile } from '../types';

interface NavbarProps {
  activeTab: 'trip' | 'summary' | 'history';
  onTabChange: (tab: 'trip' | 'summary' | 'history') => void;
  isOnline: boolean;
  queueCount: number;
  gasConfig: GasConfig;
  onOpenSettings: () => void;
  onForceSync: () => void;
  isSyncing: boolean;
  currentUser: UserProfile | null;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  isOnline,
  queueCount,
  gasConfig,
  onOpenSettings,
  onForceSync,
  isSyncing,
  currentUser,
  onLogout,
}) => {
  const isAdmin = currentUser?.email === 'junko223@gmail.com';

  return (
    <div className="relative overflow-hidden bg-gradient-to-b from-sky-100 via-sky-50 to-white pb-3">
      {/* Scenic background illustration header */}
      <div className="absolute top-0 left-0 right-0 h-36 bg-cover bg-center opacity-90 pointer-events-none" style={{ backgroundImage: `url('https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1200&q=80')` }}>
        <div className="absolute inset-0 bg-gradient-to-b from-sky-950/40 via-sky-900/20 to-sky-50/90 backdrop-blur-[0.5px]" />
      </div>

      <header className="relative z-10 max-w-4xl mx-auto px-4 pt-3 pb-2 flex items-center justify-between">
        {/* Logo & Title & Office */}
        <div className="flex items-center space-x-3">
          {/* Emblem / Garuda Crest simulation */}
          <div className="w-12 h-12 rounded-full bg-red-800 border-2 border-amber-400 text-amber-300 flex items-center justify-center shadow-md font-bold text-lg relative overflow-hidden shrink-0">
            <div className="absolute inset-0 bg-radial from-red-700 to-red-900" />
            <span className="relative z-10 text-xs tracking-tighter">🏛️</span>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg font-extrabold tracking-tight text-slate-900 drop-shadow-xs">
                Car Trip Tracker
              </h1>
              <span className="text-[10px] font-bold tracking-wider bg-blue-600 text-white px-2 py-0.5 rounded-full shadow-xs">
                {gasConfig.version || 'V5.3.9'}-Cloud
              </span>
            </div>
            <p className="text-xs font-medium text-slate-700">
              บันทึกเส้นทาง • เก็บทุกการเดินทางของคุณ
            </p>
            <p className="text-[11px] font-semibold text-blue-900">
              สำนักงานการศึกษาเอกชนอำเภอหะรัง
            </p>
          </div>
        </div>

        {/* Right Status Controls & Profile */}
        <div className="flex items-center space-x-2">
          {/* Notification Bell */}
          <button
            onClick={() => alert('ไม่มีการแจ้งเตือนใหม่')}
            className="w-10 h-10 rounded-full bg-white/90 backdrop-blur-md border border-slate-200 shadow-sm flex items-center justify-center text-slate-700 hover:bg-slate-50 transition-colors relative"
            title="การแจ้งเตือน"
          >
            <Bell className="w-4 h-4 text-slate-700" />
            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white animate-pulse" />
          </button>

          {/* User Profile Avatar */}
          <div
            onClick={onOpenSettings}
            className="w-10 h-10 rounded-full bg-blue-600 text-white shadow-md flex items-center justify-center font-bold text-sm cursor-pointer hover:bg-blue-700 transition-colors border-2 border-white"
            title={currentUser?.email || 'บัญชีผู้ใช้'}
          >
            {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : (currentUser?.email ? currentUser.email.charAt(0).toUpperCase() : 'J')}
          </div>
        </div>
      </header>

      {/* Quick 4 Feature Action Cards */}
      <div className="relative z-10 max-w-4xl mx-auto px-4 pt-2">
        <div className="grid grid-cols-4 gap-2.5">
          {/* 1. Vehicle */}
          <button
            onClick={() => onTabChange('trip')}
            className="bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-2xl p-2.5 text-center shadow-xs hover:shadow-md hover:border-blue-300 transition-all flex flex-col items-center group"
          >
            <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-1.5 group-hover:bg-blue-600 group-hover:text-white transition-colors shadow-2xs">
              <Car className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-slate-800 tracking-tight">ยานพาหนะ</span>
            <span className="text-[10px] text-slate-400 flex items-center mt-0.5">Vehicle <ChevronRight className="w-2.5 h-2.5 ml-0.5" /></span>
          </button>

          {/* 2. Map */}
          <button
            onClick={() => onTabChange('trip')}
            className="bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-2xl p-2.5 text-center shadow-xs hover:shadow-md hover:border-emerald-300 transition-all flex flex-col items-center group"
          >
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-1.5 group-hover:bg-emerald-600 group-hover:text-white transition-colors shadow-2xs">
              <Map className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-slate-800 tracking-tight">แผนที่</span>
            <span className="text-[10px] text-slate-400 flex items-center mt-0.5">Map <ChevronRight className="w-2.5 h-2.5 ml-0.5" /></span>
          </button>

          {/* 3. Statistics */}
          <button
            onClick={() => onTabChange('summary')}
            className={`bg-white/90 backdrop-blur-md border rounded-2xl p-2.5 text-center shadow-xs hover:shadow-md transition-all flex flex-col items-center group ${
              activeTab === 'summary' ? 'border-purple-500 ring-2 ring-purple-500/20' : 'border-slate-200/80 hover:border-purple-300'
            }`}
          >
            <div className="w-11 h-11 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mb-1.5 group-hover:bg-purple-600 group-hover:text-white transition-colors shadow-2xs">
              <BarChart3 className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-slate-800 tracking-tight">สถิติ</span>
            <span className="text-[10px] text-slate-400 flex items-center mt-0.5">Statistics <ChevronRight className="w-2.5 h-2.5 ml-0.5" /></span>
          </button>

          {/* 4. Settings */}
          <button
            onClick={onOpenSettings}
            className="bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-2xl p-2.5 text-center shadow-xs hover:shadow-md hover:border-amber-300 transition-all flex flex-col items-center group"
          >
            <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-1.5 group-hover:bg-amber-500 group-hover:text-white transition-colors shadow-2xs">
              <Settings className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-slate-800 tracking-tight">ตั้งค่า</span>
            <span className="text-[10px] text-slate-400 flex items-center mt-0.5">Settings <ChevronRight className="w-2.5 h-2.5 ml-0.5" /></span>
          </button>
        </div>
      </div>
    </div>
  );
};
