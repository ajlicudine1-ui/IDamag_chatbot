import React, { useRef, useState } from "react";
import chatbotLogo from "../../assets/botbot.png";

const FloatingChatbotButton = ({
  onClick,
  isOpen,
  position,
  setPosition,
}) => {
  const [isDragging, setIsDragging] =
    useState(false);

  const dragStart = useRef({
    pointerX: 0,
    pointerY: 0,
    startX: 0,
    startY: 0,
  });

  const hasDragged = useRef(false);

  const getButtonSize = () => {
    if (window.innerWidth >= 1024) {
      return 144;
    }

    if (window.innerWidth >= 640) {
      return 128;
    }

    return 112;
  };

  const clampPosition = (x, y) => {
    const buttonSize = getButtonSize();

    const maxX = Math.max(
      0,
      window.innerWidth - buttonSize
    );

    const maxY = Math.max(
      0,
      window.innerHeight - buttonSize
    );

    return {
      x: Math.max(0, Math.min(x, maxX)),
      y: Math.max(0, Math.min(y, maxY)),
    };
  };

  const handlePointerDown = (event) => {
    // Only react to the main mouse button.
    if (
      event.pointerType === "mouse" &&
      event.button !== 0
    ) {
      return;
    }

    event.preventDefault();

    hasDragged.current = false;

    dragStart.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      startX: position.x,
      startY: position.y,
    };

    setIsDragging(true);

    event.currentTarget.setPointerCapture(
      event.pointerId
    );
  };

  const handlePointerMove = (event) => {
    if (!isDragging) {
      return;
    }

    const deltaX =
      event.clientX -
      dragStart.current.pointerX;

    const deltaY =
      event.clientY -
      dragStart.current.pointerY;

    if (
      Math.abs(deltaX) > 5 ||
      Math.abs(deltaY) > 5
    ) {
      hasDragged.current = true;
    }

    const nextPosition = clampPosition(
      dragStart.current.startX + deltaX,
      dragStart.current.startY + deltaY
    );

    setPosition(nextPosition);
  };

  const finishDrag = (event) => {
    if (!isDragging) {
      return;
    }

    setIsDragging(false);

    try {
      if (
        event.currentTarget.hasPointerCapture(
          event.pointerId
        )
      ) {
        event.currentTarget.releasePointerCapture(
          event.pointerId
        );
      }
    } catch {
      // Pointer capture may already be released.
    }

    // A short press/click opens or closes the chatbot.
    // A real drag only moves the chat head.
    if (!hasDragged.current) {
      onClick();
    }
  };

  return (
    <div
      className="
        fixed
        z-[9999]
        group
      "
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        touchAction: "none",
      }}
    >
      {/* Hover textbox - shown only while closed */}
      {!isOpen && !isDragging && (
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

      <button
        type="button"
        aria-label={
          isOpen
            ? "Close iDamag Chatbot"
            : "Open iDamag Chatbot"
        }
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        className={`
          rounded-full

          bg-transparent
          border-0
          p-0

          select-none

          ${
            isDragging
              ? "cursor-grabbing scale-105"
              : "cursor-grab"
          }

          transition-transform
          duration-150

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
          draggable="false"
          className="
            w-full
            h-full
            object-contain
            rounded-full
            pointer-events-none
            select-none
          "
        />
      </button>
    </div>
  );
};

export default FloatingChatbotButton;
