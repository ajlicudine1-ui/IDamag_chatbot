import React from "react";
import chatbotLogo from "../../assets/botbot.png";

const FloatingChatbotButton = ({ onClick }) => {
  return (
    <div
      className="
        fixed
        bottom-2
        right-2
        z-[9999]
        group
      "
    >
      {/* Hover Text */}
      <div
        className="
          absolute
          right-full
          top-1/2
          -translate-y-1/2
          mr-3

          opacity-0
          invisible
          translate-x-3

          group-hover:opacity-100
          group-hover:visible
          group-hover:translate-x-0

          bg-white
          text-[#176B3A]
          font-bold
          text-sm
          px-4
          py-2.5
          rounded-xl
          shadow-lg
          border
          border-slate-200

          whitespace-nowrap
          pointer-events-none

          transition-all
          duration-300
        "
      >
        Ask iDamag
      </div>

      {/* Chatbot */}
      <button
        onClick={onClick}
        aria-label="Open iDamag Chatbot"
        className="
          w-35
          h-35
          rounded-full
          bg-transparent
          border-0
          p-0
          hover:scale-110
          active:scale-95
          transition-all
          duration-300
        "
      >
        <img
          src={chatbotLogo}
          alt="iDamag Chatbot"
          className="
            w-full
            h-full
            object-contain
            rounded-full
          "
        />
      </button>
    </div>
  );
};

export default FloatingChatbotButton;