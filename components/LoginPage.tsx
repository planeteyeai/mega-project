import React, { useState, useEffect } from 'react';

import { Satellite, Sprout, Droplets, Activity, Bug, ArrowRight, Lock, User, Scan, Globe, Radio, Eye } from 'lucide-react';
import RealEarth from './RealEarth';
import CommonSpinner from './CommonSpinner';

interface LoginPageProps {
  onLogin: (user: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoginLoading, setIsLoginLoading] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState('');

  // Intro Sequence Effect
  useEffect(() => {
    // Phase 1: 3 seconds of high-speed rotation and scanning
    const timer = setTimeout(() => {
      setIsInitializing(false);
      
      // Small delay after initialization state clears to fade in login
      setTimeout(() => {
        setShowLogin(true);
      }, 500); // 500ms transition time
      
    }, 3000);
    return () => clearTimeout(timer);
  }, []);


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!username || !password) {
      setError('Please enter both username and password');
      return;
    }

    // Check credentials
    const userKey = username.trim();
    const validUsers: { user: string; pass: string }[] = [
      { user: 'Admin', pass: 'farm123' },
      { user: 'sugarcane', pass: 'sugarcane@123' },
    ];
    const matched = validUsers.find(
      (u) => u.user.toLowerCase() === userKey.toLowerCase() && u.pass === password
    );
    if (matched) {
      setIsLoginLoading(true);
      // Simulation of connecting to satellite
      setTimeout(() => {
        setIsLoginLoading(false);
        onLogin(matched.user);
      }, 2500);
    } else {
      setError('Invalid username or password');
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#020617] text-white flex items-center justify-center font-sans perspective-1000 animate-fadeIn">
      

      {/* === BACKGROUND LAYER === */}
      <div className="absolute inset-0 bg-[#020617] z-0">
         {/* Green Ambient Glow on the Right Side */}
        <div className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/4 w-[800px] h-[800px] bg-[radial-gradient(circle,rgba(16,185,129,0.12)_0%,rgba(6,78,59,0.05)_50%,transparent_70%)] pointer-events-none"></div>
         {/* Blue Ambient Glow on the Left Side */}
        <div className="absolute top-1/2 left-0 -translate-y-1/2 -translate-x-1/4 w-[800px] h-[800px] bg-[radial-gradient(circle,rgba(59,130,246,0.08)_0%,transparent_70%)] pointer-events-none"></div>
      </div>
      {/* === EARTH & SATELLITE CONTAINER === */}
      <div 
        className={`absolute inset-0 flex items-center justify-center transition-all duration-[2000ms] ease-in-out z-0
          ${showLogin 
            ? 'scale-100 opacity-30 blur-[1px]' // Phase 2: Slow, faded, background
            : 'scale-[1.2] opacity-100' // Phase 1: Large, centered, focused
          }
        `}
      >
         <div className="relative w-[450px] h-[450px] md:w-[650px] md:h-[650px] flex items-center justify-center">
            

            {/* Cesium Globe */}
            <div className="absolute inset-0 rounded-full shadow-[0_0_120px_rgba(59,130,246,0.3)] overflow-hidden">
                <RealEarth slow={showLogin} />
            </div>
            {/* SCANNING RINGS (Phase 1 Only) */}
            {!showLogin && (
              <>
                <div className="absolute inset-0 rounded-full border border-cyan-400/30 animate-ripple"></div>
                <div className="absolute inset-0 rounded-full border border-cyan-400/20 animate-ripple-delayed"></div>
              </>
            )}
            {/* ORBITAL PATH & SATELLITE (Always Visible, persistent orbit) */}
            <div className="absolute inset-[-40px] md:inset-[-60px] rounded-full border border-dashed border-cyan-500/10 animate-spin-slow">
               {/* Satellite Icon on the ring */}
               <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 md:w-12 md:h-12 bg-[#020617] border border-cyan-400/50 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(45,212,191,0.6)]">
                  <Satellite className="w-4 h-4 md:w-6 md:h-6 text-cyan-300 transform -rotate-45" />
               </div>
            </div>
            
            {/* Counter-Rotating Tech Ring (Decorative) */}
            <div className="absolute inset-[-20px] md:inset-[-30px] rounded-full border-2 border-transparent border-t-cyan-500/20 border-b-cyan-500/20 animate-spin-reverse pointer-events-none"></div>
         </div>
      </div>
      {/* INITIALIZATION TEXT OVERLAY (Phase 1) */}
      <div 
        className={`absolute inset-0 z-50 flex flex-col items-center justify-center transition-opacity duration-500 ${isInitializing ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
         <div className="mt-[400px] md:mt-[500px] bg-black/60 backdrop-blur-md px-8 py-4 rounded-full border border-cyan-500/30 shadow-2xl flex flex-col items-center gap-2">
            <div className="flex items-center gap-3">
               <Scan className="w-5 h-5 text-cyan-400 animate-spin" />
               <span className="text-cyan-300 font-mono tracking-[0.2em] font-bold">SYSTEM INITIALIZING</span>
            </div>
            <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></div>
                <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse delay-75"></div>
                <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse delay-150"></div>
            </div>
         </div>
      </div>
      {/* INTRO TEXT (Transition Phase) */}
      <div 
        className={`absolute z-10 flex flex-col items-center justify-center text-center transition-all duration-1000 transform
          ${showLogin ? 'opacity-0 scale-150 pointer-events-none blur-xl' : (isInitializing ? 'opacity-0' : 'opacity-100 scale-100 blur-none')}
        `}
      >
        <div className="bg-black/40 backdrop-blur-sm p-8 rounded-2xl border border-cyan-300/10 shadow-2xl">
            <h1 className="text-4xl md:text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-green-400 mb-2 drop-shadow-sm font-sans">
            PlanetEye Farm AI
            </h1>
            <h2 className="text-xl md:text-2xl text-white font-mono tracking-[0.5em] font-light">
            Nearlive Crop Monitroring
            </h2>
        </div>
      </div>


      {/* === LOGIN CARD === */}
      <div 
        className={`relative z-20 w-full max-w-5xl h-[600px] rounded-2xl border border-cyan-300/20 shadow-[0_0_50px_rgba(10,25,47,0.5)] flex overflow-hidden mx-4 backdrop-blur-md transition-all duration-[1500ms] delay-200
          ${showLogin ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-32 scale-95 pointer-events-none'}
        `}
      >
        

        {/* Left Side: Visuals & Info */}
        <div className="hidden md:flex flex-col justify-between w-1/2 p-10 bg-gradient-to-br from-blue-600/90 to-[#020c1b]/90 relative">
          <div className="absolute inset-0 opacity-20" style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)',
            backgroundSize: '24px 24px'
          }}></div>
          
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 rounded-xl bg-cyan-300/10 border border-cyan-300/50 backdrop-blur-md">
                <Satellite className="w-8 h-8 text-cyan-300 animate-pulse" />
              </div>
              <div>
                <h1 className="font-mono text-2xl font-bold text-white tracking-wider">MAHA-SAT</h1>
                <p className="text-[10px] text-cyan-300 uppercase tracking-[0.3em] font-bold">Analytics Command</p>
              </div>
            </div>
            
            <p className="text-slate-200 text-sm leading-relaxed mb-8 opacity-90 font-light border-l-2 border-cyan-300/30 pl-4">
              Authorized access point for Maharashtra Land Analysis System. 
              Real-time spectral monitoring of crop health, soil moisture levels, and pest detection algorithms.
            </p>
          </div>
          <div className="relative z-10 grid grid-cols-2 gap-4">
            <FeatureBox icon={Sprout} label="Crop Growth" delay="0s" />
            <FeatureBox icon={Droplets} label="Water Uptake" delay="0.1s" />
            <FeatureBox icon={Activity} label="Soil Health" delay="0.2s" />
            <FeatureBox icon={Bug} label="Pest Detect" delay="0.3s" />
          </div>
          <div className="relative z-10 mt-auto pt-8 border-t border-white/10 flex items-center justify-center gap-2 opacity-80">
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded bg-gradient-to-tr from-green-500 to-blue-500 flex items-center justify-center text-white font-bold">
                    <Eye size={20} />
                </div>
                <span className="font-mono font-bold text-lg tracking-tight">PlanetEye <span className="font-light">Farm-AI</span></span>
            </div>
          </div>
        </div>

        {/* Right Side: Form */}
        <div className="w-full md:w-1/2 p-8 md:p-12 bg-[#020c1b]/80 backdrop-blur-xl flex flex-col justify-center relative">
           

           <div className="md:hidden flex items-center gap-3 mb-8">
              <Satellite className="w-8 h-8 text-cyan-300" />
              <h1 className="font-mono text-xl font-bold">MAHA-SAT</h1>
           </div>
           <div className="mb-8">
             <h2 className="text-3xl font-bold text-white mb-2 font-mono">LOGIN</h2>
             <p className="text-slate-400 text-sm">Enter your credentials to access the satellite feed.</p>
           </div>
           <form onSubmit={handleSubmit} className="space-y-6 relative">
             {error && (
               <div className="bg-red-900/20 border border-red-500/50 text-red-300 text-xs p-3 rounded-lg font-mono">
                 {error}
               </div>
             )}
             
             <div className="space-y-2 group">
               <label className="text-xs font-mono text-cyan-300 uppercase tracking-wider ml-1">Username</label>
               <div className="relative">
                 <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5 group-focus-within:text-cyan-300 transition-colors" />
                 <input 
                    type="text" 
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-[#050b14]/50 border border-cyan-300/20 rounded-lg py-3 pl-12 pr-4 text-white focus:border-cyan-300 focus:ring-1 focus:ring-cyan-300 outline-none transition-all placeholder:text-slate-600"
                    placeholder="Farmer_ID or Admin"
                 />
               </div>
             </div>
             <div className="space-y-2 group">
               <label className="text-xs font-mono text-cyan-300 uppercase tracking-wider ml-1">Password</label>
               <div className="relative">
                 <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5 group-focus-within:text-cyan-300 transition-colors" />
                 <input 
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-[#050b14]/50 border border-cyan-300/20 rounded-lg py-3 pl-12 pr-4 text-white focus:border-cyan-300 focus:ring-1 focus:ring-cyan-300 outline-none transition-all placeholder:text-slate-600"
                    placeholder="••••••••"
                 />
               </div>
             </div>
             <button 
               type="submit" 
               disabled={isLoginLoading}
               className={`w-full bg-cyan-300/10 hover:bg-cyan-300/20 border border-cyan-300/50 text-cyan-300 font-mono font-bold py-4 rounded-lg flex items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-[0.98] ${isLoginLoading ? 'cursor-wait opacity-80' : ''}`}
             >
               {isLoginLoading ? (
                 <>
                   <Scan className="animate-spin" />
                   ESTABLISHING UPLINK...
                 </>
               ) : (
                 <>
                   INITIATE LINK <ArrowRight className="w-5 h-5" />
                 </>
               )}
             </button>
           </form>
           <div className="mt-8 text-center">
             <p className="text-[10px] text-slate-500 font-mono">
               SECURE CONNECTION: TLS 1.3 | NODE: MUMBAI-07
             </p>
           </div>
        </div>
      </div>
    </div>
  );
};

const FeatureBox = ({ icon: Icon, label, delay }: any) => (
  <div 
    className="bg-[#020617]/40 border border-cyan-300/10 p-3 rounded-lg flex items-center gap-3 animate-fadeIn backdrop-blur-sm hover:bg-[#020617]/60 transition-colors"
    style={{ animationDelay: delay }}
  >
    <div className="p-2 bg-cyan-300/10 rounded-md">
      <Icon className="w-4 h-4 text-cyan-300" />
    </div>
    <span className="text-xs font-medium text-cyan-100">{label}</span>
  </div>
);
