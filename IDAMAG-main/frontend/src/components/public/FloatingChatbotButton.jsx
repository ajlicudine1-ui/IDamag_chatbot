import React from "react";
import chatbotLogo from "../../assets/botbot.png";

const FloatingChatbotButton = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      className="
        fixed
        bottom-8
        right-8
        z-[9999]
        w-20
        h-20
        rounded-full
        bg-[#1F2A7A]
        border-4
        border-white
        shadow-2xl
        hover:scale-110
        active:scale-95
        transition-all
        duration-300
        overflow-hidden
      "
    >
      <img
        src={chatbotLogo}
        alt="iDamag Chatbot"
        className="w-full h-full object-cover"
      />

      {/* Question Badge */}
      <div
        className="
          absolute
          -top-1
          -right-1
          w-7
          h-7
          rounded-full
          bg-[#D8A700]
          border-2
          border-white
          flex
          items-center
          justify-center
          text-white
          font-bold
          text-sm
        "
      >
        ?
      </div>
    </button>
  );
};

export default FloatingChatbotButton;