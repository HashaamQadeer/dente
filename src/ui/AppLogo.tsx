import toothIconUrl from '../assets/tooth-icon.svg?url'

type AppLogoProps = {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = {
  sm: 'size-9 rounded-xl',
  md: 'size-14 rounded-2xl',
  lg: 'size-20 rounded-3xl',
}

export function AppLogo({ size = 'sm', className = '' }: AppLogoProps) {
  return (
    <img
      src={toothIconUrl}
      alt="Dente"
      className={`${sizes[size]} object-cover shadow-sm ${className}`}
    />
  )
}
