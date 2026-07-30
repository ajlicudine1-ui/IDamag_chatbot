import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import logo from "../../assets/dalogo.png";

const Header = () => {
  const location = useLocation();
  const isHomePage = location.pathname === "/";

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Close menu whenever route changes
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200 py-4 px-6 md:px-12 flex items-center justify-between">
      
      {/* LEFT SIDE - LOGO */}
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

      {/* RIGHT SIDE */}
      <div className="flex items-center">
        {isHomePage && (
          <div ref={menuRef} className="relative">

            {/* HAMBURGER BUTTON */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="
                flex
                items-center
                justify-center
                w-11
                h-11
                rounded-xl
                text-slate-700
                hover:text-moss-600
                hover:bg-slate-100
                transition-all
                duration-300
                active:scale-95
              "
              aria-label="Open menu"
            >
              {menuOpen ? (
                <X className="w-7 h-7" strokeWidth={2.5} />
              ) : (
                <Menu className="w-8 h-8" strokeWidth={3} />
              )}
            </button>

            {/* DROPDOWN MENU */}
            {menuOpen && (
              <div
                className="
                  absolute
                  right-0
                  top-14
                  w-52
                  bg-white
                  rounded-2xl
                  shadow-xl
                  border
                  border-slate-200
                  overflow-hidden
                  py-2
                  animate-in
                  fade-in
                  zoom-in-95
                  duration-200
                "
              >
                {/* FEEDBACK */}
                <Link
                  to="/feedback"
                  onClick={() => setMenuOpen(false)}
                  className="
                    block
                    px-5
                    py-3
                    text-sm
                    font-semibold
                    text-slate-700
                    hover:bg-moss-600
                    hover:text-white
                    transition-colors
                  "
                >
                  Feedback
                </Link>

                {/* ABOUT US */}
                <Link
                  to="/about"
                  onClick={() => setMenuOpen(false)}
                  className="
                    block
                    px-5
                    py-3
                    text-sm
                    font-semibold
                    text-slate-700
                    hover:bg-moss-600
                    hover:text-white
                    transition-colors
                  "
                >
                  About Us
                </Link>

                {/* USER GUIDE */}
                <Link
                  to="/user-guide"
                  onClick={() => setMenuOpen(false)}
                  className="
                    block
                    px-5
                    py-3
                    text-sm
                    font-semibold
                    text-slate-700
                    hover:bg-moss-600
                    hover:text-white
                    transition-colors
                  "
                >
                  User Guide
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;