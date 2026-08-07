import React from 'react';
import { Link } from 'react-router-dom';
import * as Icons from '../icons/OfficeIcons';

const OfficeCard = ({ office }) => {
  const { id, name, acronym, iconName } = office;
  const Icon = Icons[iconName];

  return (
    <Link 
      to={`/office/${id}`}
      className="group relative px-8 py-6 rounded-[2.5rem] border-2 border-slate-100 bg-white transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-2 hover:shadow-[0_30px_60px_-12px_rgba(74,93,35,0.15)] hover:border-moss-200 flex flex-col h-full overflow-hidden cursor-pointer"
    >
      {/* Decorative background element */}
      <div className="absolute -right-4 -top-4 w-24 h-24 bg-moss-50 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-700 blur-2xl"></div>
      
      <div className="relative z-10 flex items-start gap-6">
        {/* Icon Section */}
        <div className="shrink-0 relative w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-500 group-hover:scale-110 bg-moss-50 group-hover:bg-moss-100 shadow-sm">
          {Icon ? (
            <Icon className="w-8 h-8 text-moss-600 transition-colors duration-300" />
          ) : (
            <div className="w-8 h-8 bg-moss-200 rounded-full animate-pulse" />
          )}
        </div>
        
        {/* Text Section (Name + Acronym) */}
        <div className="flex flex-col items-start gap-1.5 pt-1">
          <h3 className="text-xl font-black text-slate-900 group-hover:text-moss-900 transition-colors duration-300 leading-tight">
            {name}
          </h3>
          {acronym && (
            <div className="inline-block px-2.5 py-0.5 rounded-md bg-moss-50 text-moss-700 text-[9px] font-black uppercase tracking-[0.15em]">
              {acronym}
            </div>
          )}
        </div>
      </div>

      {/* Subtle indicator */}
      <div className="mt-auto pt-6 flex items-center gap-2 text-moss-600 font-bold text-sm opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0">
        <span>Enter Subcategories</span>
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
        </svg>
      </div>
    </Link>
  );
};

export default OfficeCard;
