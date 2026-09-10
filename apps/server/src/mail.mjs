/**
 * Outbound email. One transport, configured by SMTP_URL
 * (smtps://user:pass@host:465) and MAIL_FROM. Without SMTP_URL nothing is
 * sent; the caller records the attempt so the communication log (IPS
 * 21(2)(a)) still shows what was prepared and for whom.
 */

import nodemailer from 'nodemailer';

export const mailConfigured = () => !!process.env.SMTP_URL;

export async function sendMail({ to, subject, html, text, attachments = [] }) {
  if (!mailConfigured()) return { sent: false, reason: 'SMTP_URL not configured' };
  const transport = nodemailer.createTransport(process.env.SMTP_URL);
  const from = process.env.MAIL_FROM ?? 'compliancecertifier@assuresafety.co.nz';
  const info = await transport.sendMail({ from, to, subject, html, text, attachments });
  return { sent: true, messageId: info.messageId, from };
}
