import React from 'react';

const Hero = () => {
  return (
    <section className="relative w-full overflow-hidden">
      {/* Background Image - Full Display */}
      <img 
        src="/i-damag.png" 
        className="w-full h-auto block" 
        alt="Hero Background"
      />

      {/* Action Button - Centered Overlay */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="translate-y-4 sm:translate-y-8 md:translate-y-12 lg:translate-y-16">
          <a 
            href="#links" 
            className="inline-flex items-center gap-2 md:gap-3 bg-[#106837] hover:bg-[#0d542c] text-white text-base md:text-xl font-bold py-2 px-4 md:py-4 md:px-8 lg:py-5 lg:px-10 rounded-2xl transition-all duration-300 transform hover:scale-105 shadow-2xl hover:shadow-[#106837]/40"
          >
            Explore Divisions
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 md:h-6 md:w-6" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
};

export default Hero;
