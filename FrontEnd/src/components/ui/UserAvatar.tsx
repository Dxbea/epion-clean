import React from 'react'

type Props = {
  src?: string | null
  name?: string
  size?: number // px
  className?: string
}

function getInitials(name?: string){
  if (!name) return 'U'
  const parts = name.trim().split(/\s+/).slice(0,2)
  return parts.map(p=>p[0]?.toUpperCase()).join('') || 'U'
}

export default function UserAvatar({ src, name, size = 32, className = '' }: Props){
  const style = { width: size, height: size }
  return (
    <div className={`relative inline-flex items-center justify-center overflow-hidden rounded-full bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 ${className}`} style={style}>
      {src ? (
        <img src={src} alt={name || 'avatar'} className="h-full w-full object-cover" />
      ) : (
        <span className="text-xs font-semibold leading-none">{getInitials(name)}</span>
      )}
    </div>
  )
}
