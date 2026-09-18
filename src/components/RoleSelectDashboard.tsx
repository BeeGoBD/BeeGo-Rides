import React from 'react';
import { User, Car, ArrowRight, ShieldCheck, Zap } from 'lucide-react';
import { UserRole } from '../types';
import { RATE_PER_KM_TAKA } from '../services/rideSync';

interface RoleSelectDashboardProps {
  onSelectRole: (role: UserRole) => void;
}

export const RoleSelectDashboard: React.FC<RoleSelectDashboardProps> = ({ onSelectRole }) => {
  return (
    <div
      id="role-select-dashboard"
      className="w-full min-h-screen bg-black text-white flex flex-col items-center justify-center px-4 py-12"
    >
      <div className="w-full max-w-xl mx-auto">
        {/* Top Branding */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 mb-4">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Live Dispatch System • ৳{RATE_PER_KM_TAKA} Taka / km</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-2">
            Select Dashboard
          </h1>
          <p className="text-sm text-zinc-400 max-w-md mx-auto">
            Choose how you would like to continue. System generates an automatic guest ID for your session.
          </p>
        </div>

        {/* The Two Main Buttons */}
        <div className="grid grid-cols-1 gap-4 sm:gap-5">
          {/* Button 1: Continue as Guest Passenger */}
          <button
            id="continue-as-passenger-button"
            type="button"
            onClick={() => onSelectRole('passenger')}
            className="group w-full text-left p-6 rounded-2xl bg-zinc-950 hover:bg-zinc-900/90 border border-zinc-800 hover:border-zinc-700 transition-all duration-200 shadow-2xl flex items-center justify-between cursor-pointer active:scale-[0.99]"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-white text-black flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <User className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-white group-hover:text-white">
                    Continue as Guest Passenger
                  </h2>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                    Request Ride
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  Enter pickup & drop-off spots, view estimated fare in Taka, and send real-time ride request to riders.
                </p>
              </div>
            </div>
            <div className="w-9 h-9 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0 ml-3 group-hover:bg-white group-hover:text-black transition-colors">
              <ArrowRight className="w-4 h-4" />
            </div>
          </button>

          {/* Button 2: Continue as Guest Rider */}
          <button
            id="continue-as-rider-button"
            type="button"
            onClick={() => onSelectRole('rider')}
            className="group w-full text-left p-6 rounded-2xl bg-zinc-950 hover:bg-zinc-900/90 border border-zinc-800 hover:border-zinc-700 transition-all duration-200 shadow-2xl flex items-center justify-between cursor-pointer active:scale-[0.99]"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500 text-black flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Car className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-white group-hover:text-white">
                    Continue as Guest Rider
                  </h2>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-900/60">
                    Accept Rides
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  Receive live incoming ride requests, check the price, accept rides, navigate to pickup, and complete trips.
                </p>
              </div>
            </div>
            <div className="w-9 h-9 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0 ml-3 group-hover:bg-emerald-500 group-hover:text-black transition-colors">
              <ArrowRight className="w-4 h-4" />
            </div>
          </button>
        </div>

        {/* Feature info footer */}
        <div className="mt-8 pt-6 border-t border-zinc-900 text-center">
          <p className="text-xs text-zinc-500 flex items-center justify-center gap-2">
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            <span>Instant live sync across multiple browser tabs & windows</span>
          </p>
        </div>
      </div>
    </div>
  );
};
