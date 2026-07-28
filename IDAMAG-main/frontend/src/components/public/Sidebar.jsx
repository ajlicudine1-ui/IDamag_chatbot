import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import { offices } from '../../constants/offices';
import * as Icons from '../icons/OfficeIcons';

import { X, ChevronLeft, ChevronRight, Layers } from 'lucide-react';

function Sidebar({ 
  activeOfficeId, 
  isCollapsed, 
  isOpen, 
  onClose, 
  isManualCollapsed, 
  setIsManualCollapsed,
  divisions = [],
  selectedDivision,
  setSelectedDivision
}) {
  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 md:hidden transition-opacity duration-300"
          onClick={onClose}
        />
      )}

      <aside className={`
        fixed inset-y-0 left-0 z-50 
        ${isOpen ? 'translate-x-0' : '-translate-x-full'} 
        md:relative md:translate-x-0
        ${isCollapsed ? 'md:w-20' : 'md:w-80'} 
        w-72 h-full bg-white border-r border-slate-200 flex flex-col flex-shrink-0 transition-all duration-500 ease-in-out
      `}>
        {/* Mobile Close Button */}
        <div className="md:hidden absolute right-[-48px] top-4">
          <button 
            onClick={onClose}
            className="p-2.5 bg-white rounded-xl shadow-xl border border-slate-100 text-slate-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Manual Collapse Toggle - Desktop Only */}
        <button 
          onClick={() => setIsManualCollapsed(!isManualCollapsed)}
          className="hidden md:flex absolute -right-3 top-24 w-6 h-6 bg-white border border-slate-200 rounded-full items-center justify-center text-slate-400 hover:text-moss-600 hover:border-moss-200 hover:shadow-md transition-all z-10"
        >
          {isManualCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>

        <div className={`p-5 mb-4 border-b border-slate-100 ${isCollapsed ? 'md:flex md:justify-center' : 'p-8'}`}>
          <Link 
            to="/"
            onClick={() => { if (window.innerWidth < 768) onClose(); }}
            className={`flex items-center gap-3 text-slate-800 hover:text-moss-600 transition-colors group ${isCollapsed ? 'md:justify-center' : ''}`}
            title={isCollapsed ? "Home" : ""}
          >
            <div className="w-10 h-10 bg-moss-50 rounded-xl flex items-center justify-center group-hover:bg-moss-100 transition-colors flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-moss-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </div>
            {(!isCollapsed || window.innerWidth < 768) && <span className="text-xl font-bold tracking-tight">Home</span>}
          </Link>
        </div>

        <nav className={`flex-grow overflow-y-auto pb-8 custom-scrollbar ${isCollapsed ? 'md:px-2' : 'px-4'}`}>
          <div className="space-y-2">
            {(!isCollapsed || window.innerWidth < 768) && (
              <p className="px-4 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-4">Offices</p>
            )}
            
            {offices.map((office) => {
              const IconComponent = Icons[office.iconName];
              const isActive = activeOfficeId === office.id;
              return (
                <div key={office.id} className="space-y-1">
                  <NavLink
                    to={`/office/${office.id}`}
                    onClick={(e) => { 
                      if (isActive) {
                        e.preventDefault(); // Don't reload if already there
                      }
                      if (window.innerWidth < 768) onClose(); 
                    }}
                    title={isCollapsed ? office.acronym : ""}
                    className={`
                      flex items-center rounded-2xl transition-all duration-300 group
                      ${isCollapsed ? 'md:justify-center md:p-2' : 'gap-4 px-4 py-3'}
                      ${isActive 
                        ? 'bg-moss-600 text-white shadow-lg shadow-moss-600/20' 
                        : 'text-slate-600 hover:bg-moss-50 hover:text-moss-700'
                      }
                      ${!isCollapsed || window.innerWidth < 768 ? 'gap-4 px-4 py-3' : ''}
                    `}
                  >
                    <div className={`
                      w-10 h-10 rounded-xl flex items-center justify-center transition-colors flex-shrink-0
                      ${isActive ? 'bg-white/20' : 'bg-slate-50 group-hover:bg-white'}
                    `}>
                      {IconComponent && <IconComponent className={`w-5 h-5 ${isActive ? 'text-white' : 'text-moss-600'}`} />}
                    </div>
                    
                    {(!isCollapsed || window.innerWidth < 768) && (
                      <div className="flex flex-col min-w-0">
                        <span className="font-bold text-sm leading-tight truncate">{office.acronym}</span>
                        <span className={`text-[10px] truncate ${isActive ? 'text-white/70' : 'text-slate-400'}`}>
                          {office.name}
                        </span>
                      </div>
                    )}
                  </NavLink>

                  {/* Sections List for Active Office */}
                  {isActive && !isCollapsed && divisions.length > 0 && (
                    <div className="pl-6 space-y-1 animate-in slide-in-from-top-2 duration-300">
                      <div className="space-y-1 pr-2">
                        {divisions.map((division) => (
                          <button
                            key={division.id}
                            onClick={() => {
                              setSelectedDivision(division);
                              if (window.innerWidth < 768) onClose();
                            }}
                            className={`
                              w-full text-left px-4 py-2.5 rounded-xl text-xs font-bold transition-all relative overflow-hidden
                              ${selectedDivision?.id === division.id 
                                ? 'bg-moss-50 text-moss-700' 
                                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}
                            `}
                          >
                            <span className="relative z-10">{division.name}</span>
                            {selectedDivision?.id === division.id && (
                              <div className="absolute left-0 top-1/4 bottom-1/4 w-0.5 bg-moss-600 rounded-full" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </nav>
      </aside>
    </>
  );
}

export default Sidebar;
