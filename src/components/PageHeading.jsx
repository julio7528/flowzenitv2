export default function PageHeading({ className, section, titleId, title, description, children }) {
  return (
    <div className={className}>
      <div>
        <p className="demands-eyebrow">GESTÃO <span>/</span> {section}</p>
        <h1 id={titleId}>{title}</h1>
        <p className="demands-intro">{description}</p>
      </div>
      {children}
    </div>
  )
}
