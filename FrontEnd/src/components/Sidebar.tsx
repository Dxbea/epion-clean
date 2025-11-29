import React from 'react';
import { FiX, FiMenu, FiPlus, FiUser, FiSettings, FiMessageCircle } from 'react-icons/fi';
import LG_Picto_N from '../assets/LG_Picto_N.png';

export default function Sidebar(): React.ReactElement {
  const [isOpen, setIsOpen] = React.useState<boolean>(true);

  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed top-4 left-4 z-50 p-2 bg-blue-500 text-white rounded-md shadow-lg"
        >
          <FiMenu size={20} />
        </button>
      )}

      {isOpen && (
        <div className="fixed top-0 left-0 h-full w-56 bg-white/30 backdrop-blur-md border-r border-white/20 shadow-xl flex flex-col transition-all duration-300">
          <div className="flex items-center justify-between p-4 border-b border-white/20">
            <div className="flex items-center space-x-2">
              <img src={LG_Picto_N} alt="Epion" className="w-8 h-8" />
              <span className="font-bold text-lg text-blue-600">Epion</span>
            </div>
            <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-blue-100 rounded">
              <FiX size={20} className="text-blue-600" />
            </button>
          </div>

          <div className="p-4 border-b border-white/20 hover:bg-blue-100 cursor-pointer flex items-center gap-2">
            <FiPlus className="text-blue-600" />
            <span className="text-blue-600 font-medium">Nouveau chat</span>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            <ul className="p-2 space-y-2">
              <li className="p-2 rounded hover:bg-blue-100 cursor-pointer flex items-center gap-2">
                <FiUser className="text-blue-600" />
                Mon compte
              </li>
              <li className="p-2 rounded hover:bg-blue-100 cursor-pointer flex items-center gap-2">
                <FiSettings className="text-blue-600" />
                Paramètres
              </li>
              <li className="p-2 rounded hover:bg-blue-100 cursor-pointer flex items-center gap-2">
                <FiMessageCircle className="text-blue-600" />
                Conversations
              </li>
            </ul>
          </div>

          <div className="p-4 border-t border-white/20 text-xs text-gray-500">© 2025 Epion</div>
        </div>
      )}
    </>
  );
}
