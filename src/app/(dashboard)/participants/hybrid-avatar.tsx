'use client';

import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { Avatar as AvatarSvg, OptionContext, OptionsContext, allOptions } from '@gschoppe/avataaars';

/*
 * The participant's avatar as the main website draws it: an avataaars human
 * with its right half replaced by a robot. Ported from the main site's
 * components/HybridAvatar.tsx and lib/avatar.ts (IEEE-INSAT/TRSYP3.0), so a
 * face looks the same in both places — change them together.
 */

/** The main site's AvatarConfig, stored as JSON in users.avatar. */
export type AvatarConfig = {
  avatarStyle: 'Circle' | 'Transparent';
  topType: string;
  accessoriesType: string;
  hatColor: string;
  hairColor: string;
  facialHairType: string;
  facialHairColor: string;
  clotheType: string;
  clotheColor: string;
  graphicType: string;
  eyeType: string;
  eyebrowType: string;
  mouthType: string;
  skinColor: string;
  robotColor: 'Cobalt' | 'Ember' | 'Jade' | 'Violet' | 'Graphite';
  robotEyes: 'Dual' | 'Mono' | 'Sensor';
  robotMouth: 'Speaker' | 'Smile' | 'Signal';
  robotAntenna: 'Single' | 'Twin' | 'None';
  robotAccessory: 'None' | 'Halo' | 'Visor';
  robotBackground: 'Aurora' | 'Sunset' | 'Mint' | 'Lavender' | 'Night';
};

/**
 * Only an avatar carrying both halves counts — the main site's own rule, so
 * a half-finished one falls back to initials here as it does there.
 */
export function hasFullAvatar(value: unknown): value is AvatarConfig {
  return !!value && typeof value === 'object' && 'topType' in value && 'robotColor' in value;
}

const PALETTES = {
  Cobalt: { main: '#3867d6', shadow: '#233b83', glow: '#82e9ff' },
  Ember: { main: '#e56b3f', shadow: '#9e3127', glow: '#ffcf66' },
  Jade: { main: '#22a67a', shadow: '#126052', glow: '#8dffd2' },
  Violet: { main: '#8354c7', shadow: '#4c287e', glow: '#e6a6ff' },
  Graphite: { main: '#56616f', shadow: '#29313b', glow: '#b7f4ff' },
} as const;

const HUMAN_OPTION_KEYS = [
  'topType',
  'accessoriesType',
  'hatColor',
  'hairColor',
  'facialHairType',
  'facialHairColor',
  'clotheType',
  'clotheColor',
  'graphicType',
  'eyeType',
  'eyebrowType',
  'mouthType',
  'skinColor',
] as const;

function HumanAvatar({ avatar, uid }: { avatar: AvatarConfig; uid: string }) {
  // The package's default component memoizes a mutable context and calls
  // setData during render; a fresh, fully populated context per render has no
  // mounted listeners to notify, so a parent re-render stays safe.
  const context = new OptionContext(allOptions);
  const data: Record<string, string> = {
    backdropType: avatar.avatarStyle === 'Transparent' ? 'NoBackdrop' : 'Circle',
  };
  for (const key of HUMAN_OPTION_KEYS) data[key] = avatar[key];
  context.setData(data);

  return (
    <OptionsContext.Provider value={context}>
      <AvatarSvg uid={uid} style={{ width: '264px', height: '280px' }} />
    </OptionsContext.Provider>
  );
}

function HybridAvatar({ avatar, className }: { avatar: AvatarConfig; className?: string }) {
  const palette = PALETTES[avatar.robotColor] ?? PALETTES.Cobalt;
  const instanceId = useId().replace(/:/g, '');
  const shellGradientId = `${instanceId}-hybrid-shell`;
  const robotClipId = `${instanceId}-hybrid-robot-face`;

  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 264 280" aria-hidden focusable="false">
      <defs>
        <linearGradient id={shellGradientId} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor={palette.main} />
          <stop offset="1" stopColor={palette.shadow} />
        </linearGradient>
        <clipPath id={robotClipId}>
          <path d="M132 36c30.928 0 56 25.072 56 56v6.166c5.675.952 10 5.888 10 11.834v14c0 6.052-4.48 11.058-10.305 11.881-2.067 19.806-14.458 36.542-31.695 44.73-5 2-13 3-24 3V36z" />
        </clipPath>
      </defs>
      <HumanAvatar avatar={avatar} uid={`${instanceId}-human`} />
      <g clipPath={`url(#${robotClipId})`}>
        <rect x="128" y="32" width="74" height="153" fill={`url(#${shellGradientId})`} />
        <path d="M132 44c25 4 45 24 49 49" fill="none" stroke="white" strokeWidth="5" opacity=".18" />
        <rect x="126" y="95" width="71" height="42" rx="20" fill="#17202d" />
        {avatar.robotEyes === 'Mono' ? (
          <rect x="142" y="108" width="43" height="14" rx="7" fill={palette.glow} />
        ) : avatar.robotEyes === 'Sensor' ? (
          <>
            <circle cx="166" cy="116" r="13" fill={palette.glow} />
            <circle cx="166" cy="116" r="5" fill="#fff" />
          </>
        ) : (
          <>
            <circle cx="165" cy="116" r="10" fill={palette.glow} />
            <circle cx="165" cy="116" r="3" fill="#fff" />
          </>
        )}
        {avatar.robotMouth === 'Smile' ? (
          <path d="M136 153c8 9 18 10 29 1" fill="none" stroke={palette.glow} strokeWidth="5" strokeLinecap="round" />
        ) : avatar.robotMouth === 'Signal' ? (
          <g fill={palette.glow}>
            <rect x="140" y="153" width="5" height="9" rx="2" />
            <rect x="150" y="149" width="5" height="17" rx="2" />
            <rect x="160" y="145" width="5" height="25" rx="2" />
          </g>
        ) : (
          <g stroke={palette.glow} strokeWidth="4" strokeLinecap="round">
            <path d="M139 152h27" />
            <path d="M143 160h23" />
          </g>
        )}
        <rect x="188" y="105" width="12" height="30" rx="6" fill={palette.shadow} />
        <circle cx="193" cy="120" r="4" fill={palette.glow} />
      </g>
    </svg>
  );
}

/**
 * The participant's face in a circle: their avatar when they have made one,
 * their initials otherwise — and while the full record is still loading. An
 * avatar opens larger on click, so it can actually be made out.
 */
export function ParticipantAvatar({
  avatar,
  name,
  lastName,
}: {
  avatar: unknown;
  name: string;
  lastName: string;
}) {
  const [zoomed, setZoomed] = useState(false);

  if (hasFullAvatar(avatar)) {
    return (
      <>
        <button
          type="button"
          className="p-avatar p-avatar--button"
          onClick={() => setZoomed(true)}
          aria-label={`View ${name} ${lastName}'s avatar larger`}
        >
          <HybridAvatar avatar={avatar} className="p-avatar-art" />
        </button>
        {zoomed && (
          <AvatarZoom avatar={avatar} caption={`${name} ${lastName}`} onClose={() => setZoomed(false)} />
        )}
      </>
    );
  }

  return (
    <span className="p-avatar p-avatar--initials" aria-hidden>
      {`${name.charAt(0)}${lastName.charAt(0)}`.toUpperCase()}
    </span>
  );
}

/**
 * The avatar, large, over everything. Rendered into <body>: the details popup
 * animates with a transform, which would otherwise trap a fixed overlay
 * inside it. Any click or Escape closes it and leaves the popup open.
 */
function AvatarZoom({ avatar, caption, onClose }: { avatar: AvatarConfig; caption: string; onClose: () => void }) {
  useEffect(() => {
    // Captured and stopped here, so Escape closes only the zoom — not the
    // details popup underneath, which listens for the same key.
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.stopImmediatePropagation();
      onClose();
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  return createPortal(
    <div className="p-avatar-zoom" role="dialog" aria-modal="true" aria-label={`${caption}'s avatar`} onClick={onClose}>
      <figure className="p-avatar-zoom-figure">
        <span className="p-avatar p-avatar--zoomed">
          <HybridAvatar avatar={avatar} className="p-avatar-art" />
        </span>
        <figcaption>{caption}</figcaption>
      </figure>
      <button type="button" className="p-avatar-zoom-close" onClick={onClose} aria-label="Close" autoFocus>
        &times;
      </button>
    </div>,
    document.body,
  );
}
