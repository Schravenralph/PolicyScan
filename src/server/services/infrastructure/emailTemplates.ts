/**
 * Email Templates
 * 
 * Templates for various email types (password reset, notifications, etc.)
 */

export interface PasswordResetEmailData {
  resetLink: string;
  userName?: string;
  expirationHours?: number;
}

/**
 * Generate password reset email content
 */
export function generatePasswordResetEmail(data: PasswordResetEmailData): { text: string; html: string } {
  const { resetLink, userName, expirationHours = 1 } = data;
  const userNameText = userName ? ` ${userName}` : '';

  const text = `
Hello${userNameText},

You requested to reset your password for your Beleidsscan account.

Click the link below to reset your password:
${resetLink}

This link will expire in ${expirationHours} hour${expirationHours !== 1 ? 's' : ''}.

If you did not request a password reset, please ignore this email. Your password will remain unchanged.

Best regards,
The Beleidsscan Team
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset - Beleidsscan</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin-bottom: 20px;">
    <h1 style="color: #2c3e50; margin-top: 0;">Password Reset Request</h1>
  </div>
  
  <p>Hello${userNameText},</p>
  
  <p>You requested to reset your password for your Beleidsscan account.</p>
  
  <p style="margin: 30px 0;">
    <a href="${resetLink}" 
       style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
      Reset Password
    </a>
  </p>
  
  <p style="color: #666; font-size: 14px;">
    Or copy and paste this link into your browser:<br>
    <a href="${resetLink}" style="color: #007bff; word-break: break-all;">${resetLink}</a>
  </p>
  
  <p style="color: #666; font-size: 14px;">
    This link will expire in <strong>${expirationHours} hour${expirationHours !== 1 ? 's' : ''}</strong>.
  </p>
  
  <p style="color: #999; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
    If you did not request a password reset, please ignore this email. Your password will remain unchanged.
  </p>
  
  <p style="margin-top: 30px;">
    Best regards,<br>
    <strong>The Beleidsscan Team</strong>
  </p>
</body>
</html>
  `.trim();

  return { text, html };
}
