import React from 'react';

interface InstagramLogoProps {
  className?: string;
  size?: number;
}

/**
 * Logotipo oficial vetorial do Instagram com o gradiente característico
 * (amarelo/laranja, vermelho/rosa e roxo/azul).
 */
export function InstagramLogo({ className = 'h-4 w-4', size = 16 }: InstagramLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <radialGradient id="ig-grad" r="150%" cx="30%" cy="107%">
          <stop stopColor="#fdf497" offset="0%" />
          <stop stopColor="#fdf497" offset="5%" />
          <stop stopColor="#fd5949" offset="45%" />
          <stop stopColor="#d6249f" offset="60%" />
          <stop stopColor="#285AEB" offset="90%" />
        </radialGradient>
      </defs>
      <rect width="24" height="24" rx="6.5" fill="url(#ig-grad)" />
      {/* Outer camera outline */}
      <rect
        x="3.5"
        y="3.5"
        width="17"
        height="17"
        rx="4.8"
        stroke="#FFFFFF"
        strokeWidth="1.8"
        fill="none"
      />
      {/* Center camera lens */}
      <circle
        cx="12"
        cy="12"
        r="4.2"
        stroke="#FFFFFF"
        strokeWidth="1.8"
        fill="none"
      />
      {/* Flash dot */}
      <circle cx="16.75" cy="7.25" r="1.1" fill="#FFFFFF" />
    </svg>
  );
}
