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
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target)
      ) {
        setMenuOpen(false);
      }
    };

    document.addEventListener(
      "mousedown",
      handleClickOutside
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleClickOutside
      );
    };
  }, []);

  // Close menu whenever route changes
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <header
      className="
        sticky
        top-0
        z-50

        flex
        items-center
        justify-between

        border-b
        border-slate-200

        bg-white/90
        backdrop-blur-md

        px-5
        py-4

        md:px-10
        lg:px-14
      "
    >
      {/* LEFT SIDE */}
      <div className="flex min-w-0 items-center">
        <Link
          to="/"
          className="
            group
            flex
            min-w-0
            items-center
            gap-4
          "
        >
          {/* LOGO */}
          <img
            src={logo}
            alt="Department of Agriculture Logo"
            className="
              h-14
              w-14
              shrink-0
              object-contain

              transition-transform
              duration-500

              group-hover:rotate-6

              sm:h-16
              sm:w-16
            "
          />

          {/* TEXT */}
          <div className="flex min-w-0 flex-col">
            {/* MAIN TITLE */}
            <span
              className="
                whitespace-nowrap

                text-[20px]
                font-extrabold
                leading-tight
                tracking-[-0.03em]
                text-slate-900

                transition-colors

                group-hover:text-[#235E26]

                sm:text-[24px]
                md:text-[27px]
                lg:text-[30px]
              "
            >
              DEPARTMENT OF AGRICULTURE - RFO1
            </span>

            {/* IDAMAG MEANING */}
            <div
              className="
                mt-1

                flex
                flex-wrap
                items-baseline

                text-[9px]
                font-semibold
                uppercase
                leading-none
                tracking-[0.035em]
                text-slate-500

                sm:text-[10px]
                md:text-[11px]
              "
            >
              <span
                className="
                  text-[14px]
                  font-black
                  text-[#235E26]

                  sm:text-[16px]
                  md:text-[17px]
                "
              >
                I
              </span>

              <span>locos-</span>

              <span
                className="
                  text-[14px]
                  font-black
                  text-[#235E26]

                  sm:text-[16px]
                  md:text-[17px]
                "
              >
                D
              </span>

              <span>ata and&nbsp;</span>

              <span
                className="
                  text-[14px]
                  font-black
                  text-[#235E26]

                  sm:text-[16px]
                  md:text-[17px]
                "
              >
                A
              </span>

              <span>nalytics&nbsp;</span>

              <span
                className="
                  text-[14px]
                  font-black
                  text-[#235E26]

                  sm:text-[16px]
                  md:text-[17px]
                "
              >
                M
              </span>

              <span>anagement for&nbsp;</span>

              <span
                className="
                  text-[14px]
                  font-black
                  text-[#235E26]

                  sm:text-[16px]
                  md:text-[17px]
                "
              >
                A
              </span>

              <span>gricultural&nbsp;</span>

              <span
                className="
                  text-[14px]
                  font-black
                  text-[#235E26]

                  sm:text-[16px]
                  md:text-[17px]
                "
              >
                G
              </span>

              <span>ateway</span>
            </div>
          </div>
        </Link>
      </div>

      {/* RIGHT SIDE */}
      <div className="flex items-center">
        {isHomePage && (
          <div
            ref={menuRef}
            className="relative"
          >
            {/* HAMBURGER BUTTON */}
            <button
              type="button"
              onClick={() =>
                setMenuOpen(
                  (current) => !current
                )
              }
              className="
                flex
                h-11
                w-11
                items-center
                justify-center

                rounded-xl

                text-slate-700

                transition-all
                duration-300

                hover:bg-slate-100
                hover:text-[#235E26]

                active:scale-95
              "
              aria-label={
                menuOpen
                  ? "Close menu"
                  : "Open menu"
              }
            >
              {menuOpen ? (
                <X
                  className="h-7 w-7"
                  strokeWidth={2.5}
                />
              ) : (
                <Menu
                  className="h-8 w-8"
                  strokeWidth={3}
                />
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

                  overflow-hidden

                  rounded-2xl

                  border
                  border-slate-200

                  bg-white

                  py-2

                  shadow-xl

                  animate-in
                  fade-in
                  zoom-in-95
                  duration-200
                "
              >
                {/* FEEDBACK */}
                <Link
                  to="/feedback"
                  onClick={() =>
                    setMenuOpen(false)
                  }
                  className="
                    block

                    px-5
                    py-3

                    text-sm
                    font-semibold
                    text-slate-700

                    transition-colors

                    hover:bg-[#235E26]
                    hover:text-white
                  "
                >
                  Feedback
                </Link>

                {/* ABOUT US */}
                <Link
                  to="/about"
                  onClick={() =>
                    setMenuOpen(false)
                  }
                  className="
                    block

                    px-5
                    py-3

                    text-sm
                    font-semibold
                    text-slate-700

                    transition-colors

                    hover:bg-[#235E26]
                    hover:text-white
                  "
                >
                  About Us
                </Link>

                {/* USER GUIDE */}
                <Link
                  to="/user-guide"
                  onClick={() =>
                    setMenuOpen(false)
                  }
                  className="
                    block

                    px-5
                    py-3

                    text-sm
                    font-semibold
                    text-slate-700

                    transition-colors

                    hover:bg-[#235E26]
                    hover:text-white
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