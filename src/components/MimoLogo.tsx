export default function MimoLogo({ size = 200 }: { size?: number }) {
  return (
    <img
      src="/mimo_logo.png"
      alt="Mimo"
      width={size}
      style={{ objectFit: 'contain' }}
      draggable={false}
    />
  )
}
