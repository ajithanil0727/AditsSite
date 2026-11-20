/**
 * SEED_MODE=production: only the real setup (organisation, branches, number series, permissions, roles,
 * masters, ADITS courses and website content) plus one super admin from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD.
 * No demo users, students, job cards, money entries or staff. Anything else = development demo data.
 */
export const DEMO = process.env.SEED_MODE !== "production";
