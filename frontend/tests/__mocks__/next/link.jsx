// Mock for next/link
export default function Link({ href, children, className, ...rest }) {
  return (
    <a href={href} className={className} {...rest}>
      {children}
    </a>
  );
}
