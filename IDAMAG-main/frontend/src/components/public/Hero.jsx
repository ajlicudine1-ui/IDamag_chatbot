import React from "react";

const Hero = () => {
  return (
    <section
      className="
        relative
        w-full
        overflow-hidden
        bg-white
      "
    >
      {/* HERO IMAGE */}
      <img
        src="/i-damag.png"
        alt="I-DAMAG Background"
        className="
          block
          w-full
          h-auto
          max-w-none
          object-contain
          select-none
          pointer-events-none
        "
      />

      {/* EXPLORE DIVISIONS BUTTON */}
      <div
        className="
          absolute
          inset-0
          flex
          items-center
          justify-center
          pointer-events-none
        "
      >
        <div
          className="
            translate-y-[18%]
            pointer-events-auto
          "
        >
          <a
            href="#links"
            className="
              inline-flex
              items-center
              justify-center

              gap-2
              md:gap-3

              bg-[#106837]
              hover:bg-[#0d542c]

              text-white
              font-bold

              text-sm
              sm:text-base
              md:text-xl

              px-4
              py-2

              sm:px-6
              sm:py-3

              md:px-8
              md:py-4

              lg:px-10
              lg:py-5

              rounded-2xl

              transition-all
              duration-300

              hover:scale-105

              shadow-2xl
              hover:shadow-[#106837]/40
            "
          >
            Explore Divisions

            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="
                w-4
                h-4
                md:w-6
                md:h-6
              "
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
};

export default Hero;