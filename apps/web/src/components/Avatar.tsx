interface AvatarProps {
  size?: number
  className?: string
}

export default function Avatar({ size = 40, className = '' }: AvatarProps) {
  return (
    <div
      className={`rounded-full overflow-hidden flex items-center justify-center font-bold text-white flex-shrink-0 ${className}`}
      style={{ width: size, height: size, background: 'var(--nz-navy)', fontSize: size * 0.35 }}
    >
      <img
        src="/images/bryan-wilson-avatar.jpg"
        alt="Bryan Wilson"
        style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = 'none'
          const parent = e.currentTarget.parentElement
          if (parent) parent.textContent = 'BW'
        }}
      />
    </div>
  )
}
