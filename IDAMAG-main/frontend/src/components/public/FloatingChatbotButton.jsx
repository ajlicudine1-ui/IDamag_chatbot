import React from "react";
import chatbotLogo from "../../assets/botbot.png";

const FloatingChatbotButton = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      aria-label="Open iDamag Chatbot"
      className="
        fixed
        bottom-8
        right-8
        z-[9999]
        w-30
        h-30
        rounded-full
        bg-transparent
        border-0
        p-0
        shadow-xl
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
  );
};

export default FloatingChatbotButton;