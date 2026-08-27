interface IconProps {
  size?: number;
  className?: string;
}

/**
 * Inline icons. Kept as components rather than a font or sprite sheet so they
 * inherit `currentColor` and never flash unstyled.
 */
const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false as const,
});

export const IconClose = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export const IconSwitchCamera = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M15 5h2a3 3 0 0 1 3 3v6" />
    <path d="m17 12 3 3 3-3" transform="translate(-3 -1)" />
    <path d="M9 19H7a3 3 0 0 1-3-3v-6" />
    <path d="m4 12-1 1 1 1" transform="translate(0 -3)" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const IconSparkle = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7Z" />
  </svg>
);

export const IconSticker = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M20 12a8 8 0 1 0-8 8c1 0 8-7 8-8Z" />
    <path d="M12.5 20c0-4 3.5-7.5 7.5-7.5" />
    <circle cx="9.5" cy="10" r="1" fill="currentColor" />
    <circle cx="14.5" cy="10" r="1" fill="currentColor" />
  </svg>
);

export const IconDownload = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M12 4v11" />
    <path d="m7 11 5 5 5-5" />
    <path d="M5 19h14" />
  </svg>
);

export const IconShare = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M12 16V4" />
    <path d="m8 8 4-4 4 4" />
    <path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
  </svg>
);

export const IconRetake = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M4 12a8 8 0 1 0 2.5-5.8" />
    <path d="M4 4v5h5" />
  </svg>
);

export const IconSettings = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2.2M12 18.8V21M4.2 7.5l1.9 1.1M17.9 15.4l1.9 1.1M4.2 16.5l1.9-1.1M17.9 8.6l1.9-1.1" />
  </svg>
);

export const IconHand = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M8 12V6a1.5 1.5 0 0 1 3 0v5" />
    <path d="M11 11V5a1.5 1.5 0 0 1 3 0v6" />
    <path d="M14 11V7a1.5 1.5 0 0 1 3 0v6" />
    <path d="M8 12v-1a1.5 1.5 0 0 0-3 0v4a6 6 0 0 0 6 6h1a5 5 0 0 0 5-5v-4" />
  </svg>
);

export const IconText = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M5 6V5h14v1" />
    <path d="M12 5v14" />
    <path d="M9 19h6" />
  </svg>
);

export const IconLayout = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="4" y="3" width="16" height="7" rx="2" />
    <rect x="4" y="14" width="16" height="7" rx="2" />
  </svg>
);

export const IconPalette = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 1.4-2-.7-1.2.2-2.4 1.6-2.4H17a4 4 0 0 0 4-4c0-5-4-9.6-9-9.6Z" />
    <circle cx="8" cy="11" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="8" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="16" cy="10.5" r="1.1" fill="currentColor" stroke="none" />
  </svg>
);

export const IconTrash = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M4 7h16" />
    <path d="M9 7V5h6v2" />
    <path d="M6 7l1 13h10l1-13" />
  </svg>
);

export const IconCopy = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" />
  </svg>
);

export const IconForward = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="4" y="4" width="12" height="12" rx="2" />
    <path d="M8 20h10a2 2 0 0 0 2-2V8" />
  </svg>
);

export const IconBackward = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 4H6a2 2 0 0 0-2 2v10" />
  </svg>
);

export const IconPlus = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconCheck = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="m5 13 4 4L19 7" />
  </svg>
);

export const IconChevronRight = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="m9 5 7 7-7 7" />
  </svg>
);

export const IconChevronLeft = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="m15 5-7 7 7 7" />
  </svg>
);

export const IconSoundOn = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M5 9v6h3l4 4V5L8 9H5Z" />
    <path d="M16 9a4 4 0 0 1 0 6" />
  </svg>
);

export const IconSoundOff = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M5 9v6h3l4 4V5L8 9H5Z" />
    <path d="m16 10 4 4M20 10l-4 4" />
  </svg>
);

export const IconUpload = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M12 16V5" />
    <path d="m8 9 4-4 4 4" />
    <path d="M5 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
  </svg>
);

/** The booth's own mark — three stacked frames, matching the strip footer. */
export const Logo = ({ size = 28, className }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    className={className}
    aria-hidden
    focusable={false}
  >
    <rect x="5" y="3" width="14" height="5" rx="1.6" fill="currentColor" opacity="0.85" />
    <rect x="5" y="9.5" width="14" height="5" rx="1.6" fill="var(--accent)" />
    <rect x="5" y="16" width="14" height="5" rx="1.6" fill="currentColor" opacity="0.85" />
  </svg>
);
