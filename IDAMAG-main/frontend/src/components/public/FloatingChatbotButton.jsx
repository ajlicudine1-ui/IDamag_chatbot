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
      {/* Hover Textbox */}
      <div
        className="
          absolute
          bottom-full
          right-0
          mb-2

          w-[300px]
          bg-white

          border-2
          border-[#1D2C8C]
          rounded-[18px]

          px-[18px]
          py-[14px]

          text-[#1D2C8C]
          text-[17px]
          font-bold
          leading-[1.4]
          text-left

          shadow-sm

          opacity-0
          invisible

          group-hover:opacity-100
          group-hover:visible

          transition-all
          duration-200

          pointer-events-none
        "
      >
        Need help? Ask iDamag anything! 🤖
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