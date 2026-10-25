import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

export const createDeviceSecret = async () => {
  const secret = randomBytes(32).toString('base64url');
  const salt = randomBytes(16).toString('hex');
  const key = await scryptAsync(secret, salt, KEY_LENGTH);

  return {
    secret,
    hash: `${salt}:${key.toString('hex')}`
  };
};

export const verifyDeviceSecret = async (secret, storedHash) => {
  const [salt, expectedHex, extra] = storedHash.split(':');

  if (!salt || !expectedHex || extra || expectedHex.length !== KEY_LENGTH * 2) {
    return false;
  }

  const expected = Buffer.from(expectedHex, 'hex');

  if (expected.length !== KEY_LENGTH) {
    return false;
  }

  const actual = await scryptAsync(secret, salt, KEY_LENGTH);
  return timingSafeEqual(actual, expected);
};
