import React from 'react';

interface LoadingScreenProps {
  hotelName: string;
  hotelStars: string;
  title: string;
  subtitle: string;
  bgImage?: string;
}

export default function LoadingScreen({
  hotelName,
  hotelStars,
  title,
  subtitle,
  bgImage
}: LoadingScreenProps) {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden bg-[#050505] font-['Montserrat',sans-serif] text-white">
      {/* Background Gradient or Image */}
      {bgImage ? (
        <div className="absolute inset-0 z-10">
          <img src={bgImage} alt="Background" className="w-full h-full object-cover opacity-60" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/30"></div>
        </div>
      ) : (
        <div 
          className="absolute inset-0 z-10"
          style={{ background: 'radial-gradient(circle at center, #1a1a1a 0%, #000000 70%)' }}
        ></div>
      )}

      <div className="relative z-20 flex flex-col items-center text-center">
        {/* Hotel Brand */}
        <div 
          className="font-['Cinzel',serif] text-5xl font-semibold tracking-[0.2em] mb-2 drop-shadow-lg"
          style={{
            background: 'linear-gradient(to right, #996515, #F3E5AB, #996515)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            animation: 'fadeIn 2s ease-out'
          }}
        >
          {hotelName}
        </div>
        
        <div 
          className="text-[#D4AF37] text-xl tracking-[0.3em] mb-16 drop-shadow-md"
          style={{ animation: 'fadeIn 2.5s ease-out' }}
        >
          {hotelStars}
        </div>

        {/* Elegant Loader */}
        <div className="relative w-20 h-20 mb-8">
          {/* Outer circle */}
          <div 
            className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#D4AF37]"
            style={{
              borderLeftColor: 'rgba(212, 175, 55, 0.1)',
              borderRightColor: 'rgba(212, 175, 55, 0.1)',
              borderBottomColor: 'rgba(212, 175, 55, 0.1)',
              animation: 'spin 1.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite'
            }}
          ></div>
          {/* Inner circle */}
          <div 
            className="absolute top-[10px] left-[10px] right-[10px] bottom-[10px] rounded-full border-2 border-transparent border-b-[#F3E5AB]"
            style={{
              borderLeftColor: 'rgba(212, 175, 55, 0.1)',
              borderRightColor: 'rgba(212, 175, 55, 0.1)',
              borderTopColor: 'rgba(212, 175, 55, 0.1)',
              animation: 'spin-reverse 2s linear infinite'
            }}
          ></div>
        </div>

        {/* Text */}
        <div 
          className="text-xl font-light tracking-[0.15em] text-[#e0e0e0] mb-2"
          style={{ animation: 'pulseText 2s infinite' }}
        >
          {title}
        </div>
        <div className="text-sm font-light tracking-[0.05em] text-gray-400 max-w-2xl px-4 whitespace-nowrap sm:whitespace-normal">
          {subtitle}
        </div>
      </div>

      {/* Global Styles for Animations that Tailwind doesn't have by default */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&family=Montserrat:wght@300;400;600&display=swap');
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes spin-reverse {
          0% { transform: rotate(360deg); }
          100% { transform: rotate(0deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulseText {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
