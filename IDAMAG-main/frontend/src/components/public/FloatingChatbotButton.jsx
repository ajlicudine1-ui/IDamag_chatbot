import React from "react";
import chatbotLogo from "../../assets/botbot.png";

const FloatingChatbotButton = ({ onClick, isOpen }) => {
  return (
    <div
      className={`
        fixed
        bottom-0
        z-[9999]
        group

        transition-all
        duration-300

        ${isOpen ? "right-0" : "right-4"}
      `}
    >
      {/* Hover Textbox - only when chatbot is closed */}
      {!isOpen && (
        <div
          className="
            absolute
            bottom-[92%]
            right-2

            w-[300px]
            max-w-[calc(100vw-32px)]

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
          Ask I-DAmag Chatbot anything!

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
        className={`
          rounded-full
          bg-transparent
          border-0
          p-0

          active:scale-95

          transition-all
          duration-300

          ${
            isOpen
              ? `
                w-28
                h-28
                sm:w-32
                sm:h-32
              `
              : `
                w-28
                h-28
                sm:w-32
                sm:h-32
                lg:w-36
                lg:h-36
                hover:scale-105
              `
          }
        `}
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