import React from "react";
import chatbotLogo from "../../assets/botbot.png";

const FloatingChatbotButton = ({ onClick }) => {
  return (
    <div
      className="
        fixed
        bottom-4
        right-4
        z-[9999]
        group
      "
    >
      {/* Speech Bubble */}
      <div
        className="
          absolute
          bottom-full
          left-1/2
          -translate-x-1/2
          mb-2

          w-65
          bg-white
          text-[#1F2A7A]
          font-bold
          text-base
          leading-snug
          px-3
          py-2

          rounded-2xl
          border-2
          border-[#1F2A7A]
          shadow-lg

          opacity-0
          invisible

          group-hover:opacity-100
          group-hover:visible

          transition-all
          duration-300
          pointer-events-none
        "
      >
        Hi! Need help with iDamag?
        <br />
        Ask me anything. 🤖

        {/* Bubble Tail */}
        <div
          className="
            absolute
            -bottom-[9px]
            left-1/2
            -translate-x-1/2

            w-3
            h-3
            bg-white

            border-r-2
            border-b-2
            border-[#1F2A7A]

            rotate-45
          "
        />
      </div>

      {/* Chatbot Button */}
      <button
        onClick={onClick}
        aria-label="Open iDamag Chatbot"
        className="
          w-36
          h-36
          rounded-full
          bg-transparent
          border-0
          p-0

          hover:scale-105
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