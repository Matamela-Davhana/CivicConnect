// Keep this element mounted: live regions only announce text that changes inside an existing region.
export default function Notice({ message, variant = 'success' }) {
  return (
    <div role={variant === 'error' ? 'alert' : 'status'} className={message ? `alert alert--${variant}` : undefined}>
      {message}
    </div>
  )
}
