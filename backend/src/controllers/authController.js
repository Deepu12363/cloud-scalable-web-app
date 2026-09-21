import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const safeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt
});

const createToken = (userId) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }

  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1d' });
};

export const register = async (req, res) => {
  const { name, email, password } = req.body;

  if (!name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ message: 'Name, email, and password are required' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (!emailPattern.test(normalizedEmail)) {
    return res.status(400).json({ message: 'Please provide a valid email address' });
  }

  if (password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters long' });
  }

  try {
    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      return res.status(409).json({ message: 'Email is already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword
    });

    return res.status(201).json({ user: safeUser(user) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Email is already registered' });
    }

    console.error(`Registration failed: ${error.message}`);
    return res.status(500).json({ message: 'Unable to register user' });
  }
};

export const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email?.trim() || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (!emailPattern.test(normalizedEmail)) {
    return res.status(400).json({ message: 'Please provide a valid email address' });
  }

  try {
    const user = await User.findOne({ email: normalizedEmail }).select('+password');
    const passwordMatches = user && await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    return res.json({
      token: createToken(user._id.toString()),
      user: safeUser(user)
    });
  } catch (error) {
    console.error(`Login failed: ${error.message}`);
    return res.status(500).json({ message: 'Unable to log in' });
  }
};

export const getMe = (req, res) => {
  return res.json({ user: safeUser(req.user) });
};

const hashResetToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const genericResetMessage = 'If an account exists for this email, password reset instructions have been generated.';

export const forgotPassword = async (req, res) => {
  const { email } = req.body;

  if (!email?.trim() || !emailPattern.test(email.trim().toLowerCase())) {
    return res.status(400).json({ message: 'Please provide a valid email address' });
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail }).select('+resetPasswordToken +resetPasswordExpires');

    if (user) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      user.resetPasswordToken = hashResetToken(resetToken);
      user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000);
      await user.save();

      if (process.env.NODE_ENV === 'development') {
        const resetUrlBase = process.env.RESET_URL_BASE || 'http://localhost:5173';
        console.log(`[development only] Password reset URL (expires in 15 minutes): ${resetUrlBase}/reset-password/${resetToken}`);
      }
    }

    return res.json({ message: genericResetMessage });
  } catch (error) {
    console.error(`Password reset request failed: ${error.message}`);
    return res.status(500).json({ message: genericResetMessage });
  }
};

export const resetPassword = async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ message: 'Reset token and new password are required' });
  }

  if (password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters long' });
  }

  try {
    const user = await User.findOne({
      resetPasswordToken: hashResetToken(token),
      resetPasswordExpires: { $gt: new Date() }
    }).select('+resetPasswordToken +resetPasswordExpires');

    if (!user) {
      return res.status(400).json({ message: 'Reset token is invalid or expired' });
    }

    user.password = await bcrypt.hash(password, 12);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    return res.json({ message: 'Password reset successful. Please sign in.' });
  } catch (error) {
    console.error(`Password reset failed: ${error.message}`);
    return res.status(500).json({ message: 'Unable to reset password' });
  }
};