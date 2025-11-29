import { Link } from 'react-router-dom';

export default function NavButton({ to, children, className = '' }) {
  return (
    <Link to={to}>
<button
  className={`flex items-center justify-center bg-black border-[0.5em] border-black rounded-[0.5em] text-[#FAFAF5] mx-[2%] cursor-pointer ${className}`}
  style={{
    height: '4vw',
    width: '20vw',
    fontSize: '1.5vw',
    fontFamily: "'thermal-variable', sans-serif",
    boxSizing: 'border-box',
  }}
>
  {children}
</button>

    </Link>
  );
}
