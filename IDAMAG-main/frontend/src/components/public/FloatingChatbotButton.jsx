import React from "react";
import chatbotLogo from "../../assets/botbot.png";

const FloatingChatbotButton = ({ onClick, isOpen }) => {
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
      {/* Hover Textbox - ONLY show when chatbot is CLOSED */}
      {!isOpen && (
        <div
          className="
            absolute
            bottom-[92%]
            right-2

            w-[300px]
            bg-white

            border-2
            border-[#235E26]
            rounded-[18px]

            px-[18px]
            py-[14px]

            text-[#235E26]
            text-[17px]
            font-bold
            leading-[1.4]
            text-left

            shadow-md

            opacity-0
            invisible

            group-hover:opacity-100
            group-hover:visible

            transition-all
            duration-200

            pointer-events-none
          "
        >
          Ask iDamag anything! 🤖

          {/* Pointed Bottom-Right Edge */}
          <div
            className="
              absolute
              -bottom-[11px]
              right-[25px]

              w-5
              h-5

              bg-white

              border-r-2
              border-b-2
              border-[#235E26]

              rotate-45
            "
          />
        </div>
      )}

      {/* Chatbot Button */}
      <button
        type="button"
        onClick={onClick}
        aria-label={
          isOpen
            ? "Close iDamag Chatbot"
            : "Open iDamag Chatbot"
        }
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