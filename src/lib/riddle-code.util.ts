import * as crypto from 'crypto';

/**
 * Encodes (teamCode, riddleNumber) into a short 7-character alphanumeric code,
 * using the SAME unambiguous alphabet as the team codes themselves
 * (ABCDEFGHJKLMNPQRSTUVWXYZ23456789 — no 0/O/1/I/L), so it looks and feels
 * like the same kind of code your teams already have.
 *
 * No extra DB column needed: team codes are 6 chars in a 33-symbol alphabet,
 * so there are 33^6 (~1.29 billion) possible team codes, times 3 riddles =
 * ~3.87 billion combinations. A 7-char code in the same alphabet has
 * 33^7 (~42.6 billion) possible values — comfortably bigger — so encrypting
 * the actual team-code text (rather than a synthetic small integer) is still
 * collision-free.
 *
 * Mechanism: a Feistel network using modular addition (rather than XOR, since
 * the domain isn't a power of two) plus cycle-walking to stay inside the
 * exact domain size. This is the same family of technique NIST's FF1/FF3
 * format-preserving-encryption standards use for arbitrary-radix domains.
 */

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // same 33 symbols as team code generation
const RADIX = ALPHABET.length; // 33
const TEAM_CODE_LENGTH = 6;
const OUTPUT_LENGTH = 7;

const TEAM_CODE_SPACE = RADIX ** TEAM_CODE_LENGTH; // 33^6 ≈ 1.29 billion
const RIDDLE_COUNT = 3;
const DOMAIN = TEAM_CODE_SPACE * RIDDLE_COUNT; // ~3.87 billion — exact number of valid (team, riddle) pairs

// Split DOMAIN into two roughly-equal "wheels" for the Feistel halves.
const A = Math.ceil(Math.sqrt(DOMAIN));
const B = Math.ceil(DOMAIN / A);
const ROUNDS = 4;

function getSecret(): string {
  const secret = process.env.RIDDLE_CODE_SECRET;
  if (!secret) throw new Error('RIDDLE_CODE_SECRET is not set');
  return secret;
}

/** Deterministic pseudorandom integer in [0, modulus), keyed by secret. */
function roundFn(secret: string, round: number, half: number, modulus: number): number {
  const digest = crypto.createHmac('sha256', secret).update(`${round}:${half}`).digest();
  // Use enough bytes to stay well above `modulus` before reducing, to avoid modulo bias.
  const value = digest.readUInt32BE(0) * 2 ** 8 + digest[4];
  return value % modulus;
}

/** One Feistel pass over [0, A*B) using modular addition. A bijection. */
function feistelForward(x: number): number {
  const secret = getSecret();
  let l = Math.floor(x / B); // in [0, A)
  let r = x % B; // in [0, B)
  for (let round = 0; round < ROUNDS; round++) {
    if (round % 2 === 0) {
      r = (r + roundFn(secret, round, l, B)) % B;
    } else {
      l = (l + roundFn(secret, round, r, A)) % A;
    }
  }
  return l * B + r;
}

/** Exact inverse of feistelForward(). */
function feistelBackward(y: number): number {
  const secret = getSecret();
  let l = Math.floor(y / B);
  let r = y % B;
  for (let round = ROUNDS - 1; round >= 0; round--) {
    if (round % 2 === 0) {
      r = (r - roundFn(secret, round, l, B) + B) % B;
    } else {
      l = (l - roundFn(secret, round, r, A) + A) % A;
    }
  }
  return l * B + r;
}

function encryptIndex(index: number): number {
  let y = feistelForward(index);
  while (y >= DOMAIN) {
    y = feistelForward(y);
  }
  return y;
}

function decryptIndex(value: number): number {
  let x = feistelBackward(value);
  while (x >= DOMAIN) {
    x = feistelBackward(x);
  }
  return x;
}

/** Parses a fixed-length string in ALPHABET into its base-33 integer value. Throws on invalid chars. */
function codeToInt(code: string, expectedLength: number): number {
  if (code.length !== expectedLength) {
    throw new Error(`Expected a ${expectedLength}-character code, got "${code}"`);
  }
  let value = 0;
  for (const char of code) {
    const digit = ALPHABET.indexOf(char);
    if (digit === -1) {
      throw new Error(`Invalid character "${char}" — not in the allowed alphabet`);
    }
    value = value * RADIX + digit;
  }
  return value;
}

/** Formats an integer as a fixed-length string in ALPHABET (left-padded with ALPHABET[0]). */
function intToCode(value: number, length: number): string {
  let remaining = value;
  const chars: string[] = [];
  for (let i = 0; i < length; i++) {
    chars.unshift(ALPHABET[remaining % RADIX]);
    remaining = Math.floor(remaining / RADIX);
  }
  return chars.join('');
}

export interface DecodedRiddleCode {
  teamCode: string;
  riddleNumber: number;
}

/** Encodes (teamCode, riddleNumber) into a 7-character code, e.g. "K3Q9RXZ". */
export function encodeRiddleCode(teamCode: string, riddleNumber: 1 | 2 | 3): string {
  const normalized = teamCode.toUpperCase();
  const teamValue = codeToInt(normalized, TEAM_CODE_LENGTH);
  const index = teamValue * RIDDLE_COUNT + (riddleNumber - 1);
  const encrypted = encryptIndex(index);
  return intToCode(encrypted, OUTPUT_LENGTH);
}

/** Decodes a code back to (teamCode, riddleNumber), or null if it's not a valid code. */
export function decodeRiddleCode(code: string): DecodedRiddleCode | null {
  const normalized = code.toUpperCase();
  if (normalized.length !== OUTPUT_LENGTH) return null;

  let encrypted: number;
  try {
    encrypted = codeToInt(normalized, OUTPUT_LENGTH);
  } catch {
    return null; // contains a character outside the alphabet
  }

  if (encrypted >= A * B) return null; // outside the permutation's working domain entirely

  try {
    const index = decryptIndex(encrypted);
    const riddleNumber = (index % RIDDLE_COUNT) + 1;
    const teamValue = Math.floor(index / RIDDLE_COUNT);
    if (teamValue < 0 || teamValue >= TEAM_CODE_SPACE) return null;
    const teamCode = intToCode(teamValue, TEAM_CODE_LENGTH);
    return { teamCode, riddleNumber };
  } catch {
    return null;
  }
}
