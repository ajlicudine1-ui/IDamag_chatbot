import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import logo from '../../assets/dalogo.png';

const Header = () => {
  const location = useLocation();
  const isHomePage = location.pathname === '/';

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200 py-4 px-6 md:px-12 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Link to="/" className="flex items-center gap-4 group">
          <img 
            src={logo} 
            alt="DA Logo" 
            className="w-12 h-12 object-contain transition-transform duration-500 group-hover:rotate-12"
          />
          <div className="flex flex-col">
            <span className="text-xl font-bold text-slate-900 tracking-tight leading-none group-hover:text-moss-600 transition-colors">
              Department of Agriculture - RFO I
            </span>
            <span className="text-[10px] text-slate-500 font-medium uppercase tracking-widest mt-1">
              ILOCOS DAMAG
            </span>
          </div>
        </Link>
      </div>
      <div className="flex items-center gap-3">
        {isHomePage && (
          <>
            <Link
              to="/feedback"
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-50 text-slate-600 hover:bg-moss-600 hover:text-white rounded-2xl font-bold text-sm transition-all duration-300 shadow-sm hover:shadow-lg hover:shadow-moss-600/20 active:scale-95 group"
            >
              Feedback
            </Link>

            <Link
              to="/login"
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-50 text-slate-600 hover:bg-moss-600 hover:text-white rounded-2xl font-bold text-sm transition-all duration-300 shadow-sm hover:shadow-lg hover:shadow-moss-600/20 active:scale-95 group"
            >
              Login
            </Link>
          </>
        )}
      </div>
    </header>
  );
};

export default Header;
