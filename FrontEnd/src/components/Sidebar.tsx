import React from 'react';
import { FiX, FiMenu, FiPlus, FiUser, FiSettings, FiMessageCircle } from 'react-icons/fi';
import LG_Picto_N from '../assets/LG_Picto_N.png';
import { getEpionBrandGradient } from '@/lib/color-utils';

export default function Sidebar(): React.ReactElement {
  const [isOpen, setIsOpen] = React.useState<boolean>(true);

  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed top-4 left-4 z-50 p-2 bg-black text-white rounded-md shadow-lg"
        >
          <FiMenu size={20} />
        </button>
      )}

      {isOpen && (
        <div className="fixed top-0 left-0 h-full w-56 bg-white/30 backdrop-blur-md border-r border-white/20 shadow-xl flex flex-col transition-all duration-300">
          <div className="flex items-center justify-between p-4 border-b border-white/20">
            <div className="flex items-center space-x-2">
              <img src={LG_Picto_N} alt="Epion" className="w-8 h-8" />
              <span className="font-bold text-lg" style={{ background: getEpionBrandGradient(), WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Epion</span>
            </div>
            <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-gray-100 rounded">
              <FiX size={20} className="text-gray-900" />
            </button>
          </div>

          <div className="p-4 border-b border-white/20 hover:bg-gray-100 cursor-pointer flex items-center gap-2">
            <FiPlus className="text-[#3B82F6]" />
            <span className="text-[#3B82F6] font-bold">Nouveau chat</span>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            <ul className="p-2 space-y-2">
              <li className="p-2 rounded hover:bg-gray-100 cursor-pointer flex items-center gap-2">
                <FiUser className="text-gray-900" />
                <span className="text-gray-900">Mon compte</span>
              </li>
              <li className="p-2 rounded hover:bg-gray-100 cursor-pointer flex items-center gap-2">
                <FiSettings className="text-gray-900" />
                <span className="text-gray-900">Paramètres</span>
              </li>
              <li className="p-2 rounded hover:bg-gray-100 cursor-pointer flex items-center gap-2">
                <FiMessageCircle className="text-gray-900" />
                <span className="text-gray-900">Conversations</span>
              </li>
            </ul>
          </div>

          <div className="p-4 border-t border-white/20 text-xs text-gray-500">© 2025 Epion</div>
        </div>
      )}
    </>
  );
}
