// Run with: npm run export:avatars [-- <out-dir>]   (default: ./avatars)
//
// Writes every participant's avatar as <out-dir>/<participant_id>.svg, for the
// badges' Illustrator data merge, plus an index.csv of who got what. Someone
// who never finished an avatar gets their initials instead, as in the portal,
// so every row of the badge sheet has a file to link.
import { config } from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createJiti } from 'jiti';
import pg from 'pg';

config({ path: '.env.local' });

// The portal's own component, so a badge face matches the website's.
const jiti = createJiti(import.meta.url, { jsx: { runtime: 'automatic' } });
const { HybridAvatar, hasFullAvatar } = await jiti.import('../src/app/(dashboard)/participants/hybrid-avatar.tsx');

const WIDTH = 264;
const HEIGHT = 280;

function escapeXml(text) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function avatarSvg(avatar) {
  // The component sizes itself by CSS; a file needs its own dimensions.
  return renderToStaticMarkup(createElement(HybridAvatar, { avatar })).replace(
    /^<svg /,
    `<svg width="${WIDTH}" height="${HEIGHT}" `,
  );
}

/** The portal's initials circle, on the avatar's artboard. */
function initialsSvg(name, lastName) {
  const initials = escapeXml(`${name.trim().charAt(0)}${lastName.trim().charAt(0)}`.toUpperCase());
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="initials-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#51e5af"/>
      <stop offset="1" stop-color="#8dffd2"/>
    </linearGradient>
  </defs>
  <circle cx="132" cy="160" r="120" fill="url(#initials-bg)"/>
  <text x="132" y="160" dy="0.35em" text-anchor="middle" fill="#07120e" font-family="'Host Grotesk', Arial, sans-serif" font-size="86" font-weight="700" letter-spacing="3">${initials}</text>
</svg>`;
}

function csvCell(value) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

const outDir = resolve(process.argv[2] ?? 'avatars');
await mkdir(outDir, { recursive: true });

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const { rows } = await client.query(
  `select p.id, u.name, u."lastName" as last_name, u.avatar
     from participants p
     join users u on u.id = p.user_id
    order by u.name, u."lastName"`,
);
await client.end();

const index = ['participant_id,name,last_name,kind,file'];
let drawn = 0;
for (const row of rows) {
  const full = hasFullAvatar(row.avatar);
  const svg = full ? avatarSvg(row.avatar) : initialsSvg(row.name, row.last_name);
  const file = `${row.id}.svg`;
  await writeFile(resolve(outDir, file), `<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n`);
  if (full) drawn++;
  index.push([row.id, row.name, row.last_name, full ? 'avatar' : 'initials', file].map(csvCell).join(','));
}
await writeFile(resolve(outDir, 'index.csv'), `${index.join('\n')}\n`);

console.log(`${rows.length} participants: ${drawn} avatars, ${rows.length - drawn} initials. Written to ${outDir}`);
