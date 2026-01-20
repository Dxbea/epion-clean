import React from 'react';
import { X } from 'lucide-react';
import { Link } from 'react-router-dom';

interface UserItem {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
}

interface UserListModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    users: UserItem[];
    loading?: boolean;
}

export default function UserListModal({ isOpen, onClose, title, users, loading }: UserListModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Overlay */}
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Modal Content */}
            <div className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl transition-all dark:bg-neutral-900 border border-black/5 dark:border-white/10">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-black/5 p-4 dark:border-white/5">
                    <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-50">{title}</h3>
                    <button
                        onClick={onClose}
                        className="rounded-full p-2 text-neutral-400 hover:bg-black/5 hover:text-neutral-900 dark:hover:bg-white/5 dark:hover:text-neutral-50"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="max-h-[60vh] overflow-y-auto p-2">
                    {loading ? (
                        <div className="flex items-center justify-center p-8">
                            <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                        </div>
                    ) : users.length > 0 ? (
                        <div className="flex flex-col gap-1">
                            {users.map((user) => (
                                <Link
                                    key={user.id}
                                    to={`/u/${user.username || user.id}`}
                                    onClick={onClose}
                                    className="flex items-center gap-3 rounded-2xl p-3 transition hover:bg-black/5 dark:hover:bg-white/5"
                                >
                                    <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                                        {user.avatarUrl ? (
                                            <img src={user.avatarUrl} alt={user.displayName} className="h-full w-full object-cover" />
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center text-sm font-bold text-emerald-600 dark:text-emerald-400">
                                                {(user.displayName || '?').charAt(0).toUpperCase()}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-col overflow-hidden">
                                        <span className="truncate font-bold text-neutral-900 dark:text-neutral-50">
                                            {user.displayName}
                                        </span>
                                        <span className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                                            @{user.username}
                                        </span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center p-12 text-center">
                            <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                                {title === 'Followers' ? 'No followers yet' : 'Not following anyone yet'}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
