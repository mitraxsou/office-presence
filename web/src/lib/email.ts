export function isPwcEmail(email: string): boolean {
  return /^[^\s@]+@pwc\.com$/i.test(email.trim());
}
